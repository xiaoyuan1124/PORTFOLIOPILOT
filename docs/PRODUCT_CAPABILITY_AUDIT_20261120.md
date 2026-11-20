# PortfolioPilot implementation audit — 2026-11-20

Base main commit: `1d6a259df56ce50c82a2dc59401741135ec357c9`. Feature PR #194 commit `be5cc70436a0e17343da69de9bc8fa0a88620f60`; this PR #195 continues on PR #194, not on a rewritten main. Open overlapping UX PR #191 and native/data/provenance PR #193 remain unmerged and must be reconciled, not blindly applied.

Status vocabulary: **完整** = implemented for explicitly bounded documented scope (not all user-wishlist fields); **已有但不完整**; **Bug/風險**; **需要整合**; **未開發**; **資料/授權受限**. These are code-audit judgments, not physical-device acceptance.

| 原有能力 | 使用者疑問／工作 | 實際稽核 | 優先 | 本 PR 改動／限制 |
|---|---|---|---|---|
| Dashboard / 淨值 | 小額走勢怎麼看；為何缺日期 | 已有但不完整 | P0 | 1D/1W/1M/3M/6M/YTD/1Y/ALL 真實資料，放大／零起點、精簡數值；無歷史不畫線；不宣稱關閉 iOS 仍可自動生成私有資產快照 |
| 台股收盤報價 | 不開 App 能否取得最新日期 | 有 GitHub cron；iOS 原 bundle 凍結 | P0 | 承接 #194 原生公開資料遠端快取；新增快取健康稽核，未確認官方假期保留未知 |
| TWSE/TPEx 歷史 | 日期缺漏、期貨與休市 | 已有但不完整 | P0 | 已有增量補抓與失敗清單；新增獨立健康檢查；資料不可得不補零 |
| 美股行情 | 美國日期和台灣日期是否混用 | 尚未開發／免費授權待解 | P0/P2 | 不假裝已支援官方 US 每日資料；USD 持股價格及 FX 可手動維護 |
| Portfolio 持股／現金 | 我到底持有哪些／怎麼新增 | 已有 | P0 | 收斂卡片密度；完整資產輸入、現金和價格來源功能仍留 |
| 交易／股息／XIRR／TWR | 投入本金是否等於獲利 | 已有，日期/資料完整度限制 | P0/P1 | 首頁明說淨值變動包含入出金；投資報酬至 Performance，缺 TWR 邊界不假裝 Exact |
| 個股 Snapshot | 一檔股票基本面/法人何處看 | 需要整合 | P1 | 精簡單檔摘要：股價、PE、營收 YoY、法人 10D、選股關卡、來源日；詳細資料按需展開 |
| 財報 EPS/ROE/FCF/負債 | 是否合理估值 | 尚未開發／來源待驗 | P1 | 目前季度快取只保證毛利率及相應官方成本、收入，不能杜撰 EPS/自由現金流或合理價 |
| 估值 PE/PB、營收、毛利率 | 低 PE 能否買 | 已有但不完整 | P1 | 非正 PE 不得顯示為低估保證；已新增需使用者自行核對 EPS 的三情境 PE 敏感度計算，不當官方共識 |
| Official Scanner | 4 條件是否成立 | 完整（現有 4 關範圍） | P1 | 沿用舊邏輯；一眼摘要顯示過關數及缺值 |
| 技術日 K/週月 K/分時 K | 趨勢、量價與均線 | 現有官方收盤史／策略 OHLCV，週月/分時整合未完成 | P1/P2 | 現有官方收盤史新增 MA5/10/20/60/120/240、Wilder RSI14、MACD12/26/9 與 60D 高低收盤；另對既有 6 檔 Strategy Lab 官方上市股票 OHLCV 添加日/週/月 K、KD、日量比；上櫃及未涵蓋公司不捏造 K 棒或分時資料 |
| 法人 5／10／20／60 日 | 外資與投信近期買賣超是否改善 | 原有 10D；長期未建立 | P1/P2 | 新增逐日官方 T86/TPEx 歷史歸檔、5/10/20/60D 真實區間驗證，資料不足為 null；20/60D 隨正式排程漸進累積，不冒充已完整；不等於持股存量 |
| 進出場觀察 | 進場、失效價及風險報酬 | 尚未開發 → 初版完成 | P1 | 新增本機長多試算與筆記儲存；缺費率顯示未知，不當成零費率 |
| Portfolio Risk | ETF 與個股是否重複曝險 | 已有但有資料覆蓋限制 | P1 | 保留 ETF 穿透與未知比例；避免假定覆蓋 100% |
| 資金配置與加碼股數 | 增加資金後缺幾股 | 已有只買不賣 / 本機試算，缺動態策略與費率 | P1/P2 | 保留 contribution-planner；不再做一份重複演算法 |
| 汰弱留強／換股情境 | 何時減碼／替換 | 初版完成，券商實際執行未完整 | P1 | 現有 PortfolioRisk 新增持有/減碼/清倉/換股/加碼、手動費率/最低費/證交稅/匯差、ETF 穿透後曝險；不下單、不推論未來報酬 |
| 自選清單/Strategy Lab | 重複輸入觀察股 | 需要整合 | P1/P2 | 保留兩份既有本機資料，暫不做破壞性結構遷移 |
| 市場風險／恐慌 | 市場恐慌是什麼 | #194 已有獨立三因子模型 | P2 | 附資料日期；非 ToAlpha 全因子指標 |
| 漲跌停/產業輪動/台指期 | 市場資金去哪 | 部分產業脈動已有，其他來源受限 | P2 | 不憑空推估漲跌停原因或期貨淨部位 |
| ETF 成分與調倉快照 | 009816／00412A 成分變動 | 已有台股可得成分與歷史對比，海外 ETF 不完整 | P2 | 新增兩檔 ETF 共同成分交集與最低重疊權重，未知部分仍未知；不同資料日警示；不把 ETF 當一般公司 PE |
| PilotQuant | 回測能否打敗指數 | 已有 holdout 與價格指數比較，限制多 | P2 | 沿用原模型；不把 P10/50/90 誤稱客觀勝率 |
| 價格提醒 | App 關閉仍會通知嗎 | 已有本機通知基礎／系統排程，非 24/7 遠端推播 | P2 | 不承諾 iOS 即時後台監控 |
| 凱基手續費 | 實際最低費/複委託差異 | 未完整、個人優惠無法自動辨識 | P2 | 交易計畫提供全部手動費率，未設定則只顯示毛額 |
| 研究日誌 | 保存決策和失效條件 | 已有日誌 | P1 | 交易觀察計畫直接存回既有 journal |
| 原生 iPhone / WidgetKit | 能否上架使用 | 已有 Capacitor / WidgetKit / TestFlight 工作流，簽署／真機未確認 | P0 | 新 UI 需新原生 build、重新測試；不可把 CI simulator 當真機 |
| PWA／Pages | 幾天不開是否更新 | 已有 GitHub Pages 與 Actions，cron 非保證時間 | P0 | #194 公開遠端快取；新增日期稽核 Action，後台未必準時 |
| 資料出處 | 不想看一堆來源註解 | 需要整合（PR #193 尚未合併） | P0 | 我的 > 資料與方法：按需取得官方原始 URL、日期、計算限制 |
| UX 字體與留白 | 第一屏資訊太少/字太大 | 已有但不完整 | P0 | 全域 Metric/card/header 縮減、空帳戶情境移除假圖、研究摘要前置 |

## Reuse rather than duplicate
- The existing `CompanySnapshotResearch`, `Official Scanner`, `PortfolioRisk`, `ContributionPlanner`, `Journal` and `PilotQuant` remain the authoritative modules.
- No new persistent state schema for allocations or journal entries; the trade observation is stored as the existing `JournalEntry` fields.
- PR #191/#193 must be reconciled file-by-file before merge. PR #193 attempts native BGAppRefreshTask: best-effort, **not guaranteed daily refresh**.
- Backend remains zero / private data never sent to GitHub market cache; GitHub Pages contains only public official research files.
- Public market daily refresh and private investment NAV have different guarantees; no future dates, holidays or guessed prices.

## Validation gates
- Review exact-head CI lint, TS, Vitest, Next static build and native build on the **full combined branch**.
- Mobile screenshots at 375/390/430px portrait and landscape; measure true scrollHeight and primary task path rather than only overflow.
- Dedicated `node --test scripts/lib/market-health.test.mjs` + `node scripts/audit-market-health.mjs` for checkouts with valid published cache.
- Device-only: native offline/foreground, large-font VoiceOver, backup/restore, smart-alert delivery, WidgetKit and signed TestFlight.

## Next staged work not silently counted as finished
Licensed/free US daily feed and timezone-aware holiday schedule; official EPS and cash-flow cache; support/resistance and defensible scenarios with assumptions; institutional 5/20/60 and ownership stock; sector/limit radar with missing-event attribution; dynamic sell/replace rebalancing with broker fee and exact lot rules; ETF official distribution policies and manager histories; real-device verification and user task-timing trials.
