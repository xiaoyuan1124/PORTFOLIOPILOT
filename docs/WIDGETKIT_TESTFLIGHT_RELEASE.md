# PortfolioPilot · WidgetKit iPhone 發布與實機驗收

狀態：**程式／Simulator 驗證通過；Apple 正式簽署與 iPhone 真機驗收須以實際執行結果為準。**

## 已有基礎

- 既有 App Store Connect 的 PortfolioPilot App 與主 App ID：`com.sy1124.portfoliopilot`（不用重建 App 或另繳費）
- iOS 原生：Capacitor 8 / Swift Package Manager；GitHub Actions 可重建 Xcode project
- Widget Extension：`com.sy1124.portfoliopilot.widgets`，小型投資總覽＋中型自選股
- App Group：`group.com.sy1124.portfoliopilot`
- Swift native bridge 只在使用者明確同意後寫入，不使用後端、不上傳持股
- 最新 iOS Bundle 版本與 build 請以 `native/app-store.json` 為準
- 預設關閉；不提供即時報價，也沒有鎖定畫面小工具

## A. Apple Developer Account — 一次性正式授權

以下步驟必須由 Apple Developer Program 的 **Account Holder / Admin** 完成，或在具備 Apple 權限的簽署環境內完成。它們與 GitHub 程式合併、unsigned Simulator build 是兩件不同的事：

1. 到 [Apple Developer · Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list) → **Identifiers**。
2. 既有主 App ID `com.sy1124.portfoliopilot` 應保留，不要刪掉或改成新的 App。
3. 若尚未存在，新增 **Explicit App ID**：`com.sy1124.portfoliopilot.widgets`。選 iOS 對應類型，建立 Widget Extension 專用識別。
4. 建立 **App Group**：`group.com.sy1124.portfoliopilot`（若同名已存在則沿用）。
5. 分別打開兩個 App ID（主 App、Widget Extension）：啟用 **App Groups** capability，點 **Configure**，把 **同一個 App Group** 指派給兩個 ID，確認儲存。權限變更後舊 provisioning profiles 可能失效，須重新產生或由 Xcode 自動管理。
6. 如果本來就有 App Groups，只需確認這兩個 ID 的授權都已正確配置。**切勿為了本專案修改其他產品的簽署設定**。

## B. GitHub TestFlight signing — 保密憑證

GitHub repo [xiaoyuan1124/PORTFOLIOPILOT](https://github.com/xiaoyuan1124/PORTFOLIOPILOT)，Environment：`portfolio-testflight`。

既有 upload workflow 要求四個 **environment secrets**（不是公開 repository 變數）：

| Secret name | 來源 |
|---|---|
| `PORTFOLIOPILOT_APPLE_TEAM_ID` | Apple Developer Team ID |
| `PORTFOLIOPILOT_ASC_KEY_ID` | App Store Connect **Team API Key ID** |
| `PORTFOLIOPILOT_ASC_ISSUER_ID` | Team API Key Issuer ID |
| `PORTFOLIOPILOT_ASC_API_KEY_P8_BASE64` | `AuthKey_*.p8` 私鑰檔的 Base64 |

所有憑證都必須透過 GitHub Secrets 加密保存；**不可提交到 git、不可在聊天中傳送金鑰或 Base64**。

現有輔助腳本：`scripts/bootstrap-testflight.ps1`（在已有 `gh auth login` 的電腦上執行；`-SkipUpload` 僅設定金鑰）。

### 觸發流程（明確人工允許）

到 [GitHub Actions → TestFlight Upload](https://github.com/xiaoyuan1124/PORTFOLIOPILOT/actions/workflows/testflight-upload.yml) → **Run workflow** → 選 `main`，填入：

- `confirm_upload`：`UPLOAD`
- `confirm_bundle_id`：`com.sy1124.portfoliopilot`

保持現有手動二次確認門檻，不因程式建置成功而自動上傳。

上傳前 workflow **一定會**：

1. 檢查四個必要的 Secrets。
2. 重建 WidgetKit + Capacitor iOS project。
3. 使用 Apple Team API Key 建立**正式簽署**的 iOS archive。
4. 確認主 App 與 Widget Extension 的 Bundle ID / 版本 / Build 一致。
5. 執行 `npm run native:ios:widget:signed:verify`：
   - 主 App 和 .appex 各自的 Code Signature 有效；
   - 兩者簽署的 Team ID / App ID 正確，皆非 Debug 簽章；
   - **兩份 Apple provisioning profiles 各自允許 `group.com.sy1124.portfoliopilot`**；
   - 授權未過期，主 App 和 Widget 都使用合法的 App ID。
6. 只有以上檢查全數 PASS，才會將確切 archive 上傳 App Store Connect。

若報錯 `App Group missing from the provisioning profile`：回 A 步確認 Apple Developer 的 **兩個** App ID 與 App Group 關聯，再重新產生 profile，不能繞過。若 Secrets 缺少，workflow 會停止，不會改成 unsigned upload。

### CI signing diagnostics

If `Build signed App Store archive` reports **"Your team has no devices from which to generate a provisioning profile"** and **"No iOS App Development provisioning profiles"**, the generated Release target was being signed as a development installation. TestFlight requires an **Apple Distribution** identity and App Store Connect provisioning profiles for both `com.sy1124.portfoliopilot` and `com.sy1124.portfoliopilot.widgets`; test-device UDIDs are **not** required for App Store distribution.

The signed-archive script now explicitly selects `CODE_SIGN_IDENTITY=Apple Distribution` for both targets while retaining Xcode automatic provisioning, API key authentication, and the fail-closed signed entitlement verification. If the next run reports **"No signing certificate Apple Distribution found"**, **"No profiles ... App Store"**, or a cloud-signing authorization error, this indicates an Apple certificate/profile/permission problem that cannot be repaired by adding development devices. Ensure the Apple Team and both App IDs support App Groups and the Apple Developer account permits App Store distribution signing. Review [Apple distribution signing](https://developer.apple.com/help/account/provisioning-profiles/create-an-app-store-provisioning-profile). Do not create an ad-hoc profile or bypass signature verification.

## C. TestFlight 與 iPhone 驗收

確認 GitHub Actions workflow 成功 **不等於** Apple 已處理完畢。到 [App Store Connect](https://appstoreconnect.apple.com/) → PortfolioPilot → TestFlight 確認版本已可供測試，並從 iPhone TestFlight 安裝。

實機驗收項目：

- [ ] iPhone 能安裝、啟動 App，原有本機持股、交易與筆記未被修改。
- [ ] 主畫面長按 → 編輯 → 加入小工具，搜尋 `PortfolioPilot`；可找到**小型投資總覽**和**中型自選股**。
- [ ] 尚未授權時，兩款 Widget 顯示安全空狀態，沒有私人金額。
- [ ] App → 我的 → iPhone 主畫面小工具 → `允許小工具顯示摘要`，有明確風險告知與確認。
- [ ] 授權後顯示實際本機投資摘要；自選股報價有最近官方收盤日，不被誤認為盤中即時行情。
- [ ] 從 App 修改持股或自選股後，重新開啟 App 並等待 iOS WidgetKit 更新；顯示內容與本機資料一致（iOS 不保證立即刷新）。
- [ ] `關閉並清除小工具資料` 後，主 App 的持股保持不變，Widget 回到安全空狀態。
- [ ] 再啟用時不會先露出上次分享的舊金額；切到 Demo 狀態也不能公開顯示 Demo 持股。
- [ ] 在離線與重開機情境下不虛構行情，且不會因舊快取把最新收盤日誤寫為「即時」。
- [ ] 小工具點擊可開啟主 App；資料共享失敗時有合理提示，不會偷偷寫入私人資料。

將實機驗收記錄為單獨的 PASS／FAIL，不以 GitHub Actions 的模擬器 PASS 代替。

## 範圍限制

本版本沒有後端帳號、同步伺服器、WebSocket 即時行情、持續背景監控，也沒有主畫面即時秒跳報價。GitHub Pages/PWA 無法安裝 WidgetKit Extension。正式 iPhone 安裝需要 Apple 已授權的簽署版本；沒有 Apple 帳號授權、`.p8` 和 Provisioning Profiles 時，程式自動化無法代為完成上述外部步驟。
