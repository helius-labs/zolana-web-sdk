// The prover's GPU kernels timed in Chrome: proves each shape's fixture with
// the runtime under public/prover, its WebGPU passes timed by timestamp
// queries (the runtime's gpu_profile), and prints each kernel's time per
// proof beside the proof times. A profile for kernel work, not the bench.
//
//   ZOLANA_PROFILE_SHAPES=2x2,8x2 ZOLANA_PROFILE_THREADS=4 node examples/browser/scripts/gpu-profile.mjs
import { fileURLToPath } from "node:url";
import { Builder } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome.js";
import { createServer } from "vite";

const shapes = (process.env.ZOLANA_PROFILE_SHAPES || "2x2,8x2,24x2").split(",");
const threads = Number(process.env.ZOLANA_PROFILE_THREADS || 4);
const rounds = Number(process.env.ZOLANA_PROFILE_ROUNDS || 3);
const root = fileURLToPath(new URL("../", import.meta.url));
const server = await createServer({ root, logLevel: "warn", server: { port: 5179, strictPort: false } });
await server.listen();
const options = new chrome.Options().addArguments("--headless=new");
if (process.env.CHROME_BIN) options.setChromeBinaryPath(process.env.CHROME_BIN);
if (process.env.CHROME_NO_SANDBOX === "1") options.addArguments("--no-sandbox");
const driver = await new Builder().forBrowser("chrome").setChromeOptions(options).build();
try {
  await driver.get(server.resolvedUrls.local[0]);
  await driver.manage().setTimeouts({ script: 1800000 });
  const lines = await driver.executeAsyncScript(
    function (shapes, threads, rounds, done) {
      const code = `
        self.onmessage = async ({ data }) => {
          const out = [];
          try {
            const m = await import(data.base + "/prover/zopro_zolana.js");
            await m.default();
            await m.initThreadPool(data.threads);
            m.gpu_profile(true);
            if (!(await m.init_gpu())) throw new Error("no WebGPU");
            for (const shape of data.shapes) {
              const merge = shape.startsWith("merge-");
              const [i, o] = shape.replace("merge-", "").split("x");
              const file = merge ? "merge_" + i + "_1" : "transfer_confidential_" + i + "_" + o;
              const request = await (await fetch(data.base + "/fixtures/" + (merge ? shape : "transfer-" + shape) + ".json")).text();
              const key = new Uint8Array(await (await fetch(data.base + "/keys/" + file + ".zopro")).arrayBuffer());
              const prover = new m.ZolanaProver(key);
              await prover.prove(request);
              m.gpu_profile_report();
              const times = [];
              for (let r = 0; r < data.rounds; r++) {
                const t = performance.now();
                await prover.prove(request);
                times.push(performance.now() - t);
              }
              times.sort((a, b) => a - b);
              out.push(shape + " proof median " + times[Math.floor(times.length / 2)].toFixed(0) + " ms, gpu=" + prover.has_gpu());
              for (const line of m.gpu_profile_report().split("\\n").filter(Boolean)) {
                const [, kernel, total, passes] = line.match(/^(.*) ([\\d.]+) ms (\\d+) passes$/);
                out.push("  " + kernel.padEnd(18) + (Number(total) / data.rounds).toFixed(1).padStart(8) + " ms/proof, " + (Number(passes) / data.rounds) + " passes");
              }
              prover.free();
            }
          } catch (e) { out.push("error " + (e && e.message ? e.message : String(e))); }
          postMessage(out);
        };`;
      const url = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
      const worker = new Worker(url, { type: "module" });
      worker.onmessage = (e) => done(e.data);
      worker.onerror = (e) => done(["worker error " + e.message]);
      worker.postMessage({ base: location.origin, shapes, threads, rounds });
    },
    shapes,
    threads,
    rounds,
  );
  console.log(lines.join("\n"));
} finally {
  await driver.quit();
  await server.close();
}
