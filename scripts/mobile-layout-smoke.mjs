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

    // Account/month report filters must work on small touch screens. A
    // historical month filters activities, not the current holdings value.
    await page.getByRole("button", { name: "績效", exact: true }).click();
    await page.getByRole("button", { name: "報告", exact: true }).click();
    await page.getByRole("heading", { name: "投資組合報告" }).waitFor();
    await page.getByRole("heading", { name: "美元持股 · 股價／匯率成本來源" }).waitFor();
    await page.getByRole("progressbar", { name: "美元證券成本核對覆蓋率" }).waitFor();
    await checkLayout(page, viewport.name, "portfolio-report");
    const missingFxFilter = page.getByRole("button", { name: /只看資料不足（.*筆）/ });
    if (await missingFxFilter.count()) {
      await missingFxFilter.click();
      await page.getByRole("button", { name: "顯示所有美元部位" }).waitFor();
      await checkLayout(page, viewport.name, "fx-missing-only");
      await page.getByRole("button", { name: "顯示所有美元部位" }).click();
    }
    const accountFilter = page.getByLabel("帳戶範圍");
    const accountChoices = await accountFilter.locator("option").count();
    if (accountChoices > 1) {
      await accountFilter.selectOption({ index: 1 });
      await page.getByRole("heading", { name: "帳戶績效（資料不足）" }).waitFor();
    }
    await page.getByLabel("活動月份").fill("2026-09");
    await page.getByText("活動 2026-09").waitFor();
    await checkLayout(page, viewport.name, "account-month-report");

    // Regression: switching bottom tabs must not carry a long report's
    // document scroll position into a different section on iPhone.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForFunction(() => window.scrollY > 100);
    await nav.getByRole("button", { name: "研究", exact: true }).click();
    await page.getByRole("heading", { name: "研究中心" }).waitFor();
    await page.waitForFunction(() => window.scrollY <= 2);
    await checkLayout(page, viewport.name, "research-tab-at-top");
    await page.getByRole("button", { name: "ETF 深度", exact: true }).click();
    await page.getByText("ETF Research · Look-through + Attribution").waitFor();
    await checkLayout(page, viewport.name, "etf-research");

    // ETF historical holdings were previously only checked while collapsed.
    // Open the actual chart and full change list: narrow-screen long names
    // and percentage-point strings must not widen the document viewport.
    const historySummary = page.getByText("展開進階歷史成份異動圖表", { exact: true });
    await historySummary.waitFor({ timeout: 20000 });
    await historySummary.click();
    await page.getByText("歷史快照與成份異動／調倉線索", { exact: true }).waitFor();
    await checkLayout(page, viewport.name, "etf-history-expanded");
    const fullChanges = page.locator("summary").filter({ hasText: /^查看全部 \d+ 筆成份變化$/ });
    if (await fullChanges.count()) {
      await fullChanges.click();
      await checkLayout(page, viewport.name, "etf-history-full-changes");
    }

    // Short-range history is readable without trying to land a fingertip
    // on a tiny Recharts tooltip target. Verify each range changes visible
    // dates and does not introduce horizontal overflow.
    const chartRanges = page.getByRole("group", { name: "ETF 歷史價格圖表期間" });
    await chartRanges.waitFor({ timeout: 20000 });
    const chartSummary = page.getByRole("status", { name: "歷史價格區間摘要" });
    assert.match(await chartSummary.innerText(), /^全部 · /);
    const oneMonth = chartRanges.getByRole("button", { name: "1M", exact: true });
    assert.equal(await oneMonth.isDisabled(), false, `${viewport.name}: expected verified one-month ETF close history`);
    await oneMonth.click();
    assert.equal(await oneMonth.getAttribute("aria-pressed"), "true");
    assert.match(await chartSummary.innerText(), /^1M · \d{4}-\d{2}-\d{2} → \d{4}-\d{2}-\d{2} · 價格報酬 /);
    await checkLayout(page, viewport.name, "etf-price-chart-1m");
    await chartRanges.getByRole("button", { name: "全部", exact: true }).click();
    assert.equal(await chartRanges.getByRole("button", { name: "全部", exact: true }).getAttribute("aria-pressed"), "true");
    assert.match(await chartSummary.innerText(), /^全部 · /);

    // Strategy Lab shares the original state/backup flow but has a dedicated
    // small-screen workspace. Check the actual six-seed view for overflow.
    await nav.getByRole("button", { name: "策略", exact: true }).click();
    await page.getByRole("heading", { name: "策略實驗室", level: 1, exact: true }).waitFor();
    await page.getByText("2317 · 鴻海").waitFor();
    await checkLayout(page, viewport.name, "strategy-lab");
    await page.getByRole("button", { name: "複製為新策略" }).click();
    assert.equal(await page.locator("select").first().locator("option").count(), 2);
    await checkLayout(page, viewport.name, "strategy-lab-new-profile");

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
