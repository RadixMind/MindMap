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
  ["playground", "/playground/"],
  ["docs", "/docs/"],
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
    await page.waitForSelector(".hero-runtime .mm-surface [data-mm-node]", { state: "visible" });
    const control = page.locator(".hero-runtime__control").first();
    if (await control.count() && !(await control.isDisabled()) && (await control.getAttribute("aria-pressed")) !== "true") {
      await control.click();
    }
  }
  if (pageName === "playground") await page.waitForSelector(".playground-app .mm-surface [data-mm-node]", { state: "visible" });
  const runtimeSelector = pageName === "home" ? ".hero-runtime .mm-surface" : pageName === "playground" ? ".playground-app .mm-surface" : null;
  if (runtimeSelector) {
    await page.waitForFunction(({ selector, expectedTheme }) => {
      const surface = document.querySelector(selector);
      return surface?.getAttribute("data-mm-theme") === expectedTheme;
    }, { selector: runtimeSelector, expectedTheme: theme }, { timeout: 10_000 });
  }
  return {
    runtimeTheme: runtimeSelector ? await page.locator(runtimeSelector).getAttribute("data-mm-theme") : null,
    heroPaused: pageName === "home" ? await page.locator(".hero-runtime__control").getAttribute("aria-pressed") === "true" : null,
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
        await page.addInitScript(() => {
          try { localStorage.removeItem("open-mindmap-theme"); } catch { /* storage may be unavailable */ }
        });
        try {
          const response = await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle" });
          await page.evaluate(() => { document.documentElement.dataset.theme = "auto"; });
          const stableState = await waitForStableState(page, pageName, theme, reducedMotion);
          const filename = `${pageName}-${viewportName}-${theme}${reducedMotion ? "-reduced" : ""}.png`;
          const outputPath = resolve(output, filename);
          await page.screenshot({ path: outputPath, fullPage: pageName !== "playground" });
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
