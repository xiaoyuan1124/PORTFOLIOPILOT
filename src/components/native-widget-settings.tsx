"use client";

import { useEffect, useState } from "react";
import { LayoutGrid, ShieldCheck, Smartphone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { AppState } from "@/lib/types";
import {
  disableNativeWidgetSharing,
  enableNativeWidgetSharing,
  nativeWidgetAvailable,
  nativeWidgetStatus
} from "@/lib/native-widget-sync";
import { Button, Card, CardContent, GhostButton } from "./ui";

export function NativeWidgetSettings({ state }: { state: AppState }) {
  const native = nativeWidgetAvailable();
  const [enabled, setEnabled] = useState(false);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!nativeWidgetAvailable()) return;
    let active = true;
    void nativeWidgetStatus()
      .then((result) => {
        if (!active) return;
        setEnabled(result.enabled);
        setError("");
      })
      .catch((reason) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : "無法讀取 App Groups 狀態。");
      })
      .finally(() => { if (active) setChecked(true); });
    return () => { active = false; };
  }, []);

  async function enable() {
    if (state.dataMode === "demo") {
      toast.error("示範資料不會分享至 iPhone 主畫面。請先使用自己的投資資料。");
      return;
    }
    if (!window.confirm(
      "開啟後，任何看到你 iPhone 主畫面的人都可能看到投資組合金額、報酬和自選股。\n\n你確定允許 PortfolioPilot 將精簡摘要儲存在此裝置的 App Groups，供小工具顯示嗎？不會上傳至伺服器。"
    )) return;

    setWorking(true);
    setError("");
    try {
      await enableNativeWidgetSharing(state);
      setEnabled(true);
      toast.success("已允許 iPhone 小工具顯示精簡投資資料。");
    } catch (reason) {
      setEnabled(false);
      const message = reason instanceof Error ? reason.message : "小工具資料同步失敗。";
      setError(message);
      toast.error(message);
    } finally {
      setWorking(false);
    }
  }

  async function disable() {
    setWorking(true);
    setError("");
    try {
      await disableNativeWidgetSharing();
      setEnabled(false);
      toast.success("已取消小工具分享授權，並清除共享摘要。");
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "無法取消小工具資料共享。";
      setError(message);
      toast.error(message);
    } finally {
      setWorking(false);
    }
  }

  return (
    <Card className="lg:col-span-2">
      <CardContent>
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#edf2ee] text-[#335b46] dark:bg-[#17201b] dark:text-[#a8dab8]">
            <LayoutGrid size={19} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">iPhone 主畫面小工具</h3>
              <span role="status" className="rounded-full bg-black/5 px-2.5 py-1 text-xs font-semibold text-black/50 dark:bg-white/8 dark:text-white/50">
                {!native ? "Web / PWA 不適用" : !checked ? "檢查中" : error ? "需要檢查" : enabled ? "已授權" : "預設關閉"}
              </span>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-black/50 dark:text-white/50">
              {native
                ? "允許後，iPhone 小工具可以讀取此裝置的投資總額、報酬及最多 3 檔自選股最近官方收盤資訊。關閉時會清除共享快照，不會更動 App 內持股。"
                : "真正的 iPhone WidgetKit 小工具僅適用於已安裝的 PortfolioPilot iOS 原生 App；Safari 加入主畫面的網頁不能直接取得原生小工具資料。"}
            </p>
            <div className="mt-3 rounded-xl border border-black/6 bg-black/[.018] p-3 text-xs leading-5 text-black/50 dark:border-white/8 dark:bg-white/[.025] dark:text-white/50">
              <div className="flex gap-2">
                <ShieldCheck className="mt-0.5 shrink-0" size={15} />
                <p>
                  預設不分享。沒有交易紀錄、券商帳戶、成本明細或筆記傳入小工具；
                  並且不會上傳雲端。主畫面可能在未解鎖時被旁人看見，請自行評估隱私風險。
                  行情不是即時報價，更新時機也受 iOS WidgetKit 控制。
                </p>
              </div>
            </div>
            {error && native ? (
              <p role="alert" className="mt-3 text-xs leading-5 text-[#926237] dark:text-[#e0bd8c]">{error}</p>
            ) : null}
            {native && checked ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {enabled ? (
                  <GhostButton onClick={() => void disable()} disabled={working}>
                    <Trash2 size={16} />關閉並清除小工具資料
                  </GhostButton>
                ) : (
                  <Button onClick={() => void enable()} disabled={working || Boolean(error) || state.dataMode === "demo"}>
                    <Smartphone size={16} />允許小工具顯示摘要
                  </Button>
                )}
              </div>
            ) : null}
            <p className="mt-3 text-xs leading-5 text-black/40 dark:text-white/40">
              若安裝後尚未看見小工具：請長按 iPhone 主畫面，點「編輯」→「加入小工具」並搜尋 PortfolioPilot。
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
