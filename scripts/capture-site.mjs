import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const baseUrl = process.env.OPEN_MINDMAP_BASE_URL ?? "http://127.0.0.1:4321";
const output = resolve(root, "artifacts/screenshots");
mkdirSync(output, { recursive: true });
const pages = [
  ["home", "/"],
  ["docs", "/docs/"],
  ["live", "/live/"],
];
const viewports = [
  ["desktop", { width: 1440, height: 1050 }],
  ["mobile", { width: 390, height: 844 }],
];
const themes = ["light", "dark"];
const captures = [];
const browser = await chromium.launch({ headless: true });

async function waitForStableState(page, pageName, theme, reducedMotion) {
  await page.waitForSelector("main#main-content", { state: "attached" });
  if (pageName === "home") {
    const demo = page.locator("#demo");
    await demo.scrollIntoViewIfNeeded();
    await demo.locator(".legacy-playground .mm-surface [data-mm-node]:visible").first().waitFor();
  }
  if (pageName === "live") await page.waitForSelector(".legacy-playground .mm-surface [data-mm-node]", { state: "visible" });
  const runtimeSelector = pageName === "live"
    ? ".legacy-playground .mm-surface"
    : pageName === "home"
      ? "#demo .legacy-playground .mm-surface"
      : null;
  if (runtimeSelector) {
    const expectedBackground = theme === "dark" ? "#171a23" : "#ffffff";
    await page.waitForFunction(({ selector, expectedBackground }) => {
      const surface = document.querySelector(selector);
      return surface && getComputedStyle(surface).getPropertyValue("--mm-background").trim().toLowerCase() === expectedBackground;
    }, { selector: runtimeSelector, expectedBackground }, { timeout: 10_000 });
  }
  return {
    runtimeBackground: runtimeSelector
      ? await page.locator(runtimeSelector).evaluate((surface) => getComputedStyle(surface).getPropertyValue("--mm-background").trim())
      : null,
    reducedMotion: await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches),
    requestedReducedMotion: reducedMotion,
  };
}

try {
  for (const [pageName, path] of pages) {
    for (const [viewportName, viewport] of viewports) {
      for (const theme of themes) {
        const reducedMotion = viewportName === "mobile";
        const page = await browser.newPage({ viewport });
        await page.emulateMedia({ colorScheme: theme, reducedMotion: reducedMotion ? "reduce" : "no-preference" });
        try {
          const response = await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle" });
          const stableState = await waitForStableState(page, pageName, theme, reducedMotion);
          const filename = `${pageName}-${viewportName}-${theme}${reducedMotion ? "-reduced" : ""}.png`;
          const outputPath = resolve(output, filename);
          await page.screenshot({ path: outputPath, fullPage: pageName !== "live" });
          captures.push({
            filename,
            page: pageName,
            path,
            viewport: { ...viewport },
            theme,
            reducedMotion,
            status: response?.status() ?? null,
            stableState,
          });
        } finally {
          await page.close();
        }
      }
    }
  }
} finally {
  await browser.close();
}

writeFileSync(resolve(output, "manifest.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), baseUrl, captures }, null, 2)}\n`);
