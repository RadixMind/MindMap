import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const baseUrl = process.env.OPEN_MINDMAP_BASE_URL ?? "http://127.0.0.1:4321";
const pages = [
  { name: "home", path: "/", selectors: [".hero h1", ".hero-runtime", ".runtime-lab", "#benchmarks"] },
  { name: "playground", path: "/playground/", selectors: [".playground-app", ".mm-editor", ".mm-feature-ai-composer"] },
  { name: "docs", path: "/docs/", selectors: [".docs-content h1", "#runtime", "#api"] },
];
const viewports = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 },
];
const themes = ["light", "dark"];
const reducedMotionModes = [false, true];
const report = { generatedAt: new Date().toISOString(), baseUrl, passed: true, pages: [], failures: [] };
const browser = await chromium.launch({ headless: true });

async function inspect(name, path, viewport, theme, reducedMotion, selectors) {
  const page = await browser.newPage({ viewport });
  await page.emulateMedia({ colorScheme: theme, reducedMotion: reducedMotion ? "reduce" : "no-preference" });
  await page.addInitScript(() => {
    try { localStorage.removeItem("open-mindmap-theme"); } catch { /* storage may be unavailable */ }
  });
  const errors = [];
  const networkErrors = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) networkErrors.push(`${response.status()} ${response.url()}`);
  });

  let item;
  try {
    const response = await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle" });
    await page.evaluate(() => { document.documentElement.dataset.theme = "auto"; });
    const missing = [];
    for (const selector of selectors) {
      const locator = page.locator(selector).first();
      if ((await locator.count()) === 0 || !(await locator.isVisible())) missing.push(selector);
    }
    const metrics = await page.evaluate(() => ({
      viewport: { width: innerWidth, height: innerHeight },
      document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
      body: { width: document.body.scrollWidth, height: document.body.scrollHeight },
      reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
    }));
    const horizontalOverflow = metrics.document.width > metrics.viewport.width + 2 || metrics.body.width > metrics.viewport.width + 2;

    const focusResult = await page.evaluate(() => {
      const target = document.querySelector("a, button, input, [tabindex]:not([tabindex='-1'])");
      if (!(target instanceof HTMLElement)) return { passed: false, reason: "no focusable control" };
      target.focus();
      return { passed: document.activeElement === target, tag: target.tagName, label: target.getAttribute("aria-label") ?? target.textContent?.trim().slice(0, 80) };
    });
    let mobileMenuOpened = false;
    if (viewport.width < 768) {
      const mobileMenu = page.locator("details.mobile-menu").first();
      const mobileSummary = mobileMenu.locator("summary").first();
      if (await mobileMenu.count() && await mobileSummary.count()) {
        const isOpen = await mobileMenu.getAttribute("open");
        if (isOpen === null) {
          await mobileSummary.focus();
          await mobileSummary.press("Enter");
        }
        mobileMenuOpened = (await mobileMenu.getAttribute("open")) !== null;
      }
    }
    const themeToggle = page.locator("[data-theme-toggle]:visible").first();
    let interaction = { passed: true, themeToggled: false, themeAfterToggle: null, mobileMenuOpened };
    if (await themeToggle.count()) {
      await themeToggle.focus();
      const focused = await page.evaluate(() => document.activeElement?.matches("[data-theme-toggle]") ?? false);
      await themeToggle.click();
      const themeAfterToggle = await page.locator("html").getAttribute("data-theme");
      interaction = { passed: focused && (themeAfterToggle === "light" || themeAfterToggle === "dark"), themeToggled: true, themeAfterToggle, mobileMenuOpened };
    } else {
      interaction = { passed: false, themeToggled: false, themeAfterToggle: null, mobileMenuOpened };
    }
    item = {
      name,
      path,
      theme,
      reducedMotion,
      viewport: { ...viewport },
      status: response?.status() ?? null,
      missing,
      errors,
      networkErrors,
      horizontalOverflow,
      focus: focusResult,
      interaction,
      metrics,
    };
  } catch (error) {
    item = {
      name,
      path,
      theme,
      reducedMotion,
      viewport: { ...viewport },
      status: null,
      missing: [],
      errors: [...errors, `navigation: ${error instanceof Error ? error.message : String(error)}`],
      networkErrors,
      horizontalOverflow: false,
      focus: { passed: false },
      interaction: { passed: false, themeToggled: false, themeAfterToggle: null, mobileMenuOpened: false },
      metrics: null,
    };
  } finally {
    await page.close();
  }

  report.pages.push(item);
  if (
    (item.status ?? 500) >= 400 ||
    item.missing.length ||
    item.errors.length ||
    item.networkErrors.length ||
    item.horizontalOverflow ||
    !item.focus.passed ||
    !item.interaction.passed ||
    item.metrics?.reducedMotion !== reducedMotion
  ) {
    report.passed = false;
    report.failures.push(item);
  }
}

try {
  for (const page of pages) {
    for (const viewport of viewports) {
      for (const theme of themes) {
        for (const reducedMotion of reducedMotionModes) {
          await inspect(`${page.name}-${viewport.name}-${theme}-${reducedMotion ? "reduced" : "motion"}`, page.path, viewport, theme, reducedMotion, page.selectors);
        }
      }
    }
  }
} finally {
  await browser.close();
}

const artifacts = resolve(root, "artifacts");
mkdirSync(artifacts, { recursive: true });
writeFileSync(resolve(artifacts, "site-qa.json"), `${JSON.stringify(report, null, 2)}\n`);
if (!report.passed) process.exitCode = 1;
