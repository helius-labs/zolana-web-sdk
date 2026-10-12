import { Builder, logging } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome.js";
import { createServer } from "vite";
const server = await createServer({ root: process.cwd(), logLevel: "silent" });
await server.listen();
const prefs = new logging.Preferences(); prefs.setLevel(logging.Type.BROWSER, logging.Level.ALL);
const driver = await new Builder().forBrowser("chrome").setChromeOptions(new chrome.Options().addArguments("--headless").setLoggingPrefs(prefs)).build();
try {
  await driver.get("http://127.0.0.1:5179/");
  await new Promise((r) => setTimeout(r, 25000));
  console.log("PAGE:", (await driver.findElement({ css: "main" }).getText()).replaceAll("\n", " | ").slice(0, 400));
  for (const entry of await driver.manage().logs().get(logging.Type.BROWSER)) if (entry.level.name !== "DEBUG" && !/buffer|deprecated/.test(entry.message)) console.log(entry.level.name, entry.message.slice(0, 300));
} finally { await driver.quit(); await server.close(); }
