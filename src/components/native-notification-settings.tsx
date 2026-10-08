"use client";

import { useEffect, useMemo, useState } from "react";
import { BellRing, Save, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { localDateKey } from "@/lib/calc";
import type { AppState } from "@/lib/types";
import {
  checkNativeNotificationPermission,
  loadNativeSmartAlertSettings,
  nativeNotificationsAvailable,
  requestNativeNotificationPermission,
  saveNativeSmartAlertSettings,
  scheduleNativeTestNotification,
  syncNativeSmartAlerts,
  type NativeNotificationPermissionState,
  type NativeNotificationResearchTarget
} from "@/lib/native-notifications";
import {
  DEFAULT_LOCAL_SMART_ALERT_SETTINGS,
  evaluateLocalSmartAlerts,
  normalizeLocalSmartAlertSettings,
  type LocalSmartAlertSettings
} from "@/lib/smart-alerts";
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

function NumberSetting({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  disabled,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="rounded-2xl border border-black/6 p-3 dark:border-white/8">
      <span className="block text-xs font-semibold">{label}</span>
      <span className="mt-2 flex items-center gap-2">
        <input
          className="field min-w-0"
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <span className="shrink-0 text-xs text-black/40 dark:text-white/40">{suffix}</span>
      </span>
    </label>
  );
}

export function NativeNotificationSettings({ state }: { state: AppState }) {
  const [permission, setPermission] = useState<NativeNotificationPermissionState>("unavailable");
  const [working, setWorking] = useState(false);
  const [smartSettings, setSmartSettings] = useState<LocalSmartAlertSettings>(
    DEFAULT_LOCAL_SMART_ALERT_SETTINGS
  );
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const target = useMemo(() => researchTarget(state), [state]);
  const native = nativeNotificationsAvailable();
  const currentAlerts = useMemo(
    () => evaluateLocalSmartAlerts(state, smartSettings, localDateKey()),
    [smartSettings, state]
  );

  useEffect(() => {
    if (!nativeNotificationsAvailable()) return;

    void Promise.all([
      checkNativeNotificationPermission(),
      loadNativeSmartAlertSettings()
    ])
      .then(([nextPermission, settings]) => {
        setPermission(nextPermission);
        setSmartSettings(settings);
      })
      .catch(() => setPermission("prompt"))
      .finally(() => setSettingsLoaded(true));
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

  function updateSmartSettings(patch: Partial<LocalSmartAlertSettings>) {
    setSmartSettings((current) =>
      normalizeLocalSmartAlertSettings({ ...current, ...patch })
    );
  }

  async function saveSmartAlerts() {
    setWorking(true);
    try {
      let currentPermission = permission;
      if (smartSettings.enabled && currentPermission !== "granted") {
        currentPermission = await requestNativeNotificationPermission();
        setPermission(currentPermission);
      }

      const saved = await saveNativeSmartAlertSettings(smartSettings);
      setSmartSettings(saved);
      const result = await syncNativeSmartAlerts(state);

      if (saved.enabled && currentPermission !== "granted") {
        toast.info("Smart Alerts 設定已儲存；系統通知權限開啟後才會送達。");
      } else {
        const details = [
          result.scheduled ? `目前條件排程 ${result.scheduled} 則` : "",
          result.monthlyScheduled ? `定期定額預排 ${result.monthlyScheduled} 個月` : ""
        ].filter(Boolean).join("、");
        toast.success(details ? `Smart Alerts 已儲存：${details}` : "Smart Alerts 已儲存");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "無法儲存 Smart Alerts");
    } finally {
      setWorking(false);
    }
  }

  return (
    <Card className="lg:col-span-2">
      <CardContent>
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#edf2ee] text-[#335b46] dark:bg-[#17201b] dark:text-[#a8dab8]">
            <BellRing size={19} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">Native 通知與 Smart Alerts</h3>
              <span className="rounded-full bg-black/5 px-2.5 py-1 text-xs font-semibold text-black/50 dark:bg-white/8 dark:text-white/50">
                {permissionLabel(permission)}
              </span>
            </div>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-black/50 dark:text-white/50">
              {native
                ? "V0.91 以 Capacitor 本機通知在裝置端評估風險與提醒，不需要後端或推播伺服器。投資條件只在 App 開啟、回到前景或本機資料改變時重新檢查。"
                : "GitHub Pages / PWA 不會要求通知權限；Smart Alerts 的系統通知只在 Capacitor Native App 中啟用。"}
            </p>

            {native ? (
              <>
                <div className="mt-4 rounded-2xl border border-black/6 bg-black/[.018] p-3.5 text-xs leading-5 text-black/45 dark:border-white/8 dark:bg-white/[.025] dark:text-white/45">
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="mt-0.5 shrink-0" size={15} />
                    <p>
                      不會背景持續抓盤，也不會宣稱 24/7 即時股價警報。曝險與配置提醒使用目前本機資料；每月定期定額提醒則預先排程在裝置上，不需要網路。
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

                <div className="mt-5 rounded-2xl border border-black/6 p-4 dark:border-white/8">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <SlidersHorizontal size={16} />
                        <h4 className="text-sm font-semibold">Local-first Smart Alerts</h4>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-black/42 dark:text-white/42">
                        同一條件一天最多提醒一次；最多同時排程四則條件提醒，避免通知轟炸。
                      </p>
                    </div>
                    <label className="flex min-h-10 items-center gap-2 rounded-xl bg-black/[.035] px-3 text-sm font-semibold dark:bg-white/[.06]">
                      <input
                        type="checkbox"
                        checked={smartSettings.enabled}
                        disabled={!settingsLoaded || working}
                        onChange={(event) => updateSmartSettings({ enabled: event.target.checked })}
                      />
                      啟用
                    </label>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <NumberSetting
                      label="單一公司曝險門檻"
                      value={smartSettings.companyExposurePct}
                      min={1}
                      max={100}
                      step={0.5}
                      suffix="%"
                      disabled={!smartSettings.enabled}
                      onChange={(value) => updateSmartSettings({ companyExposurePct: value })}
                    />
                    <NumberSetting
                      label="單一產業曝險門檻"
                      value={smartSettings.sectorExposurePct}
                      min={1}
                      max={100}
                      step={0.5}
                      suffix="%"
                      disabled={!smartSettings.enabled}
                      onChange={(value) => updateSmartSettings({ sectorExposurePct: value })}
                    />
                    <NumberSetting
                      label="配置高於目標門檻"
                      value={smartSettings.allocationDriftPct}
                      min={0.5}
                      max={100}
                      step={0.5}
                      suffix="pp"
                      disabled={!smartSettings.enabled}
                      onChange={(value) => updateSmartSettings({ allocationDriftPct: value })}
                    />
                    <NumberSetting
                      label="自選清單研究間隔"
                      value={smartSettings.watchlistResearchDays}
                      min={1}
                      max={365}
                      suffix="天"
                      disabled={!smartSettings.enabled}
                      onChange={(value) => updateSmartSettings({ watchlistResearchDays: value })}
                    />
                  </div>

                  <div className="mt-3 rounded-2xl bg-[#edf2ee] p-3 dark:bg-[#17201b]">
                    <label className="flex items-center gap-2 text-sm font-semibold">
                      <input
                        type="checkbox"
                        checked={smartSettings.monthlyContributionReminder}
                        disabled={!smartSettings.enabled}
                        onChange={(event) => updateSmartSettings({
                          monthlyContributionReminder: event.target.checked
                        })}
                      />
                      每月定期定額提醒
                    </label>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-black/45 dark:text-white/45">
                      <span>每月第</span>
                      <input
                        className="field w-20"
                        type="number"
                        min={1}
                        max={31}
                        step={1}
                        value={smartSettings.monthlyContributionDay}
                        disabled={!smartSettings.enabled || !smartSettings.monthlyContributionReminder}
                        onChange={(event) => updateSmartSettings({
                          monthlyContributionDay: Number(event.target.value)
                        })}
                      />
                      <span>日 09:00；若該月沒有此日期，使用當月最後一天。</span>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-black/42 dark:text-white/42">
                      依目前本機資料，現在有 {currentAlerts.length} 個條件符合提醒。
                    </p>
                    <Button disabled={working || !settingsLoaded} onClick={() => void saveSmartAlerts()}>
                      <Save size={15} />儲存 Smart Alerts
                    </Button>
                  </div>
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
