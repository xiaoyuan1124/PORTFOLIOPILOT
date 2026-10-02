import type { Metadata } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "隱私權政策 | PortfolioPilot",
  description: "PortfolioPilot 隱私權政策"
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto min-h-dvh max-w-3xl px-5 py-10 text-[#1b241f] dark:text-[#e7eee9] sm:px-8 sm:py-14">
      <a href={`${basePath}/`} className="text-sm font-semibold text-[#335b46] dark:text-[#a8dab8]">← 返回 PortfolioPilot</a>
      <h1 className="mt-8 text-3xl font-semibold tracking-tight">PortfolioPilot 隱私權政策</h1>
      <p className="mt-2 text-sm text-black/45 dark:text-white/45">最後更新：2026 年 10 月 2 日</p>

      <div className="mt-8 space-y-8 text-sm leading-7 text-black/65 dark:text-white/65">
        <section>
          <h2 className="text-lg font-semibold text-black/85 dark:text-white/85">1. 核心原則</h2>
          <p className="mt-2">
            PortfolioPilot 採 Local-first 設計，不要求建立帳號，也不連接券商帳密。你輸入的持股、交易／現金流、投資筆記、ETF 成分來源與淨值快照，預設儲存在你的裝置上。
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-black/85 dark:text-white/85">2. 我們不主動收集的資料</h2>
          <p className="mt-2">
            PortfolioPilot 目前沒有自營後端、使用者帳號、廣告 SDK、分析 SDK 或雲端同步服務。我們不主動上傳你輸入的投資組合內容，也不出售個人資料。
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-black/85 dark:text-white/85">3. 網路連線與公開資料</h2>
          <p className="mt-2">
            App 可能透過網路讀取 PortfolioPilot 發布於 GitHub Pages 的公開靜態資產與市場資料。網路供應商與託管服務可能依其自身政策處理一般連線資訊，例如 IP 位址、請求時間與技術性日誌；PortfolioPilot 不會把你本機輸入的持股內容附加到這些公開資料請求中。
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-black/85 dark:text-white/85">4. 本機儲存、通知與隱私保護</h2>
          <p className="mt-2">
            Web/PWA 使用瀏覽器本機儲存；Native App 另外使用 Capacitor Preferences 保存耐久副本。Native 本機通知由裝置排程，不需要遠端推播伺服器。Native 隱私保護可遮蔽 App Switcher 中的投資資料；Android 啟用時也可能阻擋截圖與螢幕錄影。
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-black/85 dark:text-white/85">5. 保留與刪除</h2>
          <p className="mt-2">
            你的 PortfolioPilot 資料主要保留在你的裝置上，直到你自行清除、匯入覆蓋、移除網站資料或解除安裝 App。你可在 App 內重設資料，或使用作業系統／瀏覽器提供的清除儲存功能。解除安裝 Native App 會移除該 App 的本機 Preferences 資料。
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-black/85 dark:text-white/85">6. 第三方元件</h2>
          <p className="mt-2">
            PortfolioPilot 使用開源前端與 Capacitor 元件提供介面、本機儲存、通知與隱私保護。現行版本沒有將個人投資資料交給廣告商、資料經紀商或 AI 服務。
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-black/85 dark:text-white/85">7. 政策變更與聯絡</h2>
          <p className="mt-2">
            若未來加入雲端帳號、付費服務、分析、AI 或其他會改變資料處理方式的功能，本政策與 App Store 隱私申報會同步更新。需要協助或對隱私有疑問，請前往
            {" "}
            <a href={`${basePath}/support/`} className="font-semibold text-[#335b46] underline underline-offset-4 dark:text-[#a8dab8]">PortfolioPilot 支援頁面</a>。
          </p>
        </section>
      </div>
    </main>
  );
}
