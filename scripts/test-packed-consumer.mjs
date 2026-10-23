import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, generateKeyPairSync } from "node:crypto";
import { copyFile, cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Browser, install } from "@puppeteer/browsers";
import { Builder, logging } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome.js";

const root = await realpath(fileURLToPath(new URL("../", import.meta.url)));
// Pinned, so two runs of one commit test the same browser; ci.yml caches it by this id.
const chromeForTestingBuild = "155.0.8059.84";
const consumer = await realpath(await mkdtemp(join(tmpdir(), "zolana-packed-consumer-")));
const relativeConsumer = relative(root, consumer);
assert.ok(
  relativeConsumer.startsWith("..") || isAbsolute(relativeConsumer),
  "Consumer must be outside the workspace",
);
const servers = [];
const drivers = [];
try {
  const metadata = JSON.parse(
    await command(
      "npm",
      ["pack", "--json", "--workspace", "@heliuslabs/zolana-web-prover", "--pack-destination", consumer],
      root,
      true,
    ),
  );
  const packed = Array.isArray(metadata) ? metadata[0] : metadata["@heliuslabs/zolana-web-prover"];
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
      dependencies: { "@heliuslabs/zolana-web-prover": `file:${tarball}` },
      devDependencies: Object.fromEntries(
        ["typescript", "vite", "webpack"].map((name) => [name, lock.packages[`node_modules/${name}`].version]),
      ),
    }),
  );
  await command("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], consumer);
  const installed = join(consumer, "node_modules/@heliuslabs/zolana-web-prover");
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
  // The runtime ships in the package as built, beside the worker the app's bundler emits.
  for (const [packaged, source] of [
    ["dist/runtime/zopro_zolana.js", "packages/web-prover/src/runtime/zopro_zolana.js"],
    ["dist/runtime/zopro_zolana_bg.wasm", "packages/web-prover/src/runtime/zopro_zolana_bg.wasm"],
    ["dist/scripts/install-keys.mjs", "packages/web-prover/scripts/install-keys.mjs"],
  ]) {
    assert.deepEqual(await readFile(join(installed, packaged)), await readFile(join(root, source)), packaged);
  }
  const publicDirectory = join(consumer, "public");
  await command(
    join(consumer, "node_modules/.bin/zolana-prover-keys"),
    ["--output", join(publicDirectory, "keys"), "--keys", "transfer_confidential_2_2.key"],
    consumer,
  );
  await mkdir(join(publicDirectory, "fixtures"), { recursive: true });
  await copyFile(join(root, "fixtures/transfer-2x2.json"), join(publicDirectory, "fixtures/transfer-2x2.json"));

  const vite = await import(pathToFileURL(join(consumer, "node_modules/vite/dist/node/index.js")).href);
  await vite.build({ root: consumer, configFile: false, build: { target: "esnext" }, logLevel: "warn" });
  const webpack = (await import(pathToFileURL(join(consumer, "node_modules/webpack/lib/index.js")).href)).default;
  await new Promise((resolve, reject) =>
    webpack(
      {
        mode: "production",
        context: consumer,
        entry: "./webpack-entry.js",
        output: { path: join(consumer, "dist-webpack"), filename: "main.js", publicPath: "auto" },
        performance: { hints: false },
      },
      (error, stats) =>
        error || stats.hasErrors() ? reject(error ?? new Error(stats.toString("errors-only"))) : resolve(),
    ),
  );
  await cp(publicDirectory, join(consumer, "dist-webpack"), { recursive: true });
  await writeFile(
    join(consumer, "dist-webpack/index.html"),
    '<!doctype html><html><head><meta charset="utf-8"></head><body><script src="/main.js"></script></body></html>\n',
  );
  // Both bundlers emit the runtime's wasm as a file, not inlined.
  const runtimeSize = (await readFile(join(installed, "dist/runtime/zopro_zolana_bg.wasm"))).length;
  for (const outDir of ["dist", "dist-webpack"]) {
    const emitted = [];
    for (const file of await readdir(join(consumer, outDir), { recursive: true })) {
      if (file.endsWith(".wasm")) emitted.push((await readFile(join(consumer, outDir, file))).length);
    }
    assert.deepEqual(emitted, [runtimeSize], `${outDir} emits the runtime's wasm file`);
  }

  const results = {};
  const pageDriver = await browser();
  for (const [name, outDir] of [
    ["vite", "dist"],
    ["webpack", "dist-webpack"],
  ]) {
    const server = await vite.preview({
      root: consumer,
      configFile: false,
      build: { outDir },
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
    servers.push(server);
    results[name] = await check(pageDriver, server.resolvedUrls.local[0]);
  }

  // An extension page refuses scripts from blob: URLs, where Rayon's helpers for pages
  // without a bundler start their threads; this one proves with the threads the bundler emitted.
  const extension = join(consumer, "extension");
  await cp(join(consumer, "dist"), extension, { recursive: true });
  const publicKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey.export({ type: "spki", format: "der" });
  const extensionId = createHash("sha256")
    .update(publicKey)
    .digest("hex")
    .slice(0, 32)
    .replace(/./g, (digit) => String.fromCharCode(97 + Number.parseInt(digit, 16)));
  await writeFile(
    join(extension, "manifest.json"),
    JSON.stringify({
      manifest_version: 3,
      name: "Packed prover consumer",
      version: "1.0.0",
      key: publicKey.toString("base64"),
      cross_origin_embedder_policy: { value: "require-corp" },
      cross_origin_opener_policy: { value: "same-origin" },
      content_security_policy: { extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'" },
    }),
  );
  results.extension = await check(await browser(extension), `chrome-extension://${extensionId}/index.html`);

  console.log(
    "PASS: clean packed install with no asset step, strict NodeNext/bundler types, production proofs at one and two threads from Vite and webpack builds and from an MV3 extension page, witness error redaction and recovery.",
  );
  console.log(JSON.stringify(results));
} finally {
  for (const driver of drivers) await driver.quit();
  for (const server of servers) await server.close();
  await rm(consumer, { recursive: true, force: true });
}

/** Chrome for the pages; Chrome for Testing for an extension, which branded Chrome no longer loads from the command line. */
async function browser(extension) {
  const preferences = new logging.Preferences();
  preferences.setLevel(logging.Type.BROWSER, logging.Level.ALL);
  const options = new chrome.Options().addArguments("--headless=new").setLoggingPrefs(preferences);
  if (process.env.CHROME_NO_SANDBOX === "1") options.addArguments("--no-sandbox");
  const builder = new Builder().forBrowser("chrome");
  if (extension === undefined) {
    if (process.env.CHROME_BIN) options.setChromeBinaryPath(process.env.CHROME_BIN);
  } else {
    const cacheDir = join(root, "target/chrome-for-testing");
    const buildId = chromeForTestingBuild;
    const testing = await install({ browser: Browser.CHROME, buildId, cacheDir });
    const driver = await install({ browser: Browser.CHROMEDRIVER, buildId, cacheDir });
    options.setChromeBinaryPath(testing.executablePath);
    options.addArguments(`--load-extension=${extension}`, `--disable-extensions-except=${extension}`);
    builder.setChromeService(new chrome.ServiceBuilder(driver.executablePath));
  }
  const driver = await builder.setChromeOptions(options).build();
  drivers.push(driver);
  await driver.manage().setTimeouts({ script: 240000 });
  return driver;
}

async function check(driver, url) {
  await driver.get(url);
  await driver.wait(
    () => driver.executeScript("return typeof window.checkPackedProver === 'function'"),
    30000,
  );
  assert.equal(await driver.executeScript("return crossOriginIsolated"), true, url);
  const result = await driver.executeAsyncScript(function (done) {
    window.checkPackedProver().then(
      (results) => done({ results }),
      (error) => done({ error: String(error) }),
    );
  });
  assert.equal(result.error, undefined, `${url}: ${result.error}`);
  assert.deepEqual(
    result.results.map(({ threads }) => threads),
    [1, 2],
    url,
  );
  const logs = await driver.manage().logs().get(logging.Type.BROWSER);
  assert.doesNotMatch(JSON.stringify(logs), /review-private-sentinel/);
  return result.results;
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
