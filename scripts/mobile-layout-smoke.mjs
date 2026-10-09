import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const url = process.env.PORTFOLIOPILOT_MOBILE_URL ?? "http://127.0.0.1:4173/PORTFOLIOPILOT/";
const viewports = [
  { name: "iphone-375", width: 375, height: 812 },
  { name: "iphone-390", width: 390, height: 844 },
  { name: "iphone-430", width: 430, height: 932 },
  { name: "landscape-844", width: 844, height: 390 }
];

await mkdir("mobile-artifacts", { recursive: true });
const browser = await chromium.launch({ headless: true });

async function checkLayout(page, screen, section) {
  // Locally scrollable tab bars are allowed, but the entire document must not
  // become horizontally scrollable on an iPhone.
  const geometry = await page.evaluate(() => {
    const root = document.documentElement;
    const nav = document.querySelector(".app-mobile-nav");
    const header = document.querySelector(".app-topbar");
    const navRect = nav?.getBoundingClientRect();
    const headerRect = header?.getBoundingClientRect();
    return {
      width: window.innerWidth,
      documentWidth: root.scrollWidth,
      nav: navRect ? { left: navRect.left, right: navRect.right, bottom: navRect.bottom } : null,
      header: headerRect ? { left: headerRect.left, right: headerRect.right } : null
    };
  });
  assert.ok(geometry.nav, `${screen}/${section}: missing mobile navigation`);
  assert.ok(geometry.header, `${screen}/${section}: missing header`);
  assert.ok(
    geometry.documentWidth <= geometry.width + 2,
    `${screen}/${section}: document overflows horizontally (${geometry.documentWidth} > ${geometry.width})`
  );
  assert.ok(geometry.nav.left >= -2 && geometry.nav.right <= geometry.width + 2,
    `${screen}/${section}: mobile nav spills outside viewport`);
  assert.ok(geometry.header.left >= -2 && geometry.header.right <= geometry.width + 2,
    `${screen}/${section}: top bar spills outside viewport`);
  await page.screenshot({ path: `mobile-artifacts/${screen}-${section}.png`, animations: "disabled" });
}

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      reducedMotion: "reduce"
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "投資總覽" }).waitFor({ timeout: 20000 });
    const nav = page.locator(".app-mobile-nav");

    await checkLayout(page, viewport.name, "home");

    await nav.getByRole("button", { name: "投資組合", exact: true }).click();
    await page.getByRole("heading", { name: "投資組合" }).waitFor();
    await checkLayout(page, viewport.name, "portfolio");

    await page.getByRole("button", { name: "ETF 穿透", exact: true }).click();
    await page.getByRole("heading", { name: "同一家公司，分別透過哪些 ETF 持有？" }).waitFor();
    await checkLayout(page, viewport.name, "cross-etf");

    await nav.getByRole("button", { name: "研究", exact: true }).click();
    await page.getByRole("heading", { name: "研究中心" }).waitFor();
    await page.getByRole("button", { name: "ETF 深度", exact: true }).click();
    await page.getByText("ETF Research · Look-through + Attribution").waitFor();
    await checkLayout(page, viewport.name, "etf-research");

    await nav.getByRole("button", { name: "我的", exact: true }).click();
    await page.getByRole("heading", { name: "設定與資料" }).waitFor();
    await checkLayout(page, viewport.name, "settings");

    await page.getByRole("button", { name: "切換深色模式" }).click();
    await checkLayout(page, viewport.name, "settings-dark");

    // End-to-end CSV interaction with demo-only data in a fresh browser context:
    // preview -> confirm -> guarded undo. No personal portfolio is involved.
    const csv = [
      "symbol,name,market,type,quantity,price,averageCost,currency,sector,account",
      "2330,台積電,TW,stock,2,1000,900,TWD,半導體,測試券商"
    ].join("\n");
    await page.locator('input[type="file"][accept=".csv,text/csv"]').first().setInputFiles({
      name: "mobile-smoke-holdings.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv, "utf8")
    });
    const preview = page.locator("#holding-csv-import-preview");
    await preview.getByText("mobile-smoke-holdings.csv", { exact: false }).waitFor();
    await preview.getByRole("button", { name: /確認套用 1 筆/ }).waitFor();
    await checkLayout(page, viewport.name, "csv-import-preview");

    page.once("dialog", (dialog) => dialog.accept());
    await preview.getByRole("button", { name: /確認套用 1 筆/ }).click();
    const undoHeading = page.getByRole("heading", { name: "最近一次持股 CSV 匯入 · 一步撤銷" });
    await undoHeading.waitFor();
    await checkLayout(page, viewport.name, "csv-import-undo");

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "撤銷這次匯入" }).click();
    await undoHeading.waitFor({ state: "detached" });
    await context.close();
    console.log(`PASS ${viewport.name}: home, portfolio, cross-ETF, ETF research, settings, dark mode`);
  }
} finally {
  await browser.close();
}
