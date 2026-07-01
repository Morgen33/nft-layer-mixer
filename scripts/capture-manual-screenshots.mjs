/**
 * Capture screenshots for docs/USER_MANUAL.pdf
 * Run: node scripts/capture-manual-screenshots.mjs
 * Requires dev server at http://localhost:3000
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "docs", "screenshots");

fs.mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

await page.goto("http://localhost:3000", { waitUntil: "networkidle0", timeout: 30000 });
await page.waitForSelector("header h1");
await new Promise((r) => setTimeout(r, 800));

await page.screenshot({
  path: path.join(outDir, "01-full-dashboard.png"),
  fullPage: false,
});

const rollBtn = await page.evaluateHandle(() => {
  return [...document.querySelectorAll("button")].find((b) =>
    b.textContent?.includes("Roll the Dice"),
  );
});
const rollEl = rollBtn.asElement();
if (rollEl) await rollEl.click();
await new Promise((r) => setTimeout(r, 600));

await page.screenshot({
  path: path.join(outDir, "02-preview-roll.png"),
  fullPage: false,
});

await browser.close();
console.log(`Wrote screenshots to ${outDir}`);
