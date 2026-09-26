"use client";

import { useRef } from "react";
import { Download, RotateCcw, Upload } from "lucide-react";
import { demoState } from "@/lib/demo-data";
import type { AppState } from "@/lib/types";
import { Button, Card, CardContent, GhostButton } from "./ui";

export function Settings({ state, onChange }: { state: AppState; onChange: (state: AppState) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `portfoliopilot-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importData(file?: File) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as AppState;
      if (!Array.isArray(parsed.holdings) || !Array.isArray(parsed.journal) || typeof parsed.usdTwd !== "number") throw new Error("invalid");
      onChange(parsed);
    } catch {
      window.alert("無法匯入：檔案格式不正確。");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardContent>
          <h3 className="font-semibold">資料與備份</h3>
          <p className="mt-2 text-sm leading-6 text-black/50 dark:text-white/50">目前 MVP 將資料保存在這個瀏覽器。換手機、清除網站資料或無痕模式都可能造成資料遺失，請定期匯出備份。</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={exportData}><Download size={16} />匯出 JSON</Button>
            <GhostButton onClick={() => fileRef.current?.click()}><Upload size={16} />匯入備份</GhostButton>
            <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e) => importData(e.target.files?.[0])} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <h3 className="font-semibold">匯率設定</h3>
          <p className="mt-2 text-sm leading-6 text-black/50 dark:text-white/50">美股資產會依 USD/TWD 折算成台幣。正式版可再接可靠的匯率資料源。</p>
          <label className="mt-5 block text-xs font-semibold text-black/45 dark:text-white/45">USD / TWD</label>
          <input
            className="field mt-2 max-w-[220px]"
            type="number"
            step="0.01"
            min="1"
            value={state.usdTwd}
            onChange={(e) => onChange({ ...state, usdTwd: Number(e.target.value) || 1 })}
          />
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardContent>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold">重設示範資料</h3>
              <p className="mt-1 text-sm text-black/50 dark:text-white/50">會覆蓋目前瀏覽器內的 PortfolioPilot 資料。建議先匯出備份。</p>
            </div>
            <GhostButton onClick={() => {
              if (window.confirm("確定要重設為示範資料嗎？")) onChange(demoState);
            }}><RotateCcw size={16} />重設</GhostButton>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
