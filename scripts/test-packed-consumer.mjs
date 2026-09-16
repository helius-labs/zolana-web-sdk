import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyFile, cp, lstat, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Builder, logging } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome.js";

const root = await realpath(fileURLToPath(new URL("../", import.meta.url)));
const consumer = await realpath(await mkdtemp(join(tmpdir(), "zolana-packed-consumer-")));
const relativeConsumer = relative(root, consumer);
assert.ok(
  relativeConsumer.startsWith("..") || isAbsolute(relativeConsumer),
  "Consumer must be outside the workspace",
);
let server;
let driver;
try {
  const metadata = JSON.parse(
    await command(
      "npm",
      ["pack", "--json", "--workspace", "@zolana/web-prover", "--pack-destination", consumer],
      root,
      true,
    ),
  );
  const packed = Array.isArray(metadata) ? metadata[0] : metadata["@zolana/web-prover"];
  assert.ok(packed?.filename, "npm pack must identify the generated tarball");
  const tarball = join(consumer, packed.filename);
  const lock = JSON.parse(await readFile(join(root, "package-lock.json"), "utf8"));
  await cp(join(root, "scripts/consumer-fixture"), consumer, { recursive: true });
  await writeFile(
    join(consumer, "package.json"),
    JSON.stringify({
      name: "packed-prover-consumer",
      private: true,
      type: "module",
      dependencies: { "@zolana/web-prover": `file:${tarball}` },
      devDependencies: {
        typescript: lock.packages["node_modules/typescript"].version,
        vite: lock.packages["node_modules/vite"].version,
      },
    }),
  );
  await command("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], consumer);
  const installed = join(consumer, "node_modules/@zolana/web-prover");
  assert.equal((await lstat(installed)).isSymbolicLink(), false);
  const manifest = JSON.parse(await readFile(join(installed, "package.json"), "utf8"));
  for (const field of ["dependencies", "peerDependencies", "optionalDependencies"]) {
    assert.deepEqual(Object.keys(manifest[field] || {}), [], `Unexpected ${field}`);
  }
  for (const dependency of ["@heliuslabs/zolana", "@solana/kit"]) {
    await assert.rejects(lstat(join(consumer, "node_modules", dependency)), { code: "ENOENT" });
  }
  await command(join(consumer, "node_modules/.bin/tsc"), ["-p", "tsconfig.json"], consumer);
  await command(
    join(consumer, "node_modules/.bin/tsc"),
    ["-p", "tsconfig.json", "--module", "preserve", "--moduleResolution", "bundler"],
    consumer,
  );
  for (const path of [
    "scripts/setup-assets.mjs",
    "runtime.lock.json",
    "wasm/prover/provingkeys/proving-keys.lock",
  ]) {
    assert.deepEqual(
      await readFile(join(installed, "dist", path)),
      await readFile(join(root, path)),
    );
  }
  await command(
    join(consumer, "node_modules/.bin/zolana-prover-assets"),
    ["--output", join(consumer, "public"), "--keys", "transfer_confidential_2_3.key"],
    consumer,
  );
  assert.deepEqual(
    await readFile(join(consumer, "public/prover/zolana-prover.wasm")),
    await readFile(join(root, "dist/bridge/zolana-prover.wasm")),
  );
  await copyFile(
    join(installed, "dist/dist/bridge/wasm_exec.js"),
    join(consumer, "public/raw-wasm-exec.js"),
  );
  const vite = await import(
    pathToFileURL(join(consumer, "node_modules/vite/dist/node/index.js")).href
  );
  await vite.build({
    root: consumer,
    configFile: false,
    build: { target: "esnext" },
    logLevel: "warn",
  });
  server = await vite.preview({
    root: consumer,
    configFile: false,
    preview: {
      host: "127.0.0.1",
      port: 0,
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
      },
    },
    logLevel: "warn",
  });
  const preferences = new logging.Preferences();
  preferences.setLevel(logging.Type.BROWSER, logging.Level.ALL);
  const options = new chrome.Options().addArguments("--headless").setLoggingPrefs(preferences);
  if (process.env.CHROME_BIN) options.setChromeBinaryPath(process.env.CHROME_BIN);
  if (process.env.CHROME_NO_SANDBOX === "1") options.addArguments("--no-sandbox");
  driver = await new Builder().forBrowser("chrome").setChromeOptions(options).build();
  await driver.manage().setTimeouts({ script: 240000 });
  await driver.get(server.resolvedUrls.local[0]);
  await driver.wait(
    () => driver.executeScript("return typeof window.checkPackedProver === 'function'"),
    30000,
  );
  assert.equal(await driver.executeScript("return crossOriginIsolated"), true);
  const result = await driver.executeAsyncScript(function (done) {
    window.checkPackedProver().then(
      (results) => done({ results }),
      (error) => done({ error: String(error) }),
    );
  });
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.results.length, 2);
  const logs = await driver.manage().logs().get(logging.Type.BROWSER);
  assert.doesNotMatch(JSON.stringify(logs), /review-private-sentinel/);
  console.log(
    "PASS: clean packed install, strict NodeNext/bundler types, production browser proofs (Go + Arkworks), raw Go errors/panics, witness error redaction and recovery.",
  );
  console.log(JSON.stringify(result.results));
} finally {
  await driver?.quit();
  await server?.close();
  await rm(consumer, { recursive: true, force: true });
}

function command(executable, args, cwd, capture = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
    });
    let output = "";
    child.stdout?.on("data", (chunk) => {
      output += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve(output) : reject(new Error(`${executable} exited ${code}`)),
    );
  });
}
