# PortfolioPilot｜零付費插件與 TestFlight 正式簽署

查核日期：2026-10-24（適用於目前的公開 GitHub Repository）。

## 1. GitHub Action / Runner 費用稽核

Repo: `xiaoyuan1124/PORTFOLIOPILOT`（目前 **Public**）。

8 個工作流程：`ci.yml`、`market-data.yml`、`mobile-ui.yml`、`native-ios.yml`、`pages.yml`、`price-history.yml`、`quotes.yml`、`testflight-upload.yml`。

- 僅使用 GitHub 官方 Actions：`actions/checkout`、`actions/setup-node`、`actions/configure-pages`、`actions/upload-pages-artifact`、`actions/deploy-pages`、`actions/upload-artifact`。
- 僅使用標準 `ubuntu-latest` 與 `macos-26` runner，未使用額外計費的 Larger Runner、第三方 Marketplace Action。
- 目前的 GitHub 官方條款：**公開儲存庫使用標準 GitHub-hosted runner 不計 Actions 執行分鐘費**，GitHub Pages 也提供免費託管。新增非官方 Action／付費 runner 前，應重新稽核。
- **不要把 Repo 變更為 Private 而不重新查核預算**：Private Repo 使用者有依方案計算的免費分鐘數和儲存額度，超過可能收費。
- 腳本 `node scripts/audit-free-github-actions.mjs` 會針對所有 workflow fail closed，檢查未經審查的 Actions 和 runner，並在 CI 拒絕 Private Repo 的變更。
- npm/Capacitor 是套件，並不等於已連結付費雲端服務。本專案程式建置沒有額外的 SaaS 訂閱要求。GitHub Actions 成本結論不保證第三方網路資料授權永遠不變。

官方依據：
- https://docs.github.com/en/actions/reference/runners/github-hosted-runners
- https://docs.github.com/en/billing/concepts/product-billing/github-actions

Apple Developer Program 會員年費為**獨立的既有成本**，不包含在 GitHub Actions 費用內；既有會員與 TestFlight 不必為每個 App 重複購買。

## 2. 為什麼 #1～#3 的 TestFlight 簽署失敗

- #1 初次執行缺 GitHub Secrets；重試後可讀取 API Key，但自動簽署錯誤地尋找 **開發** Provisioning Profiles，要求測試裝置。
- #2 `Apple Distribution` 被設為 **所有 Swift Package Target 的全域覆寫**，造成 Capacitor plugin 的 `conflicting provisioning settings`。
- #3 全域覆寫已去除，但主 App 與 WidgetKit 仍同時使用 Automatic development signing 和手動 Distribution identity，發生 `conflicting provisioning settings`。
- PR 的 unsigned Simulator 驗證不能代替 Apple 正式簽署。

**解法：明確的 Apple Distribution .p12，以及主 App／Widget Extension 各自的 App Store Connect Distribution Provisioning Profile。**

發行上傳不需要註冊 iPhone UDID，請勿建立 Development 或 Ad Hoc Profiles 來規避此錯誤。

## 3. Apple Developer — 只需第一次建立

需要 Apple Developer Program **Account Holder / Admin** 權限。若你需要**新建**簽署身分，依 Apple 官方流程應使用可信任的 Mac／Xcode 建立並匯出含私鑰的 `.p12`。但若已有同一 Apple Team 的 Expo EAS iOS 建置憑證，可先嘗試從 Expo 下載**既有** `.p12`（見第 6 節），不必重新建立憑證。單靠 App Store Connect API `.p8` 不能簽署 iOS App。

1. 打開 https://developer.apple.com/account/resources/certificates/list 。
2. 在 Xcode → Settings → Accounts → Manage Certificates 選擇或建立 **Apple Distribution** certificate。建立時私鑰留在該 Mac 的 Keychain；Apple 網頁看到的公鑰憑證 `.cer` 本身不能簽署。
3. 在 Xcode Certificate Manager 以 Export Certificate 匯出**含私鑰**的 `.p12`，設定強密碼；或使用 Keychain Access 匯出同一個身分。不要把 `.p12` 提交到公開 Repo、寄到聊天、貼到 Issue。
4. 在 https://developer.apple.com/account/resources/identifiers/list 確認兩個 Explicit App IDs：`com.sy1124.portfoliopilot` 與 `com.sy1124.portfoliopilot.widgets`；兩者都啟用 **App Groups** 並加入 `group.com.sy1124.portfoliopilot`。
5. 在 https://developer.apple.com/account/resources/profiles/list 按 `+` → **Distribution → App Store Connect**，為主 App 建立 `PortfolioPilot-AppStore-Host`，選同一張 Distribution Certificate，下載 `.mobileprovision`。
6. 重複上一動作，為 Extension ID `com.sy1124.portfoliopilot.widgets` 建立 `PortfolioPilot-AppStore-Widgets`，選**同一張** Distribution Certificate，下載第二份 `.mobileprovision`。
7. 若 Apple Developer 已有有效的 Distribution Certificate 與兩份 App Store Profiles，可以沿用；只要手邊有對應私鑰的 `.p12`。

Apple 官方：
- https://developer.apple.com/help/account/provisioning-profiles/create-an-app-store-provisioning-profile
- https://help.apple.com/xcode/mac/current/en.lproj/dev154b28f09.html
- https://help.apple.com/xcode/mac/current/en.lproj/dev1bf96f17e.html

## 4. GitHub Environment Secrets：保留原四項，補上四項

到 https://github.com/xiaoyuan1124/PORTFOLIOPILOT/settings/environments ，進入 `portfolio-testflight` → **Environment secrets**。

**既有四組不要動**：
- `PORTFOLIOPILOT_APPLE_TEAM_ID`
- `PORTFOLIOPILOT_ASC_KEY_ID`
- `PORTFOLIOPILOT_ASC_ISSUER_ID`
- `PORTFOLIOPILOT_ASC_API_KEY_P8_BASE64`

**新增四組**：

| Secret 名稱 | Value |
|---|---|
| `PORTFOLIOPILOT_IOS_DISTRIBUTION_P12_BASE64` | 含私鑰的 Apple Distribution `.p12` 檔案轉 Base64 |
| `PORTFOLIOPILOT_IOS_DISTRIBUTION_P12_PASSWORD` | 匯出 `.p12` 時設定的密碼 |
| `PORTFOLIOPILOT_IOS_APP_STORE_PROFILE_BASE64` | 主 App 的 App Store `.mobileprovision` Base64 |
| `PORTFOLIOPILOT_IOS_WIDGET_PROFILE_BASE64` | Widget Extension 的 App Store `.mobileprovision` Base64 |

在可信任的 Mac 本機編碼檔案，例如 `base64 -i <文件路徑> | tr -d '\n' | pbcopy`，把剪貼簿內容**直接貼入 GitHub Secret**，隨後用一般文字覆蓋剪貼簿。亦可在 iPhone「捷徑」App 使用 **選取檔案 → Base64 編碼 → 複製到剪貼簿**；嚴禁使用第三方線上轉檔網站。

公開 Repo 的 GitHub Actions log、PR、Issue 不得包含任何 Base64 憑證或私鑰，且四份檔案不可提交至原始碼。

## 5. 應用程式現在如何安全簽署

`TestFlight Upload` 採用**人工觸發**，並先確認 8 個 GitHub Secrets 非空：

1. 將 App Store Connect API Key 準備於 Runner 的暫存區。
2. 從 GitHub Secrets 建立臨時 macOS Keychain，匯入並核對 `.p12` 的 Apple Distribution 身分；下載與安裝兩份 Apple 核發的 App Store Profiles。
3. 在 Xcode 26 使用 `~/Library/Developer/Xcode/UserData/Provisioning Profiles` 安裝核發的兩份 Profiles（Xcode 16+ 已不使用舊的 `~/Library/MobileDevice/Provisioning Profiles` 作為主要位置）。接著在建立好的 Xcode Project **只對 Release 主 App 和 Release WidgetKit Target** 設定 `CODE_SIGN_STYLE=Manual`、正確的 Provisioning Profile 與 Apple Team ID，並將 TargetAttributes ProvisioningStyle 一併設為 Manual。Capacitor SwiftPM 依賴不繼承全域 Distribution identity。
4. Xcode Release archive、檢查 App/Widget 兩份簽章、Bundle ID、App Group、發行 Profile 和有效期限；任何不符立即拒絕上傳。
5. 使用手動簽署的 `ExportOptions.plist` 指定兩個 Bundle ID 與各自 Profile，再上傳 App Store Connect。
6. `always()` 清除臨時 Keychain、已安裝的 Profiles 和私鑰暫存檔。
7. GitHub 成功不代表 Apple 已處理完；仍須 App Store Connect TestFlight 顯示可測試並在 iPhone 安裝驗收。

若尚未加入新四組 Secrets，重新執行就會直接在「Validate required GitHub Secrets」階段停止，**不要反覆重跑**。

## 6. 沒有 Mac 的時候

**優先沿用已上架 App 的 Expo EAS 憑證**：若先前的麻將 App 使用同一 Apple Developer Team 和 EAS Build 管理 iOS 簽署，Expo 伺服器可能已保存有效的 Apple Distribution `.p12` 和密碼。使用可信任的 Windows／Linux／Mac 終端機，在該 Expo 專案執行 `eas credentials` → iOS → `Credentials.json: Upload/Download credentials between EAS servers and your local json` → `Download credentials from EAS to credentials.json`，取得已有的 Distribution `.p12`。**勿把下載的 credentials.json、密碼或 `.p12` 提交到公開 GitHub Repo，也不要在聊天中傳送。**

Expo 的舊 App Provisioning Profile **不能直接用在 PortfolioPilot**，兩個新的 App IDs 仍需各自申請 App Store Connect Distribution `.mobileprovision`。如果 EAS 原有憑證已失效或不同 Team，則仍須產生正確憑證。

Expo 官方：https://docs.expo.dev/app-signing/syncing-credentials/

如果沒有既有 `.p12` 可下載，需借用可信任的 Mac 完成一次新的 Distribution 身分建立；之後就能用 GitHub Actions 自動上傳。現有 Apple Developer Program 也已包含每月 **25 小時 Xcode Cloud**，但首次設定一般仍需 Xcode。不要讓 Codex 將 Apple 私鑰輸出至 GitHub 公開 Artifacts。


Apple 官方 Xcode Cloud：https://developer.apple.com/xcode-cloud/get-started/

## 7. 完成定義

### 重用既有 iOS Distribution 身分

Apple 的 [Certificates overview](https://developer.apple.com/help/account/create-certificates/certificates-overview) 亦列出舊型 iOS Distribution 可用於 App Store。已有 `.p12` 的憑證 Common Name 可能為 `iPhone Distribution:`，不必只為名稱不同而撤銷或新建憑證。

上傳準備現在從臨時 Keychain 的 `security find-identity -v -p codesigning` 選出**唯一、有效、同 Team、具私鑰**的 Apple Distribution 或 iPhone Distribution 身分；遇到 Development、錯誤 Team、過期或多個候選即拒絕。兩份 PortfolioPilot App Store profiles 必須同時包含該確切憑證。Release 主 App、Widget 與 export 選用同一 SHA-1 指紋，僅作身分選擇，不用來取代簽章或信任驗證；不將 identity 套到 SwiftPM targets。

Apple [TN3161](https://developer.apple.com/documentation/technotes/tn3161-inside-code-signing-certificates) 說明使用憑證名稱或 SHA-1 hash 消除身分歧義。指紋會在 workflow 中遮罩；私鑰、密碼及 profiles 不應顯示在日誌。這仍須實際 signed archive／雙方 App Group／Apple upload 成功，不能以本機 `.p12` 可解碼代替正式簽署結果。

- [ ] 八組 Environment Secrets 都存在（不可在截圖展示 Value）。
- [ ] Native iOS Smoke Gate / CI 均 PASS。
- [ ] 新的 `TestFlight Upload` 工作流程成功完成 **Build signed App Store archive**、**Verify Apple-signed App Groups profiles** 與 **Upload exact archive**。
- [ ] App Store Connect 已處理該 build 並指派測試人員。
- [ ] iPhone TestFlight 安裝 PortfolioPilot，兩種 WidgetKit 小工具可加入桌面、資料授權／撤銷均驗收通過。
