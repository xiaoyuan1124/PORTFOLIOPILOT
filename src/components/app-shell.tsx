"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, BriefcaseBusiness, Home, Moon, Search, Settings as SettingsIcon, Sun } from "lucide-react";
import { Toaster, toast } from "sonner";
import type { AppState } from "@/lib/types";
import { emptyState } from "@/lib/demo-data";
import { withTodaySnapshot } from "@/lib/calc";
import { loadInitialState, saveState } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { Overview } from "./overview";
import { Portfolio, type PortfolioTab } from "./portfolio";
import { Research } from "./research";
import { Settings } from "./settings";
import { QuickSearch, type AppSection } from "./quick-search";
import { Badge } from "./ui";

type Section = AppSection;

const nav = [
  { key: "home" as const, label: "首頁", icon: Home },
  { key: "portfolio" as const, label: "投資組合", icon: BriefcaseBusiness },
  { key: "research" as const, label: "研究", icon: Search },
  { key: "settings" as const, label: "我的", icon: SettingsIcon }
];

const titles: Record<Section, { title: string; eyebrow: string }> = {
  home: { title: "投資總覽", eyebrow: "Portfolio Overview" },
  portfolio: { title: "投資組合", eyebrow: "Holdings" },
  research: { title: "研究中心", eyebrow: "Research" },
  settings: { title: "設定與資料", eyebrow: "Local Data" }
};

export function AppShell() {
  const [section, setSection] = useState<Section>("home");
  const [state, setState] = useState<AppState>(emptyState);
  const [dark, setDark] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [researchKey, setResearchKey] = useState<string | undefined>();
  const [researchType, setResearchType] = useState<"stock" | "etf" | undefined>();
  const [researchRequestId, setResearchRequestId] = useState(0);
  const [hasRecoveryBackup, setHasRecoveryBackup] = useState(false);
  const [storageWriteBlocked, setStorageWriteBlocked] = useState(false);
  const [portfolioRequestedTab, setPortfolioRequestedTab] = useState<PortfolioTab | undefined>();
  const [portfolioRequestId, setPortfolioRequestId] = useState(0);
  const title = useMemo(() => titles[section], [section]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const loaded = loadInitialState();
      const initial = withTodaySnapshot(loaded.state);
      setState(initial);
      setHasRecoveryBackup(loaded.recoveryPreserved);
      setStorageWriteBlocked(loaded.invalidStoredState && !loaded.recoveryPreserved);

      if (!loaded.invalidStoredState) {
        try {
          saveState(initial);
        } catch {
          setStorageWriteBlocked(true);
        }
      }

      let saved: string | null = null;
      try {
        saved = window.localStorage.getItem("portfoliopilot:theme");
      } catch {
        saved = null;
      }
      const shouldDark = saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
      setDark(shouldDark);
      document.documentElement.classList.toggle("dark", shouldDark);
    });

    if ("serviceWorker" in navigator) {
      const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
      navigator.serviceWorker.register(`${base}/sw.js`).catch(() => undefined);
    }

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((value) => !value);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function updateState(next: AppState) {
    if (storageWriteBlocked) {
      toast.error("本機儲存目前不可安全寫入；請先到「我的」處理資料復原提示。");
      setSection("settings");
      return false;
    }

    const prepared = withTodaySnapshot(next);
    try {
      saveState(prepared);
      setState(prepared);
      return true;
    } catch {
      setStorageWriteBlocked(true);
      toast.error("本機儲存失敗，這次變更沒有套用。請先匯出備份並檢查瀏覽器儲存空間。");
      return false;
    }
  }

  function navigate(next: Section, nextResearchKey?: string, nextResearchType?: "stock" | "etf") {
    if (next === "research" && nextResearchKey) {
      setResearchKey(nextResearchKey);
      setResearchType(nextResearchType);
      setResearchRequestId((value) => value + 1);
    }
    if (next === "portfolio") {
      setPortfolioRequestedTab(undefined);
      setPortfolioRequestId((value) => value + 1);
    }
    setSection(next);
  }

  function navigatePortfolioTab(tab: PortfolioTab) {
    setPortfolioRequestedTab(tab);
    setPortfolioRequestId((value) => value + 1);
    setSection("portfolio");
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      window.localStorage.setItem("portfoliopilot:theme", next ? "dark" : "light");
    } catch {
      toast.info("主題已套用，但瀏覽器目前無法記住這個偏好。");
    }
  }

  return (
    <div className="min-h-dvh text-[#1b241f] dark:text-[#e7eee9]">
      <Toaster theme={dark ? "dark" : "light"} position="top-center" richColors closeButton />
      <QuickSearch state={state} open={searchOpen} onOpenChange={setSearchOpen} onNavigate={navigate} />

      <aside className="app-desktop-sidebar fixed inset-y-0 left-0 z-30 hidden w-[248px] border-r border-black/6 bg-[#efeee9]/85 px-4 backdrop-blur-xl dark:border-white/7 dark:bg-[#0d1210]/90 md:flex md:flex-col">
        <div className="flex items-center gap-3 px-2">
          <div className="grid h-10 w-10 place-items-center rounded-[14px] bg-[#1f332a] text-white dark:bg-[#dce9e2] dark:text-[#122018]"><BarChart3 size={20} /></div>
          <div><p className="font-semibold tracking-tight">PortfolioPilot</p><p className="text-[11px] text-black/40 dark:text-white/40">Local investment cockpit</p></div>
        </div>
        <button onClick={() => setSearchOpen(true)} className="mt-7 flex min-h-11 w-full items-center gap-3 rounded-xl border border-black/6 bg-white/55 px-3 text-left text-sm text-black/40 transition hover:bg-white hover:text-black dark:border-white/7 dark:bg-white/4 dark:text-white/40 dark:hover:bg-white/7 dark:hover:text-white">
          <Search size={17} />
          <span className="flex-1">快速搜尋</span>
          <kbd className="rounded-md bg-black/5 px-1.5 py-0.5 text-[10px] dark:bg-white/8">⌘K</kbd>
        </button>
        <nav className="mt-3 space-y-1">
          {nav.map((item) => {
            const Icon = item.icon;
            return <button key={item.key} onClick={() => navigate(item.key)} className={cn("flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold transition", section === item.key ? "bg-white text-[#1f332a] shadow-sm dark:bg-white/10 dark:text-white" : "text-black/45 hover:bg-white/60 hover:text-black dark:text-white/45 dark:hover:bg-white/5 dark:hover:text-white")}><Icon size={18} />{item.label}</button>;
          })}
        </nav>
        <div className="mt-auto rounded-2xl border border-black/6 bg-white/60 p-4 dark:border-white/7 dark:bg-white/4">
          <p className="text-xs font-semibold">Zero-cost / Local-first</p>
          <p className="mt-1 text-xs leading-5 text-black/45 dark:text-white/45">不需要帳號、不需要付費 API。重要資料請定期匯出 JSON。</p>
        </div>
      </aside>

      <main className="app-mobile-main min-h-dvh md:ml-[248px]">
        <header className="app-topbar sticky top-0 z-20 border-b border-black/5 bg-[#f4f2ed]/82 backdrop-blur-xl dark:border-white/6 dark:bg-[#101412]/82">
          <div className="mx-auto flex max-w-[1360px] items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-black/35 dark:text-white/35">{title.eyebrow}</p>
              <h1 className="mt-0.5 truncate text-xl font-semibold tracking-tight md:text-2xl">{title.title}</h1>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setSearchOpen(true)} className="inline-flex h-11 items-center gap-2 rounded-full border border-black/6 bg-white/80 px-3 transition hover:bg-white dark:border-white/8 dark:bg-white/6 dark:hover:bg-white/10" aria-label="快速搜尋" aria-keyshortcuts="Meta+K Control+K">
                <Search size={17} /><span className="hidden text-xs font-semibold text-black/50 dark:text-white/50 sm:inline">搜尋</span>
              </button>
              <Badge tone={state.dataMode === "demo" ? "warn" : "neutral"}>{state.dataMode === "demo" ? "DEMO" : "LOCAL"}</Badge>
              <button onClick={toggleTheme} className="grid h-11 w-11 place-items-center rounded-full border border-black/6 bg-white/80 transition hover:bg-white dark:border-white/8 dark:bg-white/6 dark:hover:bg-white/10" aria-label="切換深色模式">
                {dark ? <Sun size={18} /> : <Moon size={18} />}
              </button>
            </div>
          </div>
        </header>

        <div className="app-page-content mx-auto max-w-[1360px] py-5 md:py-8">
          {hasRecoveryBackup || storageWriteBlocked ? (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#b98b57]/25 bg-[#f5ece1] px-4 py-3 text-[#6f4c26] dark:border-[#b98b57]/20 dark:bg-[#2a2117] dark:text-[#e0bd8c]">
              <div>
                <p className="text-sm font-semibold">{storageWriteBlocked ? "本機儲存暫停寫入" : "已保留一份本機資料復原備份"}</p>
                <p className="mt-0.5 text-xs opacity-80">{storageWriteBlocked ? "偵測到資料異常且無法安全建立復原副本，為避免覆蓋原始資料，已停止儲存新變更。" : "曾有一次本機資料無法通過驗證；原始內容沒有直接丟棄，可到「我的」匯出復原檔。"}</p>
              </div>
              <button onClick={() => setSection("settings")} className="min-h-10 rounded-xl border border-current/20 px-3 text-sm font-semibold">前往處理</button>
            </div>
          ) : null}
          {section === "home" ? <Overview state={state} onNavigate={(target, key) => navigate(target, key)} /> : null}
          {section === "portfolio" ? (
            <Portfolio
              key={portfolioRequestId}
              state={state}
              onChange={updateState}
              onResearch={(key, type) => navigate("research", key, type)}
              requestedTab={portfolioRequestedTab}
            />
          ) : null}
          {section === "research" ? <Research key={researchRequestId} state={state} onChange={updateState} researchKey={researchKey} researchType={researchType} /> : null}
          {section === "settings" ? (
            <Settings
              state={state}
              onChange={updateState}
              hasRecoveryBackup={hasRecoveryBackup}
              onRecoveryBackupCleared={() => setHasRecoveryBackup(false)}
              storageWriteBlocked={storageWriteBlocked}
              onNavigatePortfolio={navigatePortfolioTab}
            />
          ) : null}
        </div>
      </main>

      <nav className="app-mobile-nav fixed inset-x-0 bottom-0 z-40 border-t border-black/7 bg-[#f7f5f0]/94 pt-2 backdrop-blur-xl dark:border-white/8 dark:bg-[#0f1412]/94 md:hidden">
        <div className="grid grid-cols-4">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = section === item.key;
            return (
              <button key={item.key} onClick={() => navigate(item.key)} className={cn("flex min-h-[54px] flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-semibold transition", active ? "text-[#1f5b40] dark:text-[#a7d8b8]" : "text-black/38 dark:text-white/38")}>
                <Icon size={20} strokeWidth={active ? 2.4 : 2} />
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
