# PortfolioPilot 1.0.0 — submission packet

Status: **NOT submitted; Apple signing, processing and physical-device acceptance UNVERIFIED.**
This packet supplements [release-candidate metadata](APP_STORE_1_0_0_RELEASE_CANDIDATE.md), which contains the copy-ready Traditional Chinese description, subtitle, keywords, What's New and English review notes. It does not authorize legal declarations.

## Verified starting evidence

Source: main `c0e4c8161430df723f485c67bddb5665c354de7f`, version `1.0.0`, build `1`.

| Gate | Result | Evidence |
|---|---|---|
| Main CI | PASS | [40102846319](https://github.com/xiaoyuan1124/PORTFOLIOPILOT/actions/runs/40102846319) |
| Pages | PASS | [40102846325](https://github.com/xiaoyuan1124/PORTFOLIOPILOT/actions/runs/40102846325) |
| PR #181 mobile layout | PASS, browser only | [40102641191](https://github.com/xiaoyuan1124/PORTFOLIOPILOT/actions/runs/40102641191) |
| PR #179 native smoke | PASS, unsigned only | [40100796826](https://github.com/xiaoyuan1124/PORTFOLIOPILOT/actions/runs/40100796826) |
| Actual no-upload preflight | FAIL | [40110079508](https://github.com/xiaoyuan1124/PORTFOLIOPILOT/actions/runs/40110079508): release contract passed; four Distribution signing entries missing |
| Host / Widget Distribution signatures | UNVERIFIED | No successful signed run observed |
| Upload / Apple processing / iPhone acceptance | UNVERIFIED | No evidence; do not infer from unsigned CI |
| App Review / public availability | UNVERIFIED | No submission or approval evidence |

The existing environment has the four API entries. Missing entries are `PORTFOLIOPILOT_IOS_DISTRIBUTION_P12_BASE64`, `PORTFOLIOPILOT_IOS_DISTRIBUTION_P12_PASSWORD`, `PORTFOLIOPILOT_IOS_APP_STORE_PROFILE_BASE64` and `PORTFOLIOPILOT_IOS_WIDGET_PROFILE_BASE64`. Secret presence does not prove validity. Never copy secret values into this packet.

## Signing and build handoff

1. Use [manual Distribution signing instructions](TESTFLIGHT_MANUAL_SIGNING_AND_FREE_ACTIONS.md). A same-Team Distribution certificate may be reused only with its matching private key; Host and Widget must each have their own App Store profile permitting `group.com.sy1124.portfoliopilot`. Do not revoke another app's key or replace its profile.
2. Configure the four missing entries directly in the existing `portfolio-testflight` environment, without putting credentials in source, chat, PRs, Issues or artifacts.
3. Run [Preflight](https://github.com/xiaoyuan1124/PORTFOLIOPILOT/actions/workflows/testflight-preflight.yml) from current main. A PASS only establishes nonempty configuration.
4. In [PortfolioPilot TestFlight](https://appstoreconnect.apple.com/apps/6818449605/testflight), verify bundle identity and whether `1.0.0 (1)` already exists. Do not increment speculatively. If used, update the committed build number **and the release-preflight guard/tests that currently pin Build 1**, then PR, CI, native verification and merge before upload.
5. Run [TestFlight Upload](https://github.com/xiaoyuan1124/PORTFOLIOPILOT/actions/workflows/testflight-upload.yml) from latest main with `confirm_upload=UPLOAD`, `confirm_bundle_id=com.sy1124.portfoliopilot`. Record its exact SHA and run ID.
6. Require signed archive, both signatures, both App Group entitlements and upload success. Confirm the same build in Apple and wait for processing; record its actual status and install it on an iPhone.

## App Store fields and account-holder decisions

| Field | Prepared value / required action |
|---|---|
| Name | PortfolioPilot; confirm name availability in Connect |
| Subtitle | 投資組合、ETF 與策略研究 |
| Language | Traditional Chinese; confirm localization in Connect |
| Description / Keywords / What's New | Copy from the release-candidate document; ensure every advertised native feature passes the shipping-build acceptance |
| Category | Finance proposed; account holder must confirm financial-app eligibility and permissions |
| Price | Free proposed; no IAP or subscriptions in the current product |
| Privacy Policy | https://xiaoyuan1124.github.io/PORTFOLIOPILOT/privacy/ |
| Support | https://xiaoyuan1124.github.io/PORTFOLIOPILOT/support/ |
| Review access | No app account/login required; provide actual navigation instructions and contact details privately in Connect |
| Release | Choose manual release until review approval and final gates are recorded |
| Rights / territories / seller / contacts | Account holder must confirm; do not invent identifiers, licenses or consent |

### Privacy and export preparation — recommendations, not submitted declarations

- Source inspection finds local portfolio storage, Preferences, local notifications and opt-in App Group sharing; no app account, ad SDK or analytics SDK is configured in package.json. Check the final linked SDKs and actual network behavior before final answers.
- A local financial record is not automatically a collected financial-data category: Apple's definition concerns off-device collection accessible beyond servicing a request. Assess static-host connection logs and any support submissions separately. Do not select “Data Not Collected” solely from the local-first label. See [App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/).
- App Groups share data between this app and its extension on the device after opt-in; notification permission is local. Recheck revocation and stale-widget behavior on the signed build.
- For encryption, inspect the final binary and linked dependencies. Apple says OS-provided HTTPS is typically exempt from documentation, but exemption and any reporting obligations require owner confirmation. Do not equate “no custom crypto found” with a legal determination. See [encryption export compliance](https://developer.apple.com/documentation/security/complying-with-encryption-export-regulations).
- Complete the live [age-rating questionnaire](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating/) honestly. Candidate evidence: no in-app chat, user publishing, gambling or real-money trade execution identified; historical strategy simulation is not an actual trading service. Confirm linked web access, content and every questionnaire category. Apple determines the resulting rating; do not promise a numeric rating in advance.

### Financial-app and market-data rights hold

[App Review Guidelines 3.2.1(viii)](https://developer.apple.com/app-store/review/guidelines/#business) addresses financial trading, investing and money-management apps and required institutional submission/licensing. Recordkeeping/research positioning does **not** establish an exemption. Account holder must confirm the product's services, seller eligibility and permissions for each selected territory, and address Apple's classification if queried. Do not relabel to evade review.

[TWSE website terms](https://www.twse.com.tw/zh/terms/use.html) distinguish protected website material from data authorized through the government open-data platform. [Government open-data licensing](https://data.gov.tw/license) applies to datasets actually released under it; public accessibility alone is insufficient.

Before submission, retain per-source authorization evidence for: TWSE/TPEx closing quotes, OHLCV, index history and institutional data; MOPS statements/material events/revenue; and each ETF issuer's constituent files/history. `docs/MARKET_DATA.md` and updater scripts provide technical lineage, **not a license grant**. Record dataset URL, provider, exact applicable terms, attribution, caching/redistribution permission and evidence date. TPEx, MOPS, index and issuer rights remain UNVERIFIED until individually checked. Do not assert all data is commercially reusable or licensed merely because the app is free.

## Truthful screenshot capture sheet

No final App Store screenshots have been produced by this packet. Existing browser smoke images are QA artifacts, not evidence of iPhone installation.

Capture the processed, signed release build on a device or compatible iOS Simulator using an isolated sample dataset. Keep actual user holdings/backups out of screenshots. Never fabricate performance, market dates, status bars or unavailable features. Preserve originals and identify exact build, device, OS and capture date.

| File | Actual screen to capture | Required visible evidence |
|---|---|---|
| 01-overview.png | Overview | Local recordkeeping and dated values; sample data clearly identified |
| 02-holdings.png | Holdings | Accounts/holdings without private real-user information |
| 03-etf.png | ETF research | Source and official trading date, no real-time claim |
| 04-risk.png | Risk / allocation | Actual app visualization without fabricated return claims |
| 05-strategy.png | Strategy Lab | Historical/experimental labeling, costs and risk limitations |
| 06-widget.png | Widget and opt-in controls, if accepted by the slot | Actual working Widget, only after physical acceptance |

Check [Apple screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/) against the slots shown in Connect. The generated project supports iPhone **and iPad** (`TARGETED_DEVICE_FAMILY = "1,2"`), so iPad screenshot requirements must also be satisfied; do not silently remove iPad support just to avoid screenshots. Do not resize a browser image to impersonate native capture.

## Minimal physical-iPhone acceptance record

Use [full native validation](NATIVE_DEVICE_VALIDATION.md) and [Widget acceptance](WIDGETKIT_TESTFLIGHT_RELEASE.md). Preserve a backup of existing user data before testing; use a separate test device/data context for clean-install and import-overwrite tests. Never uninstall the user's existing app or clear their data as an automated test.

Record: Version/build ___; uploaded SHA ___; run ___; Apple status ___; iPhone/OS ___; tester/date ___; evidence location ___ (no private holdings in public evidence).

| Test group | Result (initially UNVERIFIED) |
|---|---|
| Install/launch; no white screen/crash; portrait/landscape safe areas; light/dark | UNVERIFIED |
| Edit test holdings/transactions; force quit/reopen; JSON backup/restore | UNVERIFIED |
| JSON/CSV Files import/export, cancel/malformed/duplicate handling | UNVERIFIED |
| Offline launch/cache; dated ETF/quotes; resume without lost navigation | UNVERIFIED |
| Strategy Lab historical results, insufficient-data states and risk disclosure | UNVERIFIED |
| Notification permission, delivery/tap; App Switcher privacy | UNVERIFIED |
| Widget add, empty before opt-in, update, revoke/clear and App Group isolation | UNVERIFIED |

Only after every relevant gate is proven: complete owner declarations, upload truthful screenshots, select the processed build and submit for App Review. Record the submission ID/status. Approval is distinct from release; only a publicly available App Store listing proves launch completion.
