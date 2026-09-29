"use client";

import { useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { BriefcaseBusiness, Home, Search, Settings, X } from "lucide-react";
import type { AppState } from "@/lib/types";
import { loadBundledRevenue, type RevenueRow } from "@/lib/revenue-data";
import { accountName } from "@/lib/local-data";
import { Badge } from "./ui";

export type AppSection = "home" | "portfolio" | "research" | "settings";

function score(row: RevenueRow, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return 0;
  const code = row.code.toLowerCase();
  const name = row.name.toLowerCase();
  const industry = row.industry.toLowerCase();
  if (code === needle) return 100;
  if (code.startsWith(needle)) return 90;
  if (name.startsWith(needle)) return 80;
  if (code.includes(needle)) return 70;
  if (name.includes(needle)) return 60;
  if (industry.includes(needle)) return 40;
  return -1;
}

export function QuickSearch({
  state,
  open,
  onOpenChange,
  onNavigate
}: {
  state: AppState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (section: AppSection, researchKey?: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [companies, setCompanies] = useState<RevenueRow[] | null>(null);

  useEffect(() => {
    if (!open || companies !== null) return;
    let active = true;
    void loadBundledRevenue()
      .then((cache) => { if (active) setCompanies(cache.rows); })
      .catch(() => { if (active) setCompanies([]); });
    return () => { active = false; };
  }, [companies, open]);

  const loading = open && companies === null;

  const companyResults = useMemo(() => {
    const needle = query.trim();
    if (!needle) return [];
    return (companies ?? [])
      .map((row) => ({ row, score: score(row, needle) }))
      .filter((entry) => entry.score >= 0)
      .sort((a, b) => b.score - a.score || a.row.code.localeCompare(b.row.code, "en"))
      .slice(0, 10)
      .map((entry) => entry.row);
  }, [companies, query]);

  const holdingResults = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return state.holdings
      .filter((holding) => `${holding.symbol} ${holding.name} ${holding.sector} ${accountName(holding.account)}`.toLowerCase().includes(needle))
      .slice(0, 6);
  }, [query, state.holdings]);

  function setOpen(next: boolean) {
    if (!next) setQuery("");
    onOpenChange(next);
  }

  function go(section: AppSection, researchKey?: string) {
    setQuery("");
    onOpenChange(false);
    onNavigate(section, researchKey);
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/35 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-[10vh] z-50 w-[calc(100%-1.5rem)] max-w-[680px] -translate-x-1/2 overflow-hidden rounded-[26px] border border-black/10 bg-[#f8f7f3] shadow-2xl outline-none dark:border-white/10 dark:bg-[#111614]">
          <Dialog.Title className="sr-only">快速搜尋與前往</Dialog.Title>
          <div className="flex items-center gap-3 border-b border-black/6 px-4 dark:border-white/8">
            <Search size={19} className="shrink-0 text-black/35 dark:text-white/35" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜尋股票代號、公司、產業、帳戶，或快速前往…"
              className="h-14 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-black/30 dark:placeholder:text-white/30"
            />
            <Dialog.Close className="grid h-10 w-10 place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/8" aria-label="關閉">
              <X size={18} />
            </Dialog.Close>
          </div>

          <div className="max-h-[68vh] overflow-y-auto p-3">
            {!query.trim() ? (
              <div>
                <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[.14em] text-black/35 dark:text-white/35">快速前往</p>
                <div className="grid gap-1 sm:grid-cols-2">
                  {[
                    { section: "home" as const, label: "投資總覽", detail: "淨值、資金水位、配置", icon: Home },
                    { section: "portfolio" as const, label: "投資組合", detail: "持股、帳戶、績效", icon: BriefcaseBusiness },
                    { section: "research" as const, label: "研究中心", detail: "個股總覽與 Scanner", icon: Search },
                    { section: "settings" as const, label: "設定與資料", detail: "備份、匯入、匯率", icon: Settings }
                  ].map((item) => {
                    const Icon = item.icon;
                    return <button key={item.section} onClick={() => go(item.section)} className="flex min-h-16 items-center gap-3 rounded-2xl px-3 text-left transition hover:bg-black/[.04] dark:hover:bg-white/[.05]"><span className="grid h-10 w-10 place-items-center rounded-xl bg-black/[.04] dark:bg-white/[.06]"><Icon size={18} /></span><span><strong className="block text-sm">{item.label}</strong><span className="text-xs text-black/40 dark:text-white/40">{item.detail}</span></span></button>;
                  })}
                </div>
                <p className="mt-3 px-2 text-xs leading-5 text-black/38 dark:text-white/38">快捷鍵：⌘K / Ctrl+K。輸入台股代號可直接打開官方個股總覽。</p>
              </div>
            ) : null}

            {holdingResults.length ? (
              <div className="mb-3">
                <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-[.14em] text-black/35 dark:text-white/35">我的持股</p>
                {holdingResults.map((holding) => <button key={holding.id} onClick={() => {
                  if (holding.market === "TW") {
                    const match = companies?.find((row) => row.code.toUpperCase() === holding.symbol.toUpperCase());
                    if (match) return go("research", `${match.market}:${match.code}`);
                  }
                  go("portfolio");
                }} className="flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-black/[.04] dark:hover:bg-white/[.05]"><span className="min-w-0"><strong className="block truncate text-sm">{holding.symbol} · {holding.name}</strong><span className="mt-0.5 block truncate text-xs text-black/40 dark:text-white/40">{holding.sector} · {accountName(holding.account)}</span></span><Badge>持有</Badge></button>)}
              </div>
            ) : null}

            {companyResults.length ? (
              <div>
                <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-[.14em] text-black/35 dark:text-white/35">官方台股研究</p>
                {companyResults.map((row) => <button key={`${row.market}:${row.code}`} onClick={() => go("research", `${row.market}:${row.code}`)} className="flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-black/[.04] dark:hover:bg-white/[.05]"><span className="min-w-0"><strong className="block truncate text-sm">{row.code} · {row.name}</strong><span className="mt-0.5 block truncate text-xs text-black/40 dark:text-white/40">{row.industry || row.market} · {row.period}</span></span><span className="text-xs text-black/35 dark:text-white/35">{row.market}</span></button>)}
              </div>
            ) : null}

            {query.trim() && !holdingResults.length && !companyResults.length && !loading ? <p className="px-3 py-10 text-center text-sm text-black/40 dark:text-white/40">找不到符合的持股或官方台股資料。</p> : null}
            {query.trim() && loading ? <p className="px-3 py-10 text-center text-sm text-black/40 dark:text-white/40">正在載入官方公司清單…</p> : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
