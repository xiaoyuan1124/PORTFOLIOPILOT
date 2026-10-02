import type { Metadata } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "支援 | PortfolioPilot",
  description: "PortfolioPilot 使用與技術支援"
};

export default function SupportPage() {
  return (
    <main className="mx-auto min-h-dvh max-w-3xl px-5 py-10 text-[#1b241f] dark:text-[#e7eee9] sm:px-8 sm:py-14">
      <a href={`${basePath}/`} className="text-sm font-semibold text-[#335b46] dark:text-[#a8dab8]">← 返回 PortfolioPilot</a>
      <h1 className="mt-8 text-3xl font-semibold tracking-tight">PortfolioPilot 支援</h1>
      <p className="mt-3 text-sm leading-7 text-black/55 dark:text-white/55">
        PortfolioPilot 是 Local-first 投資組合與研究工具。遇到資料、匯入匯出、通知、App 顯示或市場資料問題時，可使用下列方式處理。
      </p>

      <div className="mt-8 space-y-5">
        <section className="rounded-2xl border border-black/7 bg-white/60 p-5 dark:border-white/8 dark:bg-white/4">
          <h2 className="font-semibold">回報問題</h2>
          <p className="mt-2 text-sm leading-6 text-black/55 dark:text-white/55">
            請在 PortfolioPilot GitHub Issues 提供問題描述、裝置／系統版本、操作步驟，以及不包含私人投資資料的畫面或錯誤訊息。
          </p>
          <a
            href="https://github.com/xiaoyuan1124/PORTFOLIOPILOT/issues"
            className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-[#1f332a] px-4 text-sm font-semibold text-white dark:bg-[#dce9e2] dark:text-[#122018]"
          >
            開啟 GitHub Issues
          </a>
        </section>

        <section className="rounded-2xl border border-black/7 bg-white/60 p-5 dark:border-white/8 dark:bg-white/4">
          <h2 className="font-semibold">資料安全建議</h2>
          <p className="mt-2 text-sm leading-6 text-black/55 dark:text-white/55">
            在換手機、重裝 App、清除瀏覽器資料或進行大量匯入前，先從「我的」匯出完整 JSON 備份。若 App 顯示儲存降級或復原提示，請先保留備份再進一步處理。
          </p>
        </section>

        <section className="rounded-2xl border border-black/7 bg-white/60 p-5 dark:border-white/8 dark:bg-white/4">
          <h2 className="font-semibold">隱私權</h2>
          <p className="mt-2 text-sm leading-6 text-black/55 dark:text-white/55">
            查看 PortfolioPilot 如何處理本機投資資料、網路連線與 Native 功能。
          </p>
          <a href={`${basePath}/privacy/`} className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-black/8 px-4 text-sm font-semibold dark:border-white/10">
            查看隱私權政策
          </a>
        </section>
      </div>
    </main>
  );
}
