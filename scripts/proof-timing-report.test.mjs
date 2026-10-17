import assert from "node:assert/strict";
import { test } from "node:test";

import { markdown, records, report, runnerName, runnersMarkdown } from "./proof-timing-report.mjs";

function line(run, round, total, extra = {}) {
  return `ZOLANA_TIMING ${JSON.stringify({
    run,
    shape: "1x2",
    round,
    downloaded_bytes: 0,
    download_ms: 0,
    load_ms: 0,
    witness_ms: 0,
    prove_ms: 300,
    verify_ms: 2,
    total_ms: total,
    ...extra,
  })}`;
}

const logs = [
  line("fresh", 0, 2600, { downloaded_bytes: 9268057, download_ms: 1900, load_ms: 400 }),
  line("fresh", 1, 330),
  line("fresh", 2, 310),
  line("restart", 0, 340, { load_ms: 30 }),
  line("restart", 1, 320),
  "noise the report ignores",
].join("\n");

test("the four rows come from the two runs, with medians of the repeats", () => {
  const current = report(records(logs));
  const cells = current.cells["1x2"];
  assert.equal(cells["first run, including download"].total_ms, 2600);
  assert.equal(cells["first run, including download"].downloaded_bytes, 9268057);
  assert.equal(cells.warm.total_ms, 320);
  assert.equal(cells["first run after restart"].total_ms, 340);
  assert.equal(cells["repeated after restart"].total_ms, 320);
  assert.equal(current.stages["1x2"].load_ms, 30);
  assert.equal(current.stages["1x2"].prove_ms, 300);
});

test("the markdown carries the download bracket and the change against a baseline", () => {
  const current = report(records(logs));
  const baseline = JSON.parse(JSON.stringify(current));
  baseline.cells["1x2"].warm.total_ms = 250;
  const text = markdown(current, baseline, 15);
  assert.match(text, /\| first run, including download \| before \| 2\.60 s \(download: 1\.90 s, 8\.8 MiB\) \|/u);
  assert.match(text, /\| \| after \| 2\.60 s \(download: 1\.90 s, 8\.8 MiB\) \|/u);
  assert.match(text, /\| warm \| before \| 0\.25 s \|\n\| \| after \| 0\.32 s \(\+28 % \*\*!\*\*\) \|/u);
  assert.match(text, /\| key load \| before \| 0\.03 s/u);
  // Verification is not a cost of proving; a two-millisecond change is no percentage.
  assert.doesNotMatch(text, /\| verify/u);
  baseline.stages["1x2"].witness_ms = 2;
  assert.match(markdown(current, baseline, 15), /\| \| after \| 0\.00 s \|\n/u);
  assert.doesNotMatch(markdown(current, undefined, 15), /%|\| before \||\| after \|/u);
});

test("merges follow transfers, and a failed shape shows in its rows and under the tables", () => {
  const lines = [
    ...records(logs),
    ...records(logs.replaceAll('"shape":"1x2"', '"shape":"merge-24x1"')),
    { run: "fresh", shape: "24x2", error: "kernel out of memory" },
  ];
  const current = report(lines);
  assert.deepEqual(Object.keys(current.cells), ["1x2", "24x2", "merge-24x1"]);
  const text = markdown(current, undefined, 25);
  assert.match(text, /\| by scenario \| 1 → 2 \| 24 → 2 \| merge 24 → 1 \|/u);
  assert.match(text, /\| warm \| 0\.32 s \| failed \| 0\.32 s \|/u);
  assert.match(text, /\| first run after restart \| 0\.34 s \| failed \| 0\.34 s \|/u);
  assert.match(text, /- 24 → 2, fresh run: kernel out of memory/u);
});

test("the text names the commits before and after", () => {
  const current = report(records(logs));
  const names = { before: "`main` at `abc1234`", after: "this pull request at `def5678`" };
  assert.match(
    markdown(current, current, 25, names),
    /\*\*Before:\*\* `main` at `abc1234`\. \*\*After:\*\* this pull request at `def5678`\./u,
  );
  assert.match(
    markdown(current, undefined, 25, names),
    /\*\*After:\*\* this pull request at `def5678`\. No report of `main` to compare with yet\./u,
  );
  assert.doesNotMatch(markdown(current, current, 25), /###|Before/u);
});

test("the runners come in one report: the proof by runner, then each runner's tables", () => {
  const linux = report(records(logs));
  const macos = report(records(logs.replaceAll('"prove_ms":300', '"prove_ms":200')));
  const runners = {
    "chrome-macos": { browser: "Chrome 141", system: "macos", arch: "arm64", threads: 3 },
    "chrome-linux": { browser: "Chrome 141", system: "linux", arch: "x64", threads: 4 },
  };
  const baselineLinux = JSON.parse(JSON.stringify(linux));
  baselineLinux.stages["1x2"].prove_ms = 400;
  const text = runnersMarkdown(
    { "chrome-macos": macos, "chrome-linux": linux },
    runners,
    { "chrome-linux": { commit: "abc1234def", report: baselineLinux } },
    25,
    { repo: "o/r", after: "this pull request at `def5678`" },
  );
  assert.equal(runnerName("chrome-linux", runners["chrome-linux"]), "Linux x64, 4 threads, Chrome 141");
  assert.equal(runnerName("chrome-other", undefined), "chrome-other");
  assert.match(text, /^### Proof timing in Chrome\n/u);
  assert.match(text, /\*\*Before:\*\* `main` at \[`abc1234`\]\(https:\/\/github\.com\/o\/r\/commit\/abc1234def\)\./u);
  // Linux before macOS, whatever the order of the logs; a runner with no
  // history has an empty before row.
  assert.match(
    text,
    /\| Linux x64, 4 threads, Chrome 141 \| before \| 0\.40 s \|\n\| \| after \| 0\.30 s \(-25 % \*\*!\*\*\) \|\n\| macOS arm64, 3 threads, Chrome 141 \| before \|  \|\n\| \| after \| 0\.20 s \|/u,
  );
  assert.match(text, /<details><summary>Linux x64, 4 threads, Chrome 141<\/summary>\n\n\| by scenario \| \| 1 → 2 \|/u);
  assert.equal(text.match(/<\/details>/gu)?.length, 2);
});
