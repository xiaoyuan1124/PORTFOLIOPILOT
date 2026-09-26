"use client";

import { useRef } from "react";
import { DatabaseBackup, Download, FileSpreadsheet, RotateCcw, Trash2, Upload } from "lucide-react";
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
import { Button, Card, CardContent, GhostButton } from "./ui";

export function Settings({ state, onChange }: { state: AppState; onChange: (state: AppState) => void }) {
  const jsonRef = useRef<HTMLInputElement>(null);
  const csvRef = useRef<HTMLInputElement>(null);

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
      const merged = mergeHoldings(state.holdings, incoming);
      onChange({ ...state, holdings: merged });
      toast.success(`已匯入 ${incoming.length} 筆持股`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "CSV 格式不正確");
    } finally {
      if (csvRef.current) csvRef.current.value = "";
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
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
            JSON 會包含持股、ETF 成分來源、交易／現金流、投資筆記、匯率與歷史淨值快照，匯入時會先用 schema 驗證格式。
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
            適合用 Excel / Google Sheets 編輯大量持股。匯入時會以「市場＋代號」合併，同代號更新、不重複新增。
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
            step="0.01"
            min="1"
            value={state.usdTwd}
            onChange={(e) => onChange({ ...state, usdTwd: Number(e.target.value) || 1 })}
          />
          <p className="mt-3 text-xs text-black/35 dark:text-white/35">歷史快照：{state.snapshots.length.toLocaleString()} 筆</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <h3 className="font-semibold">資料重設</h3>
          <p className="mt-2 text-sm leading-6 text-black/50 dark:text-white/50">想正式開始使用時，可以直接清空示範資料；若只是想看看預設畫面，也可以恢復示範資料。</p>
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
