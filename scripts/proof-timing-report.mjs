#!/usr/bin/env node
// The proof timing report of the CI runners from the `ZOLANA_TIMING {json}`
// lines of the `fresh` and `restart` runs of
// examples/browser/scripts/proof-timing.mjs, laid out as the mobile SDK's.
//
//   node scripts/proof-timing-report.mjs --logs DIR [--repo OWNER/NAME] [--after TEXT]
//     [--summary FILE] [--flag 25]
//
// DIR holds a directory per runner, `<label>/`, with its timing logs (`*.log`),
// the harness's runner.json and, in CI, baseline.json: the runner's last entry
// in the history of `main` ({commit, date, runner, report}). The script writes
// `<label>/report.json` and prints the report: the proof time by runner, then
// each runner's tables. In those, rows are the client's four scenarios and
// then the stages, columns the shapes, transfers (`8x2`) and then merges
// (`merge-24x1`); a scenario cell is the total, with the download in brackets
// when there was one, or `failed`. With a baseline, each row comes twice,
// `before` (the baseline) and `after` (these logs) with the change, marked past
// the flag percent; --after names this commit.
import { appendFileSync, readdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

export const ROWS = [
  ["first run, including download", "fresh", "first"],
  ["warm", "fresh", "rest"],
  ["first run after restart", "restart", "first"],
  ["repeated after restart", "restart", "rest"],
];
// The proof's verification stays in report.json but out of the tables: it is
// a check of the prover, not a cost of proving.
const STAGES = ["load_ms", "witness_ms", "prove_ms"];
// A change in time below this is not reported: a witness of 1 ms against
// 3 ms is +200 % of nothing.
const LEAST_CHANGE_MS = 50;
// Two runs of one commit on hosted runners differ by up to about 30 % (#27:
// Linux 8 → 2 +25 %, Windows 24 → 2 -26 %, macOS 8 → 2 -28 %).
export const FLAG = 35;
// The runners in the order the report lists them; others follow by name.
const ORDER = ["chrome-linux", "chrome-windows", "chrome-macos"];
const SYSTEMS = { linux: "Linux", macos: "macOS", windows: "Windows" };
const LINE = /ZOLANA_TIMING (\{.*\})/u;

export function records(text) {
  return text
    .split("\n")
    .map((line) => LINE.exec(line))
    .filter(Boolean)
    .map((match) => JSON.parse(match[1]));
}

function median(values) {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

const parts = (shape) => [shape.startsWith("merge-") ? 1 : 0, ...shape.replace("merge-", "").split("x").map(Number)];

export const byShape = (a, b) => {
  const [am, ai, ao] = parts(a);
  const [bm, bi, bo] = parts(b);
  return am - bm || ai - bi || ao - bo;
};

export const heading = (shape) => {
  const [merge, inputs, outputs] = parts(shape);
  return `${merge ? "merge " : ""}${String(inputs)} → ${String(outputs)}`;
};

export function report(lines) {
  const found = lines.filter((r) => r.error === undefined);
  const shapes = [...new Set(lines.map((r) => r.shape))].sort(byShape);
  const cells = {};
  const stages = {};
  const errors = {};
  for (const r of lines.filter((r) => r.error !== undefined)) (errors[r.shape] ??= {})[r.run] = r.error;
  for (const shape of shapes) {
    const rounds = found.filter((r) => r.shape === shape);
    cells[shape] = {};
    for (const [row, run, which] of ROWS) {
      const picked = rounds.filter((r) => r.run === run && (r.round === 0) === (which === "first"));
      if (picked.length === 0) continue;
      cells[shape][row] = {
        total_ms: median(picked.map((r) => r.total_ms)),
        download_ms: median(picked.map((r) => r.download_ms)),
        downloaded_bytes: Math.max(...picked.map((r) => r.downloaded_bytes)),
      };
    }
    const restart = rounds.filter((r) => r.run === "restart" && r.round === 0);
    stages[shape] = { load_ms: median(restart.map((r) => r.load_ms)) };
    for (const stage of STAGES.slice(1)) stages[shape][stage] = median(rounds.map((r) => r[stage]));
  }
  return Object.keys(errors).length ? { cells, stages, errors } : { cells, stages };
}

export const seconds = (ms) => `${(ms / 1000).toFixed(2)} s`;

function change(now, before, flag) {
  if (before === undefined || before === 0 || now === undefined || Math.abs(now - before) < LEAST_CHANGE_MS) return "";
  const delta = ((now - before) / before) * 100;
  const sign = delta >= 0 ? "+" : "";
  return ` (${sign}${delta.toFixed(0)} %${Math.abs(delta) >= flag ? " **!**" : ""})`;
}

const scenarioText = (report, shape, row) => {
  const cell = report?.cells?.[shape]?.[row];
  // A shape whose fresh run failed has no restart run either.
  if (!cell) return report?.errors?.[shape] === undefined ? "" : "failed";
  let text = seconds(cell.total_ms);
  if (cell.downloaded_bytes)
    text += ` (download: ${seconds(cell.download_ms)}, ${(cell.downloaded_bytes / 1048576).toFixed(1)} MiB)`;
  return text;
};
const stageText = (report, shape, stage) => {
  const now = report?.stages?.[shape]?.[stage];
  return now === undefined ? "" : seconds(now);
};
const total = (report, shape, row) => report?.cells?.[shape]?.[row]?.total_ms;
const stageValue = (report, shape, stage) => report?.stages?.[shape]?.[stage];

/** With a baseline, every row twice: `before` (the baseline), then `after` (this report) with the change. */
function table(current, baseline, shapes, name, keys, text, value, flag) {
  const heads = shapes.map(heading).join(" | ");
  if (baseline === undefined) {
    return [
      `| ${name} | ${heads} |`,
      `|---|${"---|".repeat(shapes.length)}`,
      ...keys.map(([key, label]) => `| ${label} | ${shapes.map((s) => text(current, s, key)).join(" | ")} |`),
    ];
  }
  const lines = [`| ${name} | | ${heads} |`, `|---|---|${"---|".repeat(shapes.length)}`];
  for (const [key, label] of keys) {
    lines.push(`| ${label} | before | ${shapes.map((s) => text(baseline, s, key)).join(" | ")} |`);
    const after = shapes.map(
      (s) => text(current, s, key) + change(value(current, s, key), value(baseline, s, key), flag),
    );
    lines.push(`| | after | ${after.join(" | ")} |`);
  }
  return lines;
}

/** One runner's tables; `before` and `after` name the two commits, as markdown. */
export function markdown(current, baseline, flag, { before, after } = {}) {
  const shapes = [...new Set([...Object.keys(current.cells), ...Object.keys(baseline?.cells ?? {})])].sort(byShape);
  const lines = [];
  if (after)
    lines.push(
      baseline && before
        ? `**Before:** ${before}. **After:** ${after}.`
        : `**After:** ${after}. No report of \`main\` to compare with yet.`,
      "",
    );
  lines.push(
    ...table(current, baseline, shapes, "by scenario", ROWS.map(([row]) => [row, row]), scenarioText, total, flag),
    "",
    ...table(
      current,
      baseline,
      shapes,
      "by stage",
      STAGES.map((stage) => [stage, stage.replace("_ms", "").replace("load", "key load")]),
      stageText,
      stageValue,
      flag,
    ),
  );
  const failures = Object.entries(current.errors ?? {}).flatMap(([shape, runs]) =>
    Object.entries(runs).map(([run, error]) => `- ${heading(shape)}, ${run} run: ${error}`),
  );
  if (failures.length) lines.push("", "Failed:", "", ...failures);
  return lines.join("\n") + "\n";
}

/** A runner as the report names it, from the harness's runner.json. */
export function runnerName(label, runner) {
  if (!runner) return label;
  const machine = runner.cpu ? `${runner.cpu}, ${String(runner.memory_gib)} GiB, ` : "";
  return `${SYSTEMS[runner.system] ?? runner.system} ${runner.arch}, ${machine}${String(runner.threads)} threads, ${runner.browser}`;
}

export const commitLink = (commit, repo) => {
  const short = `\`${commit.slice(0, 7)}\``;
  return repo ? `[${short}](https://github.com/${repo}/commit/${commit})` : short;
};

const rank = (label) => (ORDER.includes(label) ? ORDER.indexOf(label) : ORDER.length);
const proofText = (reports, shape, label) =>
  stageText(reports[label], shape, "prove_ms") || (reports[label]?.errors?.[shape] === undefined ? "" : "failed");
const proof = (reports, shape, label) => stageValue(reports[label], shape, "prove_ms");

/**
 * The proof time by runner, then each runner's tables. `reports` is
 * {label: report.json}, `runners` {label: runner.json}, `baselines`
 * {label: history entry}.
 */
export function runnersMarkdown(reports, runners, baselines, flag, { repo, after } = {}) {
  const labels = Object.keys(reports).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const shapes = [...new Set(labels.flatMap((label) => Object.keys(reports[label].cells)))].sort(byShape);
  const before = [...new Set(labels.filter((label) => baselines[label]).map((label) => baselines[label].commit))]
    .map((commit) => `\`main\` at ${commitLink(commit, repo)}`)
    .join(", ");
  const lines = ["### Proof timing in Chrome", ""];
  if (after)
    lines.push(
      before ? `**Before:** ${before}. **After:** ${after}.` : `**After:** ${after}. No report of \`main\` to compare with yet.`,
      "",
    );
  lines.push(
    "The proof, key loaded, by shape (notes → outputs): medians of each runner, headless Chrome on the runner's own processors. Runner numbers compare commits, not laptops. Each runner's key load and first runs are in its tables below.",
    "",
  );
  const baselineReports = Object.keys(baselines).length
    ? Object.fromEntries(Object.entries(baselines).map(([label, entry]) => [label, entry.report]))
    : undefined;
  lines.push(
    ...table(
      reports,
      baselineReports,
      shapes,
      "by runner",
      labels.map((label) => [label, runnerName(label, runners[label])]),
      proofText,
      proof,
      flag,
    ),
  );
  for (const label of labels) {
    lines.push("", `<details><summary>${runnerName(label, runners[label])}</summary>`, "");
    lines.push(markdown(reports[label], baselines[label]?.report, flag), "</details>");
  }
  return lines.join("\n") + "\n";
}

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

const json = (path) => (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : undefined);

if (import.meta.url === `file://${process.argv[1]}`) {
  const logs = argument("--logs");
  if (!logs) {
    console.error(
      "usage: proof-timing-report.mjs --logs DIR [--repo OWNER/NAME] [--after TEXT] [--summary FILE] [--flag PERCENT]",
    );
    process.exit(2);
  }
  const reports = {};
  const runners = {};
  const baselines = {};
  for (const label of readdirSync(logs).filter((name) => statSync(join(logs, name)).isDirectory())) {
    const dir = join(logs, label);
    const found = readdirSync(dir)
      .filter((name) => name.endsWith(".log"))
      .sort()
      .flatMap((name) => records(readFileSync(join(dir, name), "utf8")));
    if (found.length === 0) {
      console.error(`no ZOLANA_TIMING lines under ${dir}`);
      continue;
    }
    reports[label] = report(found);
    writeFileSync(join(dir, "report.json"), JSON.stringify(reports[label], null, 2) + "\n");
    runners[label] = json(join(dir, "runner.json"));
    if (existsSync(join(dir, "baseline.json"))) baselines[label] = json(join(dir, "baseline.json"));
  }
  if (Object.keys(reports).length === 0) {
    console.error(`no ZOLANA_TIMING lines under ${logs}`);
    process.exit(1);
  }
  const text = runnersMarkdown(reports, runners, baselines, Number(argument("--flag", FLAG)), {
    repo: argument("--repo"),
    after: argument("--after"),
  });
  process.stdout.write(text);
  const summary = argument("--summary");
  if (summary) appendFileSync(summary, text + "\n");
}
