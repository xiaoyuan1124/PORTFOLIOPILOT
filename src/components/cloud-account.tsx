"use client";

import { useEffect, useState } from "react";
import { Cloud, CloudDownload, CloudUpload, LogIn, LogOut, UserPlus } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import type { AppState } from "@/lib/types";
import { isCloudConfigured } from "@/lib/supabase";
import {
  getCurrentCloudUser,
  loadCloudState,
  onCloudAuthChange,
  saveCloudState,
  signInCloud,
  signOutCloud,
  signUpCloud
} from "@/lib/cloud-sync";
import { Badge, Button, Card, CardContent, GhostButton } from "./ui";

export function CloudAccount({
  state,
  onChange
}: {
  state: AppState;
  onChange: (state: AppState) => void;
}) {
  const configured = isCloudConfigured();
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!configured) return;

    let active = true;
    const frame = window.requestAnimationFrame(() => {
      void getCurrentCloudUser().then((nextUser) => {
        if (active) setUser(nextUser);
      });
    });
    const subscription = onCloudAuthChange((_event, session) => {
      if (active) setUser(session?.user ?? null);
    });

    return () => {
      active = false;
      window.cancelAnimationFrame(frame);
      subscription.unsubscribe();
    };
  }, [configured]);

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await task();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失敗，請稍後再試。");
    } finally {
      setBusy(false);
    }
  }

  if (!configured) {
    return (
      <Card className="lg:col-span-2">
        <CardContent>
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#edf2ee] text-[#335b46] dark:bg-[#17201b] dark:text-[#a8dab8]">
              <Cloud size={19} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">跨裝置雲端同步</h3>
                <Badge>尚未設定</Badge>
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-black/50 dark:text-white/50">
                程式已具備 Supabase 登入與同步能力，但目前還沒有 PortfolioPilot 專用 Supabase 專案與公開連線設定。現階段資料仍安全留在這個瀏覽器。
              </p>
              <p className="mt-3 text-xs text-black/40 dark:text-white/40">
                需要 NEXT_PUBLIC_SUPABASE_URL 與 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY。不要把 secret / service-role key 放進前端。
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!user) {
    return (
      <Card className="lg:col-span-2">
        <CardContent>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">PortfolioPilot Cloud</h3>
              <p className="mt-1 text-sm text-black/50 dark:text-white/50">登入後可手動把目前持股與投資筆記同步到其他裝置。</p>
            </div>
            <Badge>Supabase</Badge>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr_auto_auto]">
            <input className="field" type="email" autoComplete="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input className="field" type="password" autoComplete="current-password" placeholder="密碼（至少 6 碼）" value={password} onChange={(e) => setPassword(e.target.value)} />
            <Button disabled={busy || !email || password.length < 6} onClick={() => run(async () => {
              await signInCloud(email, password);
              setMessage("登入成功。");
            })}><LogIn size={16} />登入</Button>
            <GhostButton disabled={busy || !email || password.length < 6} onClick={() => run(async () => {
              const result = await signUpCloud(email, password);
              setMessage(result.session ? "註冊並登入成功。" : "註冊完成，請依 Email 驗證信完成驗證。");
            })}><UserPlus size={16} />註冊</GhostButton>
          </div>
          {message ? <p className="mt-3 text-sm text-black/55 dark:text-white/55">{message}</p> : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="lg:col-span-2">
      <CardContent>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">雲端同步已登入</h3>
              <Badge tone="good">Connected</Badge>
            </div>
            <p className="mt-1 text-sm text-black/50 dark:text-white/50">{user.email}</p>
          </div>
          <GhostButton disabled={busy} onClick={() => run(async () => {
            await signOutCloud();
            setMessage("已登出。");
          })}><LogOut size={16} />登出</GhostButton>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <button
            disabled={busy}
            onClick={() => run(async () => {
              await saveCloudState(state);
              setMessage("已把這台裝置目前資料安全同步到雲端。");
            })}
            className="group rounded-2xl border border-black/7 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50 dark:border-white/8 dark:bg-white/4"
          >
            <CloudUpload size={20} className="text-[#456b58]" />
            <p className="mt-3 font-semibold">上傳目前資料</p>
            <p className="mt-1 text-sm leading-6 text-black/45 dark:text-white/45">以這台裝置的持股、匯率與筆記覆蓋你的雲端版本。</p>
          </button>

          <button
            disabled={busy}
            onClick={() => run(async () => {
              const cloud = await loadCloudState();
              if (!cloud.state) {
                setMessage("雲端目前沒有資料，不會覆蓋這台裝置。");
                return;
              }
              if (!window.confirm("從雲端載入會覆蓋這台裝置目前的 PortfolioPilot 資料，確定繼續？")) return;
              onChange(cloud.state);
              setMessage("已從雲端載入最新資料。");
            })}
            className="group rounded-2xl border border-black/7 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50 dark:border-white/8 dark:bg-white/4"
          >
            <CloudDownload size={20} className="text-[#456b58]" />
            <p className="mt-3 font-semibold">從雲端載入</p>
            <p className="mt-1 text-sm leading-6 text-black/45 dark:text-white/45">適合換手機或換電腦時，把既有雲端資料下載到目前裝置。</p>
          </button>
        </div>

        {message ? <p className="mt-4 text-sm text-black/55 dark:text-white/55">{message}</p> : null}
        <p className="mt-4 text-xs leading-5 text-black/35 dark:text-white/35">
          第一版採「手動同步」以避免多裝置衝突或誤覆蓋。自動衝突合併會在資料模型穩定後再加入。
        </p>
      </CardContent>
    </Card>
  );
}
