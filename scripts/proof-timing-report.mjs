#!/usr/bin/env node
// The proof timing report from the `ZOLANA_TIMING {json}` lines of the `fresh`
// and `restart` runs of examples/browser/scripts/proof-timing.mjs: the same
// table as the mobile SDK's report. Rows are the client's four scenarios,
// columns the shapes, transfers (`8x2`) and then merges (`merge-24x1`), a cell
// the total with the download in brackets when there was one, or `failed`; a
// second table splits the stages. With a baseline, each row comes twice,
// `before` (the baseline) and `after` (these logs) with the change, marked past
// the flag percent; --before and --after name the two commits.
//
//   node scripts/proof-timing-report.mjs --logs DIR [--baseline report.json]
//     [--before TEXT] [--after TEXT] [--out report.json] [--summary FILE] [--title TEXT] [--flag 25]
import { appendFileSync, readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export const ROWS = [
  ["first run, including download", "fresh", "first"],
  ["warm", "fresh", "rest"],
  ["first run after restart", "restart", "first"],
  ["repeated after restart", "restart", "rest"],
];
const STAGES = ["load_ms", "witness_ms", "prove_ms", "verify_ms"];
// Hosted runners vary by about 20 % between runs of one commit.
export const FLAG = 25;
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
  if (before === undefined || before === 0 || now === undefined) return "";
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

/** `before` and `after` name the two commits, as markdown. */
export function markdown(current, baseline, title, flag, { before, after, intro = true } = {}) {
  const shapes = [...new Set([...Object.keys(current.cells), ...Object.keys(baseline?.cells ?? {})])].sort(byShape);
  const lines = title ? [`### ${title}`, ""] : [];
  if (after)
    lines.push(
      baseline && before
        ? `**Before:** ${before}. **After:** ${after}.`
        : `**After:** ${after}. No report of \`main\` to compare with yet.`,
      "",
    );
  if (intro)
    lines.push(
      "Medians of one browser, by shape (notes → outputs). Runner numbers are for comparing commits, not for how fast a device is.",
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

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const logs = argument("--logs");
  if (!logs) {
    console.error(
      "usage: proof-timing-report.mjs --logs DIR [--baseline FILE] [--before TEXT] [--after TEXT] [--out FILE] [--summary FILE] [--title TEXT] [--flag PERCENT]",
    );
    process.exit(2);
  }
  const found = readdirSync(logs)
    .filter((name) => name.endsWith(".log"))
    .sort()
    .flatMap((name) => records(readFileSync(join(logs, name), "utf8")));
  if (found.length === 0) {
    console.error(`no ZOLANA_TIMING lines under ${logs}`);
    process.exit(1);
  }
  const current = report(found);
  const baselinePath = argument("--baseline");
  const baseline =
    baselinePath && existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, "utf8")) : undefined;
  const text = markdown(current, baseline, argument("--title", "Proof timing"), Number(argument("--flag", FLAG)), {
    before: argument("--before"),
    after: argument("--after"),
  });
  process.stdout.write(text);
  const out = argument("--out");
  if (out) writeFileSync(out, JSON.stringify(current, null, 2) + "\n");
  const summary = argument("--summary");
  if (summary) appendFileSync(summary, text + "\n");
}
