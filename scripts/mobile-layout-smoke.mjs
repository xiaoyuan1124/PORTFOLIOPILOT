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
    // A single source folder is available from every section; it carries
    // original publisher URLs and holding price dates instead of page clutter.
    await page.getByRole("button", { name: "資料來源", exact: true }).click();
    const sourceHub = page.locator('[data-testid="data-sources-hub"]');
    await sourceHub.waitFor();
    await sourceHub.getByText("本機持股價格").waitFor();
    await sourceHub.getByText("台股收盤價", { exact: true }).waitFor({ timeout: 20000 });
    await sourceHub.locator("details").filter({ hasText: "台股收盤價" }).first().locator("summary").click();
    await sourceHub.getByRole("link", { name: "查看本站公開快取" }).first().waitFor();
    await checkLayout(page, viewport.name, "source-hub");
    await page.getByRole("button", { name: "關閉", exact: true }).click();
    const onboarding = page.locator('[data-ux-role="home-first-run"]');
    if (await onboarding.count()) {
      assert.equal(await onboarding.locator('[data-ux-role="home-first-run-help"]').getAttribute("open"), null,
        "first-run instructions are optional details");
      await onboarding.getByRole("button", { name: /新增持股/ }).waitFor();
    }
    const homeSecondary = page.locator('[data-ux-role="home-allocation-details"]');
    await homeSecondary.waitFor();
    assert.equal(await homeSecondary.getAttribute("open"), null, "secondary holdings and sectors should not dominate the first viewport");
    const dailySecondary = page.locator('[data-ux-role="daily-drivers-details"]');
    await dailySecondary.waitFor();
    assert.equal(await dailySecondary.getAttribute("open"), null, "daily attribution should be summarized by default");
    await page.locator('[data-ux-role="daily-key-metrics"]').waitFor();
    await homeSecondary.locator("summary").click();
    await page.getByRole("heading", { name: "帳戶分布" }).waitFor();
    await checkLayout(page, viewport.name, "home-allocations-expanded");
    await homeSecondary.locator("summary").click();

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
    await page.getByRole("heading", { name: "ETF 成分與績效" }).waitFor();
    // The verbose introduction has been removed; research starts with the actual ETF data.
    await page.getByRole("button", { name: "重新整理" }).first().waitFor();
    const etfDataStatus = page.getByRole("status", { name: "ETF 官方資料狀態" });
    await etfDataStatus.waitFor();
    await page.waitForFunction(() => {
      const status = document.querySelector('[role="status"][aria-label="ETF 官方資料狀態"]');
      return status && (/非盤中即時行情|台股官方收盤行情未載入/.test(status.textContent ?? ""));
    });
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
    await page.getByRole("heading", { name: "2317 · 鴻海", level: 4, exact: true }).waitFor();
    await checkLayout(page, viewport.name, "strategy-lab");
    const strategyConfig = page.locator('[data-ux-section="strategy-parameters"]');
    assert.equal(await strategyConfig.getAttribute("open"), null, "strategy configuration defaults to collapsed");
    const watchCards = page.locator('[data-testid="watch-target-card"]');
    assert.equal(await watchCards.count(), 6, "default watchlist must retain all six research stocks");
    assert.equal(await page.locator('[data-testid="watch-target-details"][open]').count(), 0, "detailed indicators must not all be expanded");
    await watchCards.first().locator('[data-testid="watch-target-details"] > summary').click();
    await watchCards.first().locator('[data-testid="watch-target-details"] > div > p').filter({ hasText: "MACD" }).waitFor();
    await checkLayout(page, viewport.name, "strategy-watch-details-expanded");
    await watchCards.first().locator('[data-testid="watch-target-details"] > summary').click();
    await strategyConfig.locator("summary").click();
    await page.getByRole("button", { name: "複製為新策略" }).click();
    assert.equal(await page.locator("select").first().locator("option").count(), 2);
    await checkLayout(page, viewport.name, "strategy-lab-new-profile");
    // New V0.93 backtesting report must fit narrow iPhone screens and
    // fail closed without published official OHLCV.
    await page.locator('[data-ux-section="legacy-backtest"] > summary').click();
    await page.getByRole("heading", { name: "歷史回測報告", exact: true }).waitFor();
    await checkLayout(page, viewport.name, "strategy-backtest-report");
    await page.locator('[data-ux-section="legacy-backtest"] > summary').click();
    await strategyConfig.locator("summary").click();

    // Regression: the former very tall Strategy Lab may leave scroll offset
    // under the sticky header when swapping to its shorter quant subtab.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.getByRole("button", { name: "PilotQuant 量化研究", exact: true }).click();
    await page.getByRole("heading", { name: "個股量化研究", exact: true }).waitFor();
    await page.getByRole("tabpanel", { name: "回測摘要" }).waitFor({ timeout: 20000 });
    await page.waitForFunction(() => window.scrollY <= 2);
    const topGeometry = await page.evaluate(() => {
      const appHeader = document.querySelector(".app-topbar");
      const top = document.querySelector('[data-testid="pilotquant-top"]');
      return { headerBottom: appHeader?.getBoundingClientRect().bottom ?? -1,
        topStart: top?.getBoundingClientRect().top ?? -1 };
    });
    assert.ok(topGeometry.topStart >= topGeometry.headerBottom - 2,
      `${viewport.name}: quant page start is obscured by sticky app header: ${JSON.stringify(topGeometry)}`);
    const advanced = page.locator('[data-testid="pilotquant-advanced"]');
    assert.equal(await advanced.getAttribute("open"), null, "advanced params must default closed");
    const source = page.locator('[data-testid="pilotquant-source"]');
    await source.waitFor();
    assert.match(await source.innerText(), /2330/);
    const metricSummary = page.locator('[data-testid="pilotquant-summary"]');
    assert.equal(await metricSummary.locator(":scope > div").count(), 4,
      "default research screen should show only four key metrics");
    await checkLayout(page, viewport.name, "pilotquant-compact");

    // Disclose detail only on demand, without losing the selected stock.
    await page.locator('[data-testid="pilotquant-full-report"] > summary').click();
    await page.getByText("前 70% · 樣本內", { exact: true }).waitFor();
    await checkLayout(page, viewport.name, "pilotquant-details-expanded");
    await page.locator('[data-testid="pilotquant-full-report"] > summary').click();

    await page.getByRole("tab", { name: "未來情境" }).click();
    await page.getByRole("tabpanel", { name: "未來情境" }).waitFor();
    await page.getByRole("button", { name: "1年", exact: true }).click();
    await checkLayout(page, viewport.name, "pilotquant-year-scenarios");
    await page.getByRole("tab", { name: "交易明細" }).click();
    await page.getByRole("tabpanel", { name: "交易明細" }).waitFor();
    await checkLayout(page, viewport.name, "pilotquant-trades");

    // Return to the old strategy tab; scroll must also reset here.
    await page.getByRole("button", { name: "觀察價與舊策略", exact: true }).click();
    await page.getByRole("heading", { name: "自訂股票研究清單", exact: true }).waitFor();
    await page.waitForFunction(() => window.scrollY <= 2);

    await nav.getByRole("button", { name: "我的", exact: true }).click();
    await page.getByRole("heading", { name: "設定與資料" }).waitFor();
    await page.locator('[data-ux-role="settings-backup-entry"]').waitFor();
    const dataTools = page.locator('[data-ux-role="settings-data-tools"]');
    await dataTools.waitFor();
    assert.equal(await dataTools.getAttribute("open"), null, "low-frequency CSV tools should be folded");
    assert.equal(await page.locator('[data-ux-role="settings-danger"]').getAttribute("open"), null, "destructive actions should be folded");
    await checkLayout(page, viewport.name, "settings");
    await dataTools.locator("summary").first().click();
    await page.getByRole("heading", { name: "完整備份" }).waitFor();
    await page.getByRole("heading", { name: "持股 CSV" }).waitFor();
    await checkLayout(page, viewport.name, "settings-data-tools-expanded");
    await dataTools.locator("summary").first().click();

    // Theme cycling: keep existing forest-dark as the second option,
    // then enter the new screenshot-inspired TradeScope palette.
    await page.getByRole("button", { name: "切換外觀模式" }).click();
    await page.waitForFunction(() => document.documentElement.classList.contains("dark") &&
      !document.documentElement.classList.contains("theme-tradescope"));
    assert.equal(await page.evaluate(() => localStorage.getItem("portfoliopilot:theme")), "dark");
    await checkLayout(page, viewport.name, "settings-dark");

    await page.getByRole("button", { name: "切換外觀模式" }).click();
    await page.waitForFunction(() => document.documentElement.classList.contains("theme-tradescope"));
    const themeColors = await page.evaluate(() => ({
      body: getComputedStyle(document.body).backgroundColor,
      card: getComputedStyle(document.querySelector(".pp-card")).backgroundColor
    }));
    assert.equal(themeColors.body, "rgb(11, 14, 12)", "TradeScope page must be near-black");
    assert.equal(themeColors.card, "rgb(17, 21, 20)", "TradeScope card must have graphite surface");
    assert.equal(await page.evaluate(() => localStorage.getItem("portfoliopilot:theme")), "tradescope");
    await checkLayout(page, viewport.name, "settings-tradescope");

    // The third theme must persist across reload, not just tab changes.
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "投資總覽" }).waitFor();
    await page.waitForFunction(() => document.documentElement.classList.contains("theme-tradescope"));
    await checkLayout(page, viewport.name, "home-tradescope");
    await nav.getByRole("button", { name: "策略", exact: true }).click();
    await page.getByRole("heading", { name: "策略實驗室", level: 1, exact: true }).waitFor();
    const heroContrast = await page.getByRole("heading", { name: "投資策略實驗室", exact: true }).evaluate((heading) => {
      const hero = heading.parentElement;
      return { foreground: hero ? getComputedStyle(hero).color : "", heading: getComputedStyle(heading).color };
    });
    assert.equal(heroContrast.foreground, "rgb(229, 232, 225)", "Graphite hero text must be readable ivory, not original dark-on-mint");
    assert.equal(heroContrast.heading, "rgb(209, 167, 94)", "Graphite hero heading must be warm gold");
    await checkLayout(page, viewport.name, "strategy-tradescope");
    await nav.getByRole("button", { name: "我的", exact: true }).click();
    await page.getByRole("heading", { name: "設定與資料" }).waitFor();

    // Direct selection of any theme also works.
    const themeGroup = page.getByRole("group", { name: "外觀主題" });
    await themeGroup.getByRole("button", { name: /淺色/ }).click();
    await page.waitForFunction(() => !document.documentElement.classList.contains("dark"));
    assert.equal(await page.evaluate(() => localStorage.getItem("portfoliopilot:theme")), "light");
    await themeGroup.getByRole("button", { name: /TradeScope/ }).click();
    await page.waitForFunction(() => document.documentElement.classList.contains("theme-tradescope"));
    await checkLayout(page, viewport.name, "theme-choices-tradescope");

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
    console.log(`PASS ${viewport.name}: legacy themes, TradeScope theme, settings persistence, mobile layouts, report/CSV`);
  }

  // The supplied design reference is a desktop trading terminal.
  // Verify its defining near-black sidebar / gold active navigation at 1440px.
  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: "light",
    reducedMotion: "reduce"
  });
  const desktopPage = await desktop.newPage();
  await desktopPage.goto(url, { waitUntil: "domcontentloaded" });
  await desktopPage.getByRole("heading", { name: "投資總覽" }).waitFor();
  await desktopPage.getByRole("button", { name: "切換外觀模式" }).click();
  await desktopPage.getByRole("button", { name: "切換外觀模式" }).click();
  await desktopPage.waitForFunction(() => document.documentElement.classList.contains("theme-tradescope"));
  const desktopPalette = await desktopPage.evaluate(() => {
    const sidebar = document.querySelector(".app-desktop-sidebar");
    const activeTab = sidebar?.querySelector('nav button[aria-current="page"]');
    return {
      sidebar: sidebar ? getComputedStyle(sidebar).backgroundColor : null,
      active: activeTab ? getComputedStyle(activeTab).color : null,
      contentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth
    };
  });
  assert.equal(desktopPalette.sidebar, "rgb(8, 11, 10)", "desktop rail must match black trading-terminal palette");
  // Tailwind can animate text color between theme modes. Verify the stable
  // computed state, not the first animation frame after applying the class.
  await desktopPage.waitForFunction(() => {
    const active = document.querySelector('.app-desktop-sidebar nav button[aria-current="page"]');
    return active && getComputedStyle(active).color === "rgb(209, 167, 94)";
  }, undefined, { timeout: 2500 });
  assert.ok(desktopPalette.contentWidth <= desktopPalette.viewportWidth + 2, "desktop TradeScope must not horizontally overflow");
  await desktopPage.screenshot({ path: "mobile-artifacts/desktop-tradescope.png", fullPage: false, animations: "disabled" });
  await desktop.close();
} finally {
  await browser.close();
}
