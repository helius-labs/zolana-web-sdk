// Drives the example in Chrome against devnet: a fresh key registers, shields,
// refuses a nine-input local spend, merges through the TEE, then sends and unshields locally.
//
//   ZOLANA_E2E_FUNDER=~/.config/solana/id.json \
//   VITE_SOLANA_RPC_URL="https://beta-devnet.helius-rpc.com/?api-key=$API_KEY" npm run test:devnet
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { burnerStorageKey } from "../src/burner.ts";
import {
  appendTransactionMessageInstruction,
  createKeyPairSignerFromBytes,
  createKeyPairSignerFromPrivateKeyBytes,
  createSolanaRpc,
  createTransactionMessage,
  getSignatureFromTransaction,
  lamports,
  pipe,
  sendTransactionWithoutConfirmingFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Address,
  type KeyPairSigner,
} from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";
import { Builder, By, logging, until, type WebDriver, type WebElement } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome.js";
import { createServer } from "vite";

const rpcUrl = process.env["VITE_SOLANA_RPC_URL"];
const funderPath = process.env["ZOLANA_E2E_FUNDER"];
if (rpcUrl === undefined || funderPath === undefined) {
  throw new Error("Set VITE_SOLANA_RPC_URL (a keyed devnet RPC) and ZOLANA_E2E_FUNDER");
}
const rpc = createSolanaRpc(rpcUrl);
if (process.env["VITE_ZOLANA_NETWORK"] === "mainnet" ||
    await rpc.getGenesisHash().send() !== "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG") {
  throw new Error("This transaction test requires Solana devnet and the devnet-e deployment");
}
const redact = (text: string) => text.replaceAll(rpcUrl, "<rpc>");
const actionDelay = Number(process.env["ZOLANA_E2E_ACTION_DELAY_MS"] ?? 0);
assert.ok(Number.isFinite(actionDelay) && actionDelay >= 0);

async function transfer(source: KeyPairSigner, destination: Address, amount: bigint): Promise<void> {
  const { value: blockhash } = await rpc.getLatestBlockhash().send();
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(source, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) => appendTransactionMessageInstruction(getTransferSolInstruction({ source, destination, amount: lamports(amount) }), m),
  );
  const signed = await signTransactionMessageWithSigners(message);
  await sendTransactionWithoutConfirmingFactory({ rpc })(signed, { commitment: "confirmed" });
  const signature = getSignatureFromTransaction(signed);
  for (let attempt = 0; attempt < 60; attempt++) {
    const { value } = await rpc.getSignatureStatuses([signature]).send();
    const status = value[0]?.confirmationStatus;
    if (status === "confirmed" || status === "finalized") return;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`transfer ${signature} did not confirm`);
}

const byTestId = (id: string) => By.css(`[data-testid="${id}"]`);
const activity = By.css('[data-testid="activity"] li');

/** Clicks button and waits for the newest activity entry to finish. */
async function act(driver: WebDriver, button: string, label: string, expected: "done" | "failed" = "done"): Promise<WebElement> {
  await new Promise((resolve) => setTimeout(resolve, actionDelay));
  const before = (await driver.findElements(activity)).length;
  await (await driver.findElement(byTestId(button))).click();
  await driver.wait(async () => {
    const [latest] = await driver.findElements(activity);
    if (latest === undefined || (await driver.findElements(activity)).length <= before) return false;
    const status = await latest.getAttribute("data-status");
    if (status !== "running" && status !== expected) throw new Error(`${label}: ${await latest.getText()}`);
    return status === expected;
  }, 240_000);
  const [latest] = await driver.findElements(activity);
  assert.ok(latest);
  console.log(`${label}: ${(await latest.getText()).replaceAll("\n", " ")}`);
  return latest;
}

/** What the page shows and logged, for a failure to explain itself. */
async function dumpPage(driver: WebDriver): Promise<void> {
  const text = await driver.findElement(By.css("body")).getText().catch(() => "<no body>");
  console.error(`page: ${redact(text.replaceAll("\n", " | ")).slice(0, 600)}`);
  for (const entry of await driver.manage().logs().get(logging.Type.BROWSER)) {
    if (entry.level.value >= logging.Level.WARNING.value && !/buffer|deprecated/u.test(entry.message)) {
      console.error(`console ${entry.level.name}: ${redact(entry.message).slice(0, 400)}`);
    }
  }
}

const funder = await createKeyPairSignerFromBytes(Uint8Array.from(JSON.parse(readFileSync(funderPath, "utf8")) as number[]));
const seed = crypto.getRandomValues(new Uint8Array(32));
const burner = await createKeyPairSignerFromPrivateKeyBytes(seed);
const seedHex = Array.from(seed, (byte) => byte.toString(16).padStart(2, "0")).join("");

const server = await createServer({ root: fileURLToPath(new URL("../", import.meta.url)), logLevel: "warn" });
await server.listen();
const preferences = new logging.Preferences();
preferences.setLevel(logging.Type.BROWSER, logging.Level.ALL);
preferences.setLevel(logging.Type.PERFORMANCE, logging.Level.ALL);
const options = new chrome.Options();
options.addArguments("--headless", "--window-size=1200,1400");
options.setLoggingPrefs(preferences);
if (process.env["CHROME_BIN"]) options.setChromeBinaryPath(process.env["CHROME_BIN"]);
if (process.env["CHROME_NO_SANDBOX"] === "1") options.addArguments("--no-sandbox");
const driver = await new Builder().forBrowser("chrome").setChromeOptions(options).build();
let funded = false;

try {
  // The page must start before any SOL moves, so a broken build costs nothing.
  await driver.get("http://127.0.0.1:5179/");
  await driver.executeScript("localStorage.setItem(arguments[0], arguments[1])", burnerStorageKey("devnet"), seedHex);
  await driver.navigate().refresh();
  await driver.wait(until.elementLocated(byTestId("owner")), 120_000);
  assert.equal(await driver.findElement(byTestId("owner")).getText(), burner.address);
  assert.equal(await driver.executeScript("return crossOriginIsolated"), true);

  await transfer(funder, burner.address, 50_000_000n);
  funded = true;
  await driver.navigate().refresh();
  await driver.wait(until.elementLocated(byTestId("register")), 120_000);

  await act(driver, "register", "Register");
  await driver.wait(until.elementLocated(byTestId("shield")), 60_000);
  await act(driver, "shield", "Shield");
  const shieldAmount = await driver.findElement(byTestId("shield-amount"));
  await shieldAmount.clear();
  await shieldAmount.sendKeys("0.001");
  for (let i = 0; i < 8; i++) await act(driver, "shield", "Add a note");
  assert.equal(await driver.findElement(byTestId("private-notes")).getText(), "9");
  const beforeMerge = await driver.findElement(byTestId("private-balance")).getText();
  const sendAmount = await driver.findElement(byTestId("send-amount"));
  await sendAmount.clear();
  await sendAmount.sendKeys("0.018");
  const blocked = await act(driver, "send", "Require merge before a nine-input spend", "failed");
  assert.match(await blocked.getText(), /Merge notes with the TEE first/u);
  assert.equal((await blocked.findElements(byTestId("local-proof"))).length, 0);
  assert.equal(await driver.findElement(byTestId("merge")).isEnabled(), false);
  await act(driver, "toggle-merging", "Enable merging");
  await driver.manage().logs().get(logging.Type.PERFORMANCE);
  const merged = await act(driver, "merge", "Merge with TEE");
  assert.equal((await merged.findElements(byTestId("local-proof"))).length, 0, "the TEE merge used the local prover");
  assert.equal(await driver.findElement(byTestId("private-balance")).getText(), beforeMerge);
  assert.equal(await driver.findElement(byTestId("private-notes")).getText(), "1");
  const requests = (await driver.manage().logs().get(logging.Type.PERFORMANCE)).flatMap((entry) => {
    const { message } = JSON.parse(entry.message) as { message: {
      method: string;
      params: { request: { url: string; method: string; headers: Record<string, string> } };
    } };
    return message.method === "Network.requestWillBeSent" ? [message.params.request] : [];
  });
  assert.ok(requests.some((r) => r.method === "GET" && new URL(r.url).pathname.endsWith("/tee/v1/attestation")), "missing TEE attestation");
  assert.ok(requests.some((r) => r.method === "POST" && /\/prove(?:\/|$)/u.test(new URL(r.url).pathname) &&
    Object.entries(r.headers).some(([key, value]) => key.toLowerCase() === "content-type" && value === "application/octet-stream")),
  "missing encrypted proof request");
  await act(driver, "toggle-merging", "Disable merging");
  assert.equal(await driver.findElement(byTestId("merging-status")).getText(), "Merging is off.");
  assert.equal(await driver.findElement(byTestId("merge")).isEnabled(), false);
  await sendAmount.clear();
  await sendAmount.sendKeys("0.004");
  const sent = await act(driver, "send", "Send");
  assert.ok((await sent.findElements(byTestId("local-proof"))).length > 0, "the transfer was not proved in the page");
  // One transfer and one proof pay the recipient and the app fee, both this wallet here.
  await (await driver.findElement(byTestId("send-fee"))).sendKeys("0.001");
  const withFee = await act(driver, "send", "Send with fee");
  assert.match(await withFee.getText(), /with a 0\.001 SOL fee/u);
  assert.ok((await withFee.findElements(byTestId("local-proof"))).length > 0, "the fee transfer was not proved in the page");
  const unshielded = await act(driver, "unshield", "Unshield");
  assert.ok((await unshielded.findElements(byTestId("local-proof"))).length > 0, "the withdrawal was not proved in the page");
  console.log(`private balance ${await driver.findElement(byTestId("private-balance")).getText()}`);
  console.log(`history: ${(await driver.findElement(byTestId("history")).getText()).replaceAll("\n", " | ")}`);
  console.log("PASS: eight-input local limit, attested encrypted TEE merge, opt-out, and local sends/withdrawal on devnet");
} catch (error) {
  console.error(redact(error instanceof Error ? (error.stack ?? error.message) : String(error)));
  await dumpPage(driver);
  process.exitCode = 1;
} finally {
  await driver.quit().catch(() => {});
  await server.close();
  if (funded) {
    const { value: left } = await rpc.getBalance(burner.address).send();
    if (left > 5_000n) await transfer(burner, funder.address, left - 5_000n).catch(() => {});
  }
}
