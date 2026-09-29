"use client";

import { useRef, useState } from "react";
import { AlertTriangle, DatabaseBackup, Download, FileSpreadsheet, RotateCcw, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { demoState, emptyState } from "@/lib/demo-data";
import type { AppState } from "@/lib/types";
import {
  csvTemplate,
  downloadText,
  holdingsToCsv,
  mergeHoldings,
  parseBackup,
  parseHoldingsCsv,
  serializeBackup
} from "@/lib/local-data";
import { clearRecoveryBackup, getRecoveryBackupRaw, saveState } from "@/lib/storage";
import { Button, Card, CardContent, GhostButton } from "./ui";

export function Settings({ state, onChange, hasRecoveryBackup = false, onRecoveryBackupCleared, storageWriteBlocked = false }: { state: AppState; onChange: (state: AppState) => void; hasRecoveryBackup?: boolean; onRecoveryBackupCleared?: () => void; storageWriteBlocked?: boolean }) {
  const jsonRef = useRef<HTMLInputElement>(null);
  const csvRef = useRef<HTMLInputElement>(null);
  const [usdDraft, setUsdDraft] = useState<string | null>(null);

  function exportRecoveryBackup() {
    const raw = getRecoveryBackupRaw();
    if (!raw) {
      toast.error("目前找不到復原備份。");
      return;
    }
    downloadText(
      `portfoliopilot-recovery-raw-${new Date().toISOString().slice(0, 10)}.txt`,
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
      `portfoliopilot-backup-${new Date().toISOString().slice(0, 10)}.json`,
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
      onChange(parsed);
      toast.success("JSON 備份已匯入");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "JSON 格式不正確");
    } finally {
      if (jsonRef.current) jsonRef.current.value = "";
    }
  }

  function exportCsv() {
    downloadText(
      `portfoliopilot-holdings-${new Date().toISOString().slice(0, 10)}.csv`,
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
      const merged = mergeHoldings(base.holdings, incoming);
      onChange({ ...base, dataMode: "personal", holdings: merged });
      toast.success(`已匯入 ${incoming.length} 筆持股`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "CSV 格式不正確");
    } finally {
      if (csvRef.current) csvRef.current.value = "";
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
                onChange({ ...state, usdTwd: value });
                toast.success(`USD/TWD 已更新為 ${value.toFixed(2)}`);
              } else {
                toast.error("請輸入大於 0 的有效 USD/TWD 匯率");
              }
              setUsdDraft(null);
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
              onChange(emptyState);
              toast.success("本機資料已清空");
            }}><Trash2 size={16} />清空資料</GhostButton>
            <GhostButton onClick={() => {
              if (!window.confirm("確定要恢復示範資料嗎？目前本機資料會被覆蓋。")) return;
              onChange(demoState);
              toast.success("已恢復示範資料");
            }}><RotateCcw size={16} />示範資料</GhostButton>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
