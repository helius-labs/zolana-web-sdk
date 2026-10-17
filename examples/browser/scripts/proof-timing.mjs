// The proof timing harness in the browser: drives the bench page in headless
// Chrome through the four scenarios of the report, per shape, with the
// threaded kernel, and prints one `ZOLANA_TIMING {json}` line per proof, as
// the mobile SDK's harness does, for scripts/proof-timing-report.mjs.
//
//   ZOLANA_TIMING_SHAPES=1x2,8x2 ZOLANA_TIMING_ROUNDS=4 node examples/browser/scripts/proof-timing.mjs
//
// The kernel's thread pool takes the processors the page reports, the
// machine's own; ZOLANA_TIMING_THREADS sets them instead (4 for a low-end
// laptop on a bigger machine).
//
// A shape is `<inputs>x<outputs>` for a confidential transfer or
// `merge-<inputs>x1` for a merge, its request in wasm/prover-wasm/testdata.
// Without ZOLANA_TIMING_SHAPES every shape runs; shapes over eight notes run
// two rounds, a first and a warm one. A shape that fails prints an `error`
// line, the others still run, and the harness exits with 1.
//
// The `fresh` rows start with the Cache API cleared, so the first proof
// fetches and decompresses the key (the `download` bracket is that fetch and
// decode); the `restart` rows reload the page, so the first proof loads the
// key from the raw-key cache. ZOLANA_TIMING_DIR/<label>/ receives the lines
// as timing.log and the machine as runner.json (browser, system, threads);
// ZOLANA_TIMING_LABEL names it, chrome-linux, chrome-macos or
// chrome-windows by default. Keys come from where the page loads them: set
// VITE_ZOLANA_KEYS_URL to the key CDN for shapes that are not staged under
// public/keys. ZOLANA_TIMING_BUILT=1 serves the built page (`npm run
// build:example`, in dist/), as CI does, instead of the Vite dev server;
// DEMO_URL points at a running page. CHROME_BIN and CHROME_NO_SANDBOX work
// as in the browser test.
import { readFileSync, appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Builder, By } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome.js";
import { createServer, preview } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const lock = JSON.parse(
  readFileSync(new URL("../../../wasm/prover/provingkeys/proving-keys.lock", import.meta.url), "utf8"),
);
const shapes = (process.env.ZOLANA_TIMING_SHAPES || "1x2,2x2,4x2,8x2,16x2,24x2,merge-24x1").split(",");
const rounds = Number(process.env.ZOLANA_TIMING_ROUNDS || 4);
const inputsOf = (shape) => Number(shape.replace("merge-", "").split("x")[0]);
const roundsOf = (shape) => (inputsOf(shape) > 8 ? Math.min(rounds, 2) : rounds);
const requestOf = (shape) => (shape.startsWith("merge-") ? `${shape}.json` : `transfer-${shape}.json`);
const keyOf = (shape) =>
  shape.startsWith("merge-")
    ? `merge_${shape.replace("merge-", "").replace("x", "_")}.key`
    : `transfer_confidential_${shape.replace("x", "_")}.key`;
const system = { darwin: "macos", linux: "linux", win32: "windows" }[process.platform] ?? process.platform;
const label = process.env.ZOLANA_TIMING_LABEL || `chrome-${system}`;
const threads = process.env.ZOLANA_TIMING_THREADS ? Number(process.env.ZOLANA_TIMING_THREADS) : undefined;
const out = process.env.ZOLANA_TIMING_DIR && join(process.env.ZOLANA_TIMING_DIR, label);
if (out) mkdirSync(out, { recursive: true });

/** The page's server: none for DEMO_URL, the built page, or the dev server. */
async function serve() {
  const port = { port: 5178, strictPort: false };
  if (process.env.DEMO_URL) return undefined;
  if (process.env.ZOLANA_TIMING_BUILT === "1") return preview({ root, logLevel: "warn", preview: port });
  const dev = await createServer({ root, logLevel: "warn", server: port });
  await dev.listen();
  return dev;
}
const server = await serve();
const demoUrl = process.env.DEMO_URL || server.resolvedUrls.local[0];
const options = new chrome.Options().addArguments("--headless", "--window-size=1440,1100");
if (process.env.CHROME_BIN) options.setChromeBinaryPath(process.env.CHROME_BIN);
if (process.env.CHROME_NO_SANDBOX === "1") options.addArguments("--no-sandbox");
let driver;

/** A new browser on the bench page; the kernel needs cross-origin isolation. */
async function open() {
  driver = await new Builder().forBrowser("chrome").setChromeOptions(options).build();
  if (threads !== undefined) {
    await driver.sendDevToolsCommand("Page.addScriptToEvaluateOnNewDocument", {
      source: `Object.defineProperty(Navigator.prototype, "hardwareConcurrency", { get: () => ${String(threads)} });`,
    });
  }
  await driver.get(demoUrl);
  await ready();
  if (threads !== undefined && (await driver.executeScript("return navigator.hardwareConcurrency")) !== threads)
    throw new Error(`the page does not report ${String(threads)} processors`);
  const isolated = await driver.executeScript("return crossOriginIsolated");
  if (!isolated) throw new Error("the page is not cross-origin isolated: the kernel cannot run");
  if (out) {
    const capabilities = await driver.getCapabilities();
    const runner = {
      browser: `Chrome ${String(capabilities.getBrowserVersion()).split(".")[0]}`,
      system,
      arch: process.arch,
      threads: await driver.executeScript("return navigator.hardwareConcurrency"),
    };
    writeFileSync(join(out, "runner.json"), JSON.stringify(runner) + "\n");
  }
}

const button = (text) => driver.findElement(By.xpath(`//button[normalize-space(.)='${text}']`));
const ready = () => driver.wait(async () => (await button("Generate proof")).isEnabled(), 60000);

async function setRequest(json) {
  await driver.findElement(By.css('button[aria-label="Options"]')).click();
  await driver.findElement(By.css(".input-details summary")).click();
  const textarea = await driver.findElement(By.id("proof-input"));
  await driver.executeScript(
    function (el, next) {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(el, next);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    },
    textarea,
    json,
  );
  await driver.findElement(By.css('button[aria-label="Close options"]')).click();
}

/** One proof: the page's proving and verification times, and the wall clock around them. */
async function prove() {
  const started = performance.now();
  await (await button("Generate proof")).click();
  // Five minutes is several times the slowest proof on a runner; a kernel
  // out of memory stalls rather than fails. Polled every 10 ms: selenium's
  // default of 200 ms would round every total up to its next poll.
  await driver.wait(
    async () => {
      const errors = await driver.findElements(By.css('[role="alert"]'));
      if (errors.length) throw new Error(await errors[0].getText());
      return (await driver.findElements(By.css(".verified"))).length > 0;
    },
    300000,
    undefined,
    10,
  );
  const total = performance.now() - started;
  const proving = parseFloat(await driver.findElement(By.css(".timing span")).getText());
  const verify = parseFloat(await driver.findElement(By.css(".verify-time")).getText());
  return { total, proving, verify };
}

/** The key preparation the page shows in the proof facts: the first load of a page. */
async function keyLoadMs() {
  await (await button("View proof")).click();
  const facts = await driver.findElement(By.css(".proof-facts")).getText();
  await driver.findElement(By.css('button[aria-label="Close proof"]')).click();
  const match = /Key preparation\s+([\d.]+) s/u.exec(facts);
  return match ? Math.round(parseFloat(match[1]) * 1000) : 0;
}

function emit(line) {
  const text = `ZOLANA_TIMING ${JSON.stringify(line)}`;
  console.log(text);
  if (out) appendFileSync(join(out, "timing.log"), text + "\n");
}

async function scenario(run, shape, json, keyBytes) {
  await driver.navigate().refresh();
  await ready();
  await setRequest(json);
  for (let round = 0; round < roundsOf(shape); round++) {
    const { total, proving, verify } = await prove();
    const load = round === 0 ? await keyLoadMs() : 0;
    const rest = Math.max(0, Math.round(total - proving - verify - load));
    emit({
      run,
      shape,
      round,
      downloaded_bytes: run === "fresh" && round === 0 ? keyBytes : 0,
      download_ms: round === 0 ? rest : 0,
      load_ms: load,
      witness_ms: 0,
      prove_ms: Math.round(proving),
      verify_ms: Math.round(verify),
      total_ms: Math.round(total),
    });
  }
}

let failed = false;
try {
  await open();
  for (const shape of shapes) {
    const json = readFileSync(`${root}../../wasm/prover-wasm/testdata/${requestOf(shape)}`, "utf8");
    const keyBytes = lock.keys[keyOf(shape)]?.size ?? 0;
    let run = "fresh";
    try {
      await driver.executeScript(
        "return caches.keys().then(k => Promise.all(k.map(n => caches.delete(n))))",
      );
      await scenario(run, shape, json, keyBytes);
      run = "restart";
      await scenario(run, shape, json, keyBytes);
    } catch (error) {
      // The report shows the shape as failed; the other shapes still run, in
      // a new browser in case this one crashed or hangs.
      failed = true;
      emit({ run, shape, error: String(error?.message ?? error).split("\n")[0] });
      await driver.quit().catch(() => {});
      await open();
    }
  }
} finally {
  await driver?.quit().catch(() => {});
  await server?.close();
}
if (failed) process.exitCode = 1;
