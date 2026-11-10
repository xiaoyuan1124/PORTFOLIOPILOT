/**
 * Read-only mobile information-density audit.
 * Compares the currently deployed public baseline to the proposed local preview
 * with identical fresh browser contexts (no saved holdings/portfolio state).
 *
 * Measured pixels, not simulated user task completion times. If baseline is
 * unreachable, record "unavailable" rather than fabricate savings.
 */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const baseline = process.env.UX_BASELINE_URL ?? "https://xiaoyuan1124.github.io/PORTFOLIOPILOT/";
const proposed = process.env.PORTFOLIOPILOT_MOBILE_URL ?? "http://127.0.0.1:4173/PORTFOLIOPILOT/";
const viewports = [{ width: 390, height: 844 }, { width: 375, height: 812 }];
const browser = await chromium.launch({ headless: true });
const output = { baseline, proposed, measuredAt: new Date().toISOString(), comparisons: [], warnings: [] };

async function loadFor(page, url, section) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.getByRole("heading", { name: "投資總覽" }).waitFor({ timeout: 20000 });
  const nav = page.locator(".app-mobile-nav");
  if (section !== "home") {
    const navText = section === "settings" ? "我的" : "策略";
    await nav.getByRole("button", { name: navText, exact: true }).click();
    await page.getByRole("heading", { name: section === "settings" ? "設定與資料" : "策略實驗室", exact: true }).waitFor();
    if (section === "quant") {
      await page.getByRole("button", { name: "PilotQuant 量化研究", exact: true }).click();
      await page.getByText("2330 · 台積電", { exact: false }).first().waitFor({ timeout: 20000 });
    }
  }
  if (section === "home") {
    await page.getByText("總資產淨值").first().waitFor();
  }
  // Allow public history/official data requests and layout transitions to settle.
  await page.waitForTimeout(900);
  return await page.evaluate(() => {
    const content = document.querySelector(".app-page-content");
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" &&
        style.display !== "none" && !element.closest("details:not([open])");
    };
    const actions = [...document.querySelectorAll("button")].filter(visible);
    return {
      windowHeight: window.innerHeight,
      documentHeight: document.documentElement.scrollHeight,
      contentHeight: content ? Math.round(content.getBoundingClientRect().height) : null,
      visibleButtons: actions.length,
      firstScreenButtons: actions.filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.top >= 0 && rect.top < window.innerHeight;
      }).length,
      demo: document.body.textContent?.includes("DEMO 示範資料") ?? false,
      sixSeedStocks: document.body.textContent?.includes("2317 · 鴻海") ?? false,
      totalScrollsOfScreen: Math.max(0, Math.ceil((document.documentElement.scrollHeight - window.innerHeight) / window.innerHeight))
    };
  });
}
try {
  for (const { width, height } of viewports) {
    for (const section of ["home", "strategy", "quant", "settings"]) {
      const contextOld = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" });
      const contextNew = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" });
      try {
        const oldPage = await contextOld.newPage();
        const newPage = await contextNew.newPage();
        const [oldResult, newResult] = await Promise.allSettled([
          loadFor(oldPage, baseline, section), loadFor(newPage, proposed, section)
        ]);
        if (oldResult.status !== "fulfilled" || newResult.status !== "fulfilled") {
          const error = [oldResult, newResult].filter(r => r.status === "rejected").map(r => String(r.reason));
          output.warnings.push(`${width} / ${section}: ${error.join(" || ")}`);
          output.comparisons.push({ width, height, section, status: "unavailable" });
          continue;
        }
        const before = oldResult.value, after = newResult.value;
        if (before.demo !== after.demo || (section === "strategy" && before.sixSeedStocks !== after.sixSeedStocks)) {
          output.warnings.push(`${width} / ${section}: demo data parity mismatch; do not assert percentage as equivalent data`);
          output.comparisons.push({ width, height, section, status: "not-comparable", before, after });
          continue;
        }
        const savedPx = before.documentHeight - after.documentHeight;
        const savedPercent = Math.round(savedPx / before.documentHeight * 1000) / 10;
        output.comparisons.push({
          width, height, section, status: "measured", before, after, savedPx, savedPercent,
          verticalScreenfulsSaved: Math.round(savedPx / height * 100) / 100
        });
        console.log(`UX ${width} ${section}: before ${before.documentHeight}px -> after ${after.documentHeight}px (${savedPx}px, ${savedPercent}%, ${Math.round(savedPx / height * 100) / 100} screenfuls). Buttons ${before.visibleButtons} -> ${after.visibleButtons}`);
      } finally {
        await contextOld.close();
        await contextNew.close();
      }
    }
  }
} finally {
  await browser.close();
  await mkdir("mobile-artifacts", { recursive: true });
  await writeFile("mobile-artifacts/ux-space-metrics.json", JSON.stringify(output, null, 2) + "\n");
}
if (!output.comparisons.some(x => x.status === "measured")) console.warn("WARNING: no baseline comparison was measurable; no claimed savings.");
