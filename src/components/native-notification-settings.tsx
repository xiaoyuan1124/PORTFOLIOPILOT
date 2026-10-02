"use client";

import { useEffect, useMemo, useState } from "react";
import { BellRing, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import type { AppState } from "@/lib/types";
import {
  checkNativeNotificationPermission,
  nativeNotificationsAvailable,
  requestNativeNotificationPermission,
  scheduleNativeTestNotification,
  type NativeNotificationPermissionState,
  type NativeNotificationResearchTarget
} from "@/lib/native-notifications";
import { Button, Card, CardContent, GhostButton } from "./ui";

function permissionLabel(permission: NativeNotificationPermissionState) {
  if (permission === "granted") return "已允許";
  if (permission === "denied") return "已拒絕";
  if (permission === "prompt" || permission === "prompt-with-rationale") return "尚未詢問";
  if (permission === "unavailable") return "Web / PWA";
  return "未知";
}

function researchTarget(state: AppState): NativeNotificationResearchTarget | undefined {
  const holding = state.holdings.find(
    (item) =>
      item.market === "TW" &&
      item.type !== "cash" &&
      (item.priceSource === "TWSE" || item.priceSource === "TPEx")
  );

  if (!holding || (holding.priceSource !== "TWSE" && holding.priceSource !== "TPEx")) {
    return undefined;
  }

  return {
    researchKey: `${holding.priceSource}:${holding.symbol}`,
    researchType: holding.type === "etf" ? "etf" : "stock",
    label: `${holding.symbol} · ${holding.name}`
  };
}

export function NativeNotificationSettings({ state }: { state: AppState }) {
  const [permission, setPermission] = useState<NativeNotificationPermissionState>("unavailable");
  const [working, setWorking] = useState(false);
  const target = useMemo(() => researchTarget(state), [state]);

  useEffect(() => {
    if (!nativeNotificationsAvailable()) return;

    void checkNativeNotificationPermission()
      .then(setPermission)
      .catch(() => setPermission("prompt"));
  }, []);

  async function requestPermission() {
    setWorking(true);
    try {
      const next = await requestNativeNotificationPermission();
      setPermission(next);
      if (next === "granted") {
        toast.success("本機通知權限已開啟");
      } else if (next === "denied") {
        toast.info("通知權限目前為拒絕；可稍後到系統設定重新開啟。");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "無法取得通知權限");
    } finally {
      setWorking(false);
    }
  }

  async function sendTestNotification() {
    setWorking(true);
    try {
      let current = permission;
      if (current !== "granted") {
        current = await requestNativeNotificationPermission();
        setPermission(current);
      }
      if (current !== "granted") {
        toast.info("尚未允許通知，因此沒有建立測試通知。");
        return;
      }

      const result = await scheduleNativeTestNotification(target);
      toast.success(
        result.warning
          ? `測試通知已排程：${result.warning.message}`
          : "測試通知已排程，約 3 秒後送達"
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "無法建立測試通知");
    } finally {
      setWorking(false);
    }
  }

  const native = permission !== "unavailable";

  return (
    <Card className="lg:col-span-2">
      <CardContent>
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#edf2ee] text-[#335b46] dark:bg-[#17201b] dark:text-[#a8dab8]">
            <BellRing size={19} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">Native 通知</h3>
              <span className="rounded-full bg-black/5 px-2.5 py-1 text-xs font-semibold text-black/50 dark:bg-white/8 dark:text-white/50">
                {permissionLabel(permission)}
              </span>
            </div>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-black/50 dark:text-white/50">
              {native
                ? "V0.83.1 使用官方 Capacitor 本機通知，不需要後端或推播伺服器。權限只會在你按下按鈕後詢問。"
                : "GitHub Pages / PWA 不會要求通知權限；這個設定只在 Capacitor Native App 中啟用。"}
            </p>

            {native ? (
              <>
                <div className="mt-4 rounded-2xl border border-black/6 bg-black/[.018] p-3.5 text-xs leading-5 text-black/45 dark:border-white/8 dark:bg-white/[.025] dark:text-white/45">
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="mt-0.5 shrink-0" size={15} />
                    <p>
                      測試通知不會連線到券商、雲端或付費 API。
                      {target
                        ? ` 點通知會直接開啟 ${target.label} 的研究頁，用來驗證未來 Smart Alerts 的導向鏈。`
                        : " 目前沒有可安全定位的 TWSE／TPEx 持股，因此測試通知會回到通知設定。"}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {permission !== "granted" ? (
                    <Button disabled={working} onClick={() => void requestPermission()}>
                      <BellRing size={16} />開啟通知權限
                    </Button>
                  ) : null}
                  <GhostButton disabled={working} onClick={() => void sendTestNotification()}>
                    <BellRing size={16} />送出測試通知
                  </GhostButton>
                </div>

                {permission === "denied" ? (
                  <p className="mt-3 text-xs leading-5 text-[#8b6538] dark:text-[#d4ad7c]">
                    系統已拒絕通知。iOS / Android 在拒絕後可能不再顯示權限彈窗，需要到系統的 PortfolioPilot 通知設定重新開啟。
                  </p>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
