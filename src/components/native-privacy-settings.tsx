"use client";

import { useEffect, useState } from "react";
import { EyeOff, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  getNativePrivacyState,
  setNativePrivacyEnabled,
  type NativePrivacyState
} from "@/lib/native-privacy";
import { Button, Card, CardContent, GhostButton } from "./ui";

function stateLabel(state: NativePrivacyState | null) {
  if (!state) return "檢查中";
  if (!state.available) return "Web / PWA";
  return state.enabled ? "已保護" : "未保護";
}

export function NativePrivacySettings() {
  const [state, setState] = useState<NativePrivacyState | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    void getNativePrivacyState()
      .then(setState)
      .catch(() => setState({ available: false, enabled: false }));
  }, []);

  async function changePrivacy(enabled: boolean) {
    setWorking(true);
    try {
      const next = await setNativePrivacyEnabled(enabled);
      setState(next);
      toast.success(enabled ? "Native 隱私保護已開啟" : "Native 隱私保護已關閉");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "無法更新 Native 隱私保護"
      );
    } finally {
      setWorking(false);
    }
  }

  const native = Boolean(state?.available);
  const enabled = native && state?.enabled === true;

  return (
    <Card className="lg:col-span-2">
      <CardContent>
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#edf2ee] text-[#335b46] dark:bg-[#17201b] dark:text-[#a8dab8]">
            <EyeOff size={19} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">Native 隱私保護</h3>
              <span className="rounded-full bg-black/5 px-2.5 py-1 text-xs font-semibold text-black/50 dark:bg-white/8 dark:text-white/50">
                {stateLabel(state)}
              </span>
            </div>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-black/50 dark:text-white/50">
              {native
                ? "預設開啟。App 離開前景或出現在多工切換畫面時，系統會遮蔽 PortfolioPilot 的投資資料。"
                : "這個功能只在 Capacitor Native App 啟用；GitHub Pages / PWA 不會載入原生隱私插件。"}
            </p>

            {native ? (
              <>
                <div className="mt-4 rounded-2xl border border-black/6 bg-black/[.018] p-3.5 text-xs leading-5 text-black/45 dark:border-white/8 dark:bg-white/[.025] dark:text-white/45">
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="mt-0.5 shrink-0" size={15} />
                    <p>
                      iOS 會在 App Switcher 顯示模糊遮罩；Android 使用 FLAG_SECURE，
                      啟用時也會阻擋螢幕截圖、錄影與非安全顯示器輸出。若你需要在 Android
                      截圖分享，可暫時關閉此設定。
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {enabled ? (
                    <GhostButton
                      disabled={working}
                      onClick={() => void changePrivacy(false)}
                    >
                      <EyeOff size={16} />關閉隱私保護
                    </GhostButton>
                  ) : (
                    <Button
                      disabled={working}
                      onClick={() => void changePrivacy(true)}
                    >
                      <ShieldCheck size={16} />開啟隱私保護
                    </Button>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
