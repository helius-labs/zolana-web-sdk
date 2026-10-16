import assert from "node:assert/strict";
import { test } from "node:test";

import { markdown, records, report } from "./proof-timing-report.mjs";

function line(run, round, total, extra = {}) {
  return `ZOLANA_TIMING ${JSON.stringify({
    label: "chrome",
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
  const text = markdown(current, baseline, "Proof timing: test", 15);
  assert.match(text, /\| first run, including download \| before \| 2\.60 s \(download: 1\.90 s, 8\.8 MiB\) \|/u);
  assert.match(text, /\| \| after \| 2\.60 s \(download: 1\.90 s, 8\.8 MiB\) \(\+0 %\) \|/u);
  assert.match(text, /\| warm \| before \| 0\.25 s \|\n\| \| after \| 0\.32 s \(\+28 % \*\*!\*\*\) \|/u);
  assert.match(text, /\| key load \| before \| 0\.03 s/u);
  assert.doesNotMatch(markdown(current, undefined, "t", 15), /%|\| before \||\| after \|/u);
});

test("merges follow transfers, and a failed shape shows in its rows and under the tables", () => {
  const lines = [
    ...records(logs),
    ...records(logs.replaceAll('"shape":"1x2"', '"shape":"merge-24x1"')),
    { label: "chrome", run: "fresh", shape: "24x2", error: "kernel out of memory" },
  ];
  const current = report(lines);
  assert.deepEqual(Object.keys(current.cells), ["1x2", "24x2", "merge-24x1"]);
  const text = markdown(current, undefined, "t", 25);
  assert.match(text, /\| scenario \| 1 → 2 \| 24 → 2 \| merge 24 → 1 \|/u);
  assert.match(text, /\| warm \| 0\.32 s \| failed \| 0\.32 s \|/u);
  assert.match(text, /\| first run after restart \| 0\.34 s \| failed \| 0\.34 s \|/u);
  assert.match(text, /- 24 → 2, fresh run: kernel out of memory/u);
});

test("the text names the commits before and after, and the intro can be left out", () => {
  const current = report(records(logs));
  const names = { before: "`main` at `abc1234`", after: "this pull request at `def5678`" };
  assert.match(
    markdown(current, current, "t", 25, names),
    /\*\*Before:\*\* `main` at `abc1234`\. \*\*After:\*\* this pull request at `def5678`\./u,
  );
  assert.match(
    markdown(current, undefined, "t", 25, names),
    /\*\*After:\*\* this pull request at `def5678`\. No report of `main` to compare with yet\./u,
  );
  assert.doesNotMatch(markdown(current, current, undefined, 25, { intro: false }), /Medians|###|Before/u);
});
