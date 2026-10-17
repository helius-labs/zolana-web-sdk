#!/usr/bin/env node
// The proof timing history of `main`, kept on the `proof-timing` branch: a
// line per commit in `history/<label>.jsonl` for each runner's report.json,
// and a README with each runner's latest report against the commit before it
// and the medians of its last commits, as in the mobile SDK.
//
//   node scripts/proof-timing-history.mjs --reports DIR --history DIR --commit SHA
//     [--date ISO] [--repo OWNER/NAME] [--last N]
//
// --reports holds a directory per runner, `<label>/` with report.json
// (scripts/proof-timing-report.mjs) and runner.json; --history is a checkout
// of the `proof-timing` branch, possibly empty.
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { FLAG, byShape, commitLink, heading, markdown, runnerName, seconds } from "./proof-timing-report.mjs";

// The proof as in the pull request comments, and what a proof after a
// reload waits for.
const TRENDS = [
  ["Proof", (report, shape) => report.stages[shape]?.prove_ms],
  ["First run after a restart", (report, shape) => report.cells[shape]?.["first run after restart"]?.total_ms],
];

const entries = (path) =>
  readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));

const link = (entry, repo) => commitLink(entry.commit, repo);

export function section(label, found, repo, last) {
  const latest = found.at(-1);
  const before = found.length > 1 ? found.at(-2) : undefined;
  const lines = [
    `## ${runnerName(label, latest.runner)}`,
    "",
    markdown(latest.report, before?.report, FLAG, {
      before: before && `${link(before, repo)} of ${before.date.slice(0, 10)}`,
      after: `${link(latest, repo)} of ${latest.date.slice(0, 10)}`,
    }),
  ];
  const recent = found.slice(-last);
  const shapes = [...new Set(recent.flatMap((e) => Object.keys(e.report.cells)))].sort(byShape);
  for (const [title, value] of TRENDS) {
    lines.push(`### ${title}, last ${String(recent.length)} commits`, "");
    lines.push(`| commit | date | ${shapes.map(heading).join(" | ")} |`);
    lines.push(`|---|---|${"---|".repeat(shapes.length)}`);
    for (const entry of [...recent].reverse()) {
      const values = shapes.map((s) => {
        const ms = value(entry.report, s);
        return ms === undefined ? "" : seconds(ms);
      });
      lines.push(`| ${link(entry, repo)} | ${entry.date.slice(0, 10)} | ${values.join(" | ")} |`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function readme(history, repo, last) {
  const lines = [
    "# Proof timing on main",
    "",
    "Written by CI after every push to `main` (`scripts/proof-timing-history.mjs` on `main`), from headless Chrome on each CI runner. Runner numbers compare commits, not laptops: up to about 30 % between two commits can be the runner. The data is in `history/`, a line per commit.",
    "",
  ];
  const dir = join(history, "history");
  const files = existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith(".jsonl")).sort() : [];
  for (const name of files) {
    const found = entries(join(dir, name));
    if (found.length) lines.push(section(name.replace(/\.jsonl$/u, ""), found, repo, last));
  }
  return lines.join("\n").trimEnd() + "\n";
}

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const reports = argument("--reports");
  const history = argument("--history");
  const commit = argument("--commit");
  if (!reports || !history || !commit) {
    console.error("usage: proof-timing-history.mjs --reports DIR --history DIR --commit SHA [--date ISO] [--repo OWNER/NAME] [--last N]");
    process.exit(2);
  }
  const repo = argument("--repo", "");
  let added = 0;
  for (const label of readdirSync(reports).sort()) {
    const path = join(reports, label, "report.json");
    if (!existsSync(path)) continue;
    const target = join(history, "history", `${label}.jsonl`);
    mkdirSync(join(history, "history"), { recursive: true });
    if (existsSync(target) && entries(target).some((e) => e.commit === commit)) continue;
    const runnerPath = join(reports, label, "runner.json");
    const entry = {
      commit,
      date: argument("--date", ""),
      runner: existsSync(runnerPath) ? JSON.parse(readFileSync(runnerPath, "utf8")) : undefined,
      report: JSON.parse(readFileSync(path, "utf8")),
    };
    appendFileSync(target, JSON.stringify(entry) + "\n");
    added += 1;
  }
  if (added === 0) {
    console.error(`no new reports under ${reports}`);
  } else {
    writeFileSync(join(history, "README.md"), readme(history, repo, Number(argument("--last", 20))));
    console.log(`${String(added)} reports added to ${history}`);
  }
}
