"use client";

import { useRef, useState } from "react";
import { AlertTriangle, DatabaseBackup, Download, FileSpreadsheet, RotateCcw, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { demoState, emptyState } from "@/lib/demo-data";
import { localDateKey } from "@/lib/calc";
import { parseTaiwanBrokerInventoryCsv } from "@/lib/broker-inventory-csv";
import {
  historicalTradeCsvTemplate,
  importHistoricalTradeCsv
} from "@/lib/historical-trade-csv";
import { buildHoldingLookupCatalog } from "@/lib/holding-autofill";
import { loadBundledTwQuotes } from "@/lib/market-data";
import { loadBundledRevenue } from "@/lib/revenue-data";
import type { AppState, Market } from "@/lib/types";
import {
  csvTemplate,
  downloadText,
  holdingsToCsv,
  holdingMergeConflictCount,
  mergeHoldings,
  parseBackup,
  parseHoldingsCsv,
  serializeBackup
} from "@/lib/local-data";
import { clearRecoveryBackup, getRecoveryBackupRaw, saveState } from "@/lib/storage";
import { Button, Card, CardContent, GhostButton } from "./ui";

export function Settings({ state, onChange, hasRecoveryBackup = false, onRecoveryBackupCleared, storageWriteBlocked = false }: { state: AppState; onChange: (state: AppState) => boolean; hasRecoveryBackup?: boolean; onRecoveryBackupCleared?: () => void; storageWriteBlocked?: boolean }) {
  const jsonRef = useRef<HTMLInputElement>(null);
  const csvRef = useRef<HTMLInputElement>(null);
  const brokerCsvRef = useRef<HTMLInputElement>(null);
  const tradeCsvRef = useRef<HTMLInputElement>(null);
  const [brokerAccount, setBrokerAccount] = useState("");
  const [tradeAccount, setTradeAccount] = useState("");
  const [tradeMarket, setTradeMarket] = useState<"" | Market>("");
  const [usdDraft, setUsdDraft] = useState<string | null>(null);

  function exportRecoveryBackup() {
    const raw = getRecoveryBackupRaw();
    if (!raw) {
      toast.error("目前找不到復原備份。");
      return;
    }
    downloadText(
      `portfoliopilot-recovery-raw-${localDateKey()}.txt`,
      raw,
      "text/plain;charset=utf-8"
    );
    toast.success("原始復原資料已匯出");
  }

  function removeRecoveryBackup() {
    if (!window.confirm("確定要清除復原備份嗎？系統會先把目前畫面中的有效資料設為新的本機基準，再刪除舊的原始復原副本。此動作無法復原。")) return;

    try {
      saveState(state);
    } catch {
      toast.error("無法先儲存目前資料，因此沒有清除復原備份。");
      return;
    }

    if (!clearRecoveryBackup()) {
      toast.error("目前資料已安全儲存，但瀏覽器暫時無法清除舊復原備份。");
      return;
    }

    onRecoveryBackupCleared?.();
    toast.success("目前資料已設為新基準，舊復原備份已清除");
  }

  function exportJson() {
    downloadText(
      `portfoliopilot-backup-${localDateKey()}.json`,
      serializeBackup(state),
      "application/json;charset=utf-8"
    );
    toast.success("JSON 備份已匯出");
  }

  async function importJson(file?: File) {
    if (!file) return;
    try {
      const parsed = parseBackup(await file.text());
      if (!window.confirm("匯入 JSON 會覆蓋目前本機資料，確定繼續？")) return;
      if (!onChange(parsed)) return;
      toast.success("JSON 備份已匯入");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "JSON 格式不正確");
    } finally {
      if (jsonRef.current) jsonRef.current.value = "";
    }
  }

  function exportCsv() {
    downloadText(
      `portfoliopilot-holdings-${localDateKey()}.csv`,
      holdingsToCsv(state.holdings),
      "text/csv;charset=utf-8"
    );
    toast.success("持股 CSV 已匯出");
  }

  async function importCsv(file?: File) {
    if (!file) return;
    try {
      const incoming = parseHoldingsCsv(await file.text());
      const base = state.dataMode === "demo" ? emptyState : state;
      const conflictCount = holdingMergeConflictCount(base.holdings, incoming);
      if (
        conflictCount > 0 &&
        !window.confirm(
          `CSV 有 ${conflictCount} 筆與現有持股的「市場＋代號＋帳戶」相同，繼續會以 CSV 的股數、價格、平均成本等欄位覆蓋現有資料。確定繼續？`
        )
      ) return;

      const merged = mergeHoldings(base.holdings, incoming);
      if (!onChange({ ...base, dataMode: "personal", holdings: merged })) return;
      toast.success(conflictCount > 0
        ? `已匯入 ${incoming.length} 筆持股，其中覆蓋 ${conflictCount} 筆既有資料`
        : `已匯入 ${incoming.length} 筆持股`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "CSV 格式不正確");
    } finally {
      if (csvRef.current) csvRef.current.value = "";
    }
  }


  async function importBrokerInventoryCsv(file?: File) {
    if (!file) return;
    if (!brokerAccount.trim()) {
      toast.error("請先填寫預設匯入帳戶名稱");
      if (brokerCsvRef.current) brokerCsvRef.current.value = "";
      return;
    }

    try {
      const [quotes, revenue] = await Promise.all([
        loadBundledTwQuotes(),
        loadBundledRevenue()
      ]);
      const catalog = buildHoldingLookupCatalog(quotes, revenue);
      const incoming = parseTaiwanBrokerInventoryCsv(
        await file.text(),
        brokerAccount,
        catalog
      );
      const base = state.dataMode === "demo" ? emptyState : state;
      const conflictCount = holdingMergeConflictCount(base.holdings, incoming);

      if (
        conflictCount > 0 &&
        !window.confirm(
          `券商庫存 CSV 有 ${conflictCount} 筆與現有持股的「市場＋代號＋帳戶」相同。繼續會用這次庫存的股數、官方收盤價與平均成本覆蓋既有資料，確定繼續？`
        )
      ) return;

      const merged = mergeHoldings(base.holdings, incoming);
      if (!onChange({ ...base, dataMode: "personal", holdings: merged })) return;

      const dates = [...new Set(
        incoming
          .map((holding) => holding.priceAsOf)
          .filter((value): value is string => Boolean(value))
      )].sort();
      const dateLabel = dates.length === 1
        ? dates[0]
        : dates.length > 1
          ? `${dates[0]}～${dates.at(-1)}`
          : "日期未提供";

      toast.success(
        conflictCount > 0
          ? `已匯入 ${incoming.length} 筆券商庫存，覆蓋 ${conflictCount} 筆既有部位 · 官方價格日 ${dateLabel}`
          : `已匯入 ${incoming.length} 筆券商庫存 · 官方價格日 ${dateLabel}`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "無法匯入券商庫存 CSV");
    } finally {
      if (brokerCsvRef.current) brokerCsvRef.current.value = "";
    }
  }

  async function importHistoricalTradeCsvFile(file?: File) {
    if (!file) return;

    try {
      const base = state.dataMode === "demo" ? emptyState : state;
      const result = importHistoricalTradeCsv(
        base,
        await file.text(),
        tradeAccount,
        tradeMarket || null
      );

      if (!window.confirm(
        `已驗證 ${result.importedCount} 筆歷史買賣。繼續後只會新增 Ledger-only 交易日誌與明確 fee / tax，不會修改目前持股或現金。確定匯入？`
      )) return;

      if (!onChange({ ...result.state, dataMode: "personal" })) return;
      toast.success(`已補登 ${result.importedCount} 筆歷史買賣，目前持股與現金未變動`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "無法匯入歷史成交 CSV");
    } finally {
      if (tradeCsvRef.current) tradeCsvRef.current.value = "";
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {hasRecoveryBackup || storageWriteBlocked ? (
        <Card className="lg:col-span-2">
          <CardContent>
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#f5ece1] text-[#7d5729] dark:bg-[#382817] dark:text-[#e5bd86]">
                <AlertTriangle size={19} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold">{storageWriteBlocked ? "本機資料需要人工處理" : "本機資料復原備份"}</h3>
                <p className="mt-2 text-sm leading-6 text-black/50 dark:text-white/50">
                  {storageWriteBlocked
                    ? "瀏覽器無法安全建立復原副本，因此 PortfolioPilot 已停止寫入新變更，避免覆蓋原始資料。建議先不要清除網站資料。"
                    : "系統曾偵測到本機資料無法通過目前 schema 驗證，已另外保留當時的原始內容。現在使用中的資料不會把這份副本一起刪掉。"}
                </p>
                {hasRecoveryBackup ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button onClick={exportRecoveryBackup}><Download size={16} />匯出原始復原檔</Button>
                    <GhostButton onClick={removeRecoveryBackup}><Trash2 size={16} />清除復原備份</GhostButton>
                  </div>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}
      <Card className="lg:col-span-2">
        <CardContent>
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#edf2ee] text-[#335b46] dark:bg-[#17201b] dark:text-[#a8dab8]">
              <DatabaseBackup size={19} />
            </div>
            <div>
              <h3 className="font-semibold">零成本本機模式</h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-black/50 dark:text-white/50">
                PortfolioPilot 現在不需要帳號、Supabase 或任何付費 API。持股、ETF 成分來源、交易／現金流、筆記與每日淨值快照都存在這台裝置。
              </p>
              <p className="mt-2 text-xs text-black/38 dark:text-white/38">
                換手機前先匯出 JSON 備份；持股也可另外輸出 CSV。
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <h3 className="font-semibold">完整備份</h3>
          <p className="mt-2 text-sm leading-6 text-black/50 dark:text-white/50">
            JSON 會包含持股、帳戶、ETF 成分來源、交易／現金流、投資筆記、匯率、DEMO/個人模式與歷史淨值快照，匯入時會先用 schema 驗證格式。
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={exportJson}><Download size={16} />匯出 JSON</Button>
            <GhostButton onClick={() => jsonRef.current?.click()}><Upload size={16} />匯入 JSON</GhostButton>
            <input ref={jsonRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => importJson(e.target.files?.[0])} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <h3 className="font-semibold">持股 CSV</h3>
          <p className="mt-2 text-sm leading-6 text-black/50 dark:text-white/50">
            適合用 Excel / Google Sheets 編輯大量持股。新版 CSV 含 account 欄位，匯入時以「市場＋代號＋帳戶」合併，因此同一檔股票可分開存在不同券商。
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={exportCsv}><FileSpreadsheet size={16} />匯出 CSV</Button>
            <GhostButton onClick={() => csvRef.current?.click()}><Upload size={16} />匯入 CSV</GhostButton>
            <GhostButton onClick={() => downloadText("portfoliopilot-holdings-template.csv", csvTemplate(), "text/csv;charset=utf-8")}>下載範本</GhostButton>
            <input ref={csvRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => importCsv(e.target.files?.[0])} />
          </div>
        </CardContent>
      </Card>


      <Card>
        <CardContent>
          <h3 className="font-semibold">台灣券商庫存 CSV</h3>
          <p className="mt-2 text-sm leading-6 text-black/50 dark:text-white/50">
            給券商「目前庫存／持有部位」匯出檔使用，不是逐筆成交明細。系統辨識常見中文欄名，只要求證券代號、持有股數與平均成本；名稱、股票／ETF 類型、產業與目前價格會用 TWSE／TPEx 官方快取確認後補齊。
          </p>
          <div className="mt-4 rounded-2xl border border-black/6 bg-black/[.018] p-3.5 text-xs leading-5 text-black/45 dark:border-white/8 dark:bg-white/[.025] dark:text-white/45">
            若同一代號在不同市場出現、官方標的找不到、數值無效或檔案內有重複庫存，整份匯入會停止，不會猜測或寫入部分資料。成交明細 CSV 因沒有平均成本也會被拒絕。
          </div>
          <label className="mt-4 block text-xs font-semibold text-black/45 dark:text-white/45">預設匯入帳戶名稱</label>
          <input
            className="field mt-2"
            value={brokerAccount}
            onChange={(event) => setBrokerAccount(event.target.value)}
            placeholder="例如：永豐證券、國泰證券-A"
          />
          <p className="mt-2 text-xs leading-5 text-black/35 dark:text-white/35">
            若 CSV 本身有帳戶／帳號欄位，會優先使用檔案中的值；否則套用這個名稱。
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button disabled={!brokerAccount.trim()} onClick={() => brokerCsvRef.current?.click()}>
              <Upload size={16} />匯入券商庫存 CSV
            </Button>
            <input
              ref={brokerCsvRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(event) => void importBrokerInventoryCsv(event.target.files?.[0])}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardContent>
          <h3 className="font-semibold">歷史買賣 CSV</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-black/50 dark:text-white/50">
            批次補登過去的股票／ETF 成交明細。所有列都走 V0.65 Ledger-only：不修改今天持股、不修改今天現金，也不推算已實現損益；只有 CSV 明確提供的 fee / tax 會進成本透明化。
          </p>
          <div className="mt-4 rounded-2xl border border-black/6 bg-black/[.018] p-3.5 text-xs leading-5 text-black/45 dark:border-white/8 dark:bg-white/[.025] dark:text-white/45">
            必要欄位：成交日期、買賣別、證券代號、成交股數、成交價、手續費、交易稅。市場／幣別與帳戶可放在 CSV，也可用下方 fallback；美股每列必須有可確認的歷史 USD/TWD。任一列錯誤時整份停止，不會部分寫入。
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-black/45 dark:text-white/45">預設市場（CSV 有市場／幣別時會覆蓋）</label>
              <select className="field mt-2" value={tradeMarket} onChange={(event) => setTradeMarket(event.target.value as "" | Market)}>
                <option value="">不指定，要求 CSV 自行提供</option>
                <option value="TW">台股 · TWD</option>
                <option value="US">美股 · USD</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-black/45 dark:text-white/45">預設帳戶（CSV 有帳戶時會優先使用）</label>
              <input
                className="field mt-2"
                value={tradeAccount}
                onChange={(event) => setTradeAccount(event.target.value)}
                placeholder="例如：永豐證券、IBKR"
              />
            </div>
          </div>
          <p className="mt-3 text-xs leading-5 text-black/35 dark:text-white/35">
            若券商檔有成交序號，系統會用「市場＋帳戶＋成交序號」建立穩定 fingerprint；沒有成交序號時則用完整成交內容與同內容出現次序建立 fingerprint。再次匯入同一批資料會 fail closed，避免重複計入。
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={() => tradeCsvRef.current?.click()}>
              <Upload size={16} />匯入歷史成交 CSV
            </Button>
            <GhostButton onClick={() => downloadText("portfoliopilot-historical-trades-template.csv", historicalTradeCsvTemplate(), "text/csv;charset=utf-8")}>
              <FileSpreadsheet size={16} />下載成交範本
            </GhostButton>
            <input
              ref={tradeCsvRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(event) => void importHistoricalTradeCsvFile(event.target.files?.[0])}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <h3 className="font-semibold">匯率設定</h3>
          <p className="mt-2 text-sm leading-6 text-black/50 dark:text-white/50">美股資產依 USD/TWD 折算。零成本階段先手動填，避免依賴不穩定或授權不清楚的免費匯率 API。</p>
          <label className="mt-5 block text-xs font-semibold text-black/45 dark:text-white/45">USD / TWD</label>
          <input
            className="field mt-2 max-w-[220px]"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="1"
            value={usdDraft ?? String(state.usdTwd)}
            onChange={(e) => setUsdDraft(e.target.value)}
            onBlur={() => {
              if (usdDraft === null) return;
              const value = Number(usdDraft);
              if (Number.isFinite(value) && value > 0) {
                if (!onChange({ ...state, usdTwd: value })) return;
                toast.success(`USD/TWD 已更新為 ${value.toFixed(2)}`);
                setUsdDraft(null);
              } else {
                toast.error("請輸入大於 0 的有效 USD/TWD 匯率");
                setUsdDraft(null);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setUsdDraft(null);
                e.currentTarget.blur();
              }
            }}
          />
          <p className="mt-2 text-xs text-black/35 dark:text-white/35">可先清空再完整輸入；離開欄位或按 Enter 後才會儲存，避免輸入途中把匯率誤改成 1。</p>
          <p className="mt-3 text-xs text-black/35 dark:text-white/35">歷史快照：{state.snapshots.length.toLocaleString()} 筆</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <h3 className="font-semibold">資料重設</h3>
          <p className="mt-2 text-sm leading-6 text-black/50 dark:text-white/50">新安裝預設為空白個人模式，不會自動塞示範持股。只有你主動按下「示範資料」才會進入 DEMO，首頁與頂部會持續標示。</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <GhostButton onClick={() => {
              if (!window.confirm("確定要清空本機的持股、ETF 成分來源、交易／現金流、筆記與淨值歷史嗎？建議先匯出 JSON。")) return;
              if (!onChange(emptyState)) return;
              toast.success("本機資料已清空");
            }}><Trash2 size={16} />清空資料</GhostButton>
            <GhostButton onClick={() => {
              if (!window.confirm("確定要恢復示範資料嗎？目前本機資料會被覆蓋。")) return;
              if (!onChange(demoState)) return;
              toast.success("已恢復示範資料");
            }}><RotateCcw size={16} />示範資料</GhostButton>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
