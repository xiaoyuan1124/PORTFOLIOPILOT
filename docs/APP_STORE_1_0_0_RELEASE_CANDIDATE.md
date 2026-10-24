# PortfolioPilot 1.0.0 (1) — App Store / TestFlight Release Candidate

Prepared: 2026-10-24 · Source base: main `3683d806b5aa977b9abd2198bb528e1d72845d51`
Release status: **candidate only; NOT an Apple-signed/TestFlight-verified build**.

## Launch scope freeze

- Native app and GitHub Pages, local-first portfolio storage, account and holdings management, official TWSE/TPEx/MOPS research, ETF look-through, performance and portfolio risk.
- Strategy Lab V0.92 and V0.93 remain present as **experimental research only**: dated official TWSE daily OHLCV where available, editable research thresholds, close-only data exclusions, next-session-opening simulations, integer shares, transaction costs and chronological holdout summaries.
- Native WidgetKit and App Group sharing are included in the release candidate, but **must pass TestFlight real-device acceptance** before public submission.
- The UI must not imply live trading prices, guaranteed strategy performance or always-on price alerts. No broker orders, investment execution, financing or paid API.
- **Deferred to future app updates:** V0.94 portfolio-relative strategy sizing, V0.95 after-close monitoring/alerts, automated background push, expanded market backtesting, ongoing Strategy Lab improvements. Do not promote deferred features in store screenshots or metadata.
- Never touch the user's local investment data, app identity `com.sy1124.portfoliopilot`, widget ID `com.sy1124.portfoliopilot.widgets` or App Group `group.com.sy1124.portfoliopilot`.

## App Store Connect draft (zh-Hant / Taiwan)

App name: PortfolioPilot
Subtitle: 投資組合、ETF 與策略研究
Primary category: Finance (account owner must confirm fit and financial-app licensing obligations).
Pricing: Free; no IAP or subscriptions in release 1.0.0.
Keywords: ETF,台股,美股,持股,回測,均線,風險,資產配置

Description:

PortfolioPilot 是以 iPhone 為主的個人投資整理與研究工具，幫助你將持股、現金流、ETF 曝險、績效及研究紀錄整理在同一個地方。

主要功能：
• 自行記錄台股、美股與 ETF 投資組合、交易及現金流。
• 檢視投資績效、資產配置、持股集中度與 ETF 重複曝險。
• 透過官方公開資料研究個股、ETF 成分與歷史變化，清楚顯示資料來源與更新日期。
• 在 Strategy Lab 設定研究觀察價與指標條件，查看歷史實驗回測，並了解樣本、交易成本與資料不足的限制。
• 在裝置本機儲存個人投資資料，支援匯入匯出及備份；iPhone 版本提供桌面小工具與本機通知相關功能。

注意事項：
PortfolioPilot 是個人資訊整理及歷史研究工具，不是券商交易平台，不代為下單，也不提供保證獲利的投資建議。市場行情可能延遲，研究指標和回測不能預測未來，使用前請查看資料日期與風險揭露。

What's New (1.0.0):
首個正式版本：投資組合整理、ETF 研究、績效與風險分析，以及實驗性 Strategy Lab 回測工具。

Support URL: https://xiaoyuan1124.github.io/PORTFOLIOPILOT/support/
Privacy Policy URL: https://xiaoyuan1124.github.io/PORTFOLIOPILOT/privacy/

Reviewer notes (English, to adapt after real-device testing):
This is a self-directed, local-first portfolio recordkeeping and historical research tool. No brokerage account, broker credential, bank connection, real-money trading, order placement, margin, subscription, advertisement or paid remote market-data service is involved. The app does not ask the reviewer to sign in. Strategy Lab is an explicitly labeled historical simulation and does not produce guaranteed returns. Market data is sourced from publicly available dated resources and may be delayed. iOS Widgets require user opt-in to share selected local data via the App Group. Please validate available UI and real-device controls in the submitted TestFlight build. No beta-only or unavailable features are represented in the listing.

## Release gates: do NOT submit until each is proven

- [ ] Merge this candidate after exact-head CI / mobile smoke / native unsigned iOS archive PASS. Confirm both `package.json` and `native/app-store.json` are 1.0.0 and Build 1.
- [ ] Confirm the App Store Connect record exists for the exact bundle ID. If a `1.0.0 (1)` build already exists in App Store Connect, **increment buildNumber on a new audited commit first**. Do not overwrite an existing build identity.
- [ ] In GitHub `portfolio-testflight` environment, confirm eight secrets exist (their **names only**, never expose values or screenshots of them):
  - `PORTFOLIOPILOT_APPLE_TEAM_ID`
  - `PORTFOLIOPILOT_ASC_KEY_ID`
  - `PORTFOLIOPILOT_ASC_ISSUER_ID`
  - `PORTFOLIOPILOT_ASC_API_KEY_P8_BASE64`
  - `PORTFOLIOPILOT_IOS_DISTRIBUTION_P12_BASE64`
  - `PORTFOLIOPILOT_IOS_DISTRIBUTION_P12_PASSWORD`
  - `PORTFOLIOPILOT_IOS_APP_STORE_PROFILE_BASE64`
  - `PORTFOLIOPILOT_IOS_WIDGET_PROFILE_BASE64`
- [ ] Confirm certificate private key matches both Apple-provisioned App Store profiles; two bundle IDs and shared App Group are correct.
- [ ] Manual GitHub workflow `TestFlight Upload` on **latest main only**, explicit inputs `UPLOAD` and `com.sy1124.portfoliopilot`. The workflow must pass signed archive, signed app/widget App Group verification and upload step. Do not rerun historical failing SHAs.
- [ ] Verify Apple finishes processing the exact build in App Store Connect, and that a tester can install it from TestFlight.
- [ ] On a physical iPhone: clean launch, safe area, offline mode, import/export JSON + CSV, persistent holdings and backup restore, privacy screen, notification permission + tap, WidgetKit add/update/opt-in/revoke, dark/light UI and app reopening. See `docs/NATIVE_DEVICE_VALIDATION.md`.
- [ ] Prepare truthful iPhone screenshots from the shipping interface **without real/private holdings or artificial live-return claims**; required dimensions are dictated by App Store Connect at submission.
- [ ] Review app name availability, age rating, App Privacy questionnaire, export compliance, seller/contact/support details, territorial rights, official market-data reuse permissions and financial-services licensing/Apple review classification. If there is a permission issue, resolve it instead of evading review.
- [ ] Select the successfully processed build and submit to App Review only after all preceding checks.
- [ ] Record exact SHA, workflows, App Store Connect build status, real-device QA and screenshot evidence. No unverified PASS marks.

## Evidence at candidate creation

- main SHA `3683d806b5aa977b9abd2198bb528e1d72845d51` had CI `40100148487` success and Pages `40100148422` success.
- PR #178 branch head `5d9e88ece28332bd667018589e8b94850151e311` had CI `40099806108`, Mobile `40099806148` and Native iOS Smoke `40099806102` successful.
- Signed Apple Distribution / Apple upload / physical-device installation remain **UNVERIFIED**.
- Open issues: #171 Apple signing; #159 TWSE benchmark response reliability. Track these independently of version readiness.

## Release identities

- App: `com.sy1124.portfoliopilot`
- Widget: `com.sy1124.portfoliopilot.widgets`
- App Group: `group.com.sy1124.portfoliopilot`
- Version: `1.0.0`
- Build: `1`
- No second app, no new repository, no Supabase.
