"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, RefreshCw, Scale, Search } from "lucide-react";
import type { AppState } from "@/lib/types";
import { isHeldTwSecurity, resolveHeldTwSecurityKeys } from "@/lib/research-holdings";
import { loadBundledValuations, valuationSource, type ValuationCache } from "@/lib/valuation-data";
import { Badge, Card, CardContent, GhostButton } from "./ui";

function ratio(value: number | null) {
  if (value === null) return "—";
  return `${value.toLocaleString("zh-TW", { maximumFractionDigits: 2 })}x`;
}

function yieldPercent(value: number | null) {
  if (value === null) return "—";
  return `${value.toFixed(2)}%`;
}

export function ValuationResearch({ state }: { state: AppState }) {
  const [cache, setCache] = useState<ValuationCache | null>(null);
  const [query, setQuery] = useState("");
  const [heldOnly, setHeldOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function reload() {
    setLoading(true);
    setError("");
    try {
      setCache(await loadBundledValuations());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "無法載入官方估值資料。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    void loadBundledValuations()
      .then((next) => {
        if (!active) return;
        setCache(next);
        setError("");
      })
      .catch((cause) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "無法載入官方估值資料。");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, []);

  const heldKeys = useMemo(
    () => resolveHeldTwSecurityKeys(state.holdings, cache?.rows ?? []),
    [cache, state.holdings]
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...(cache?.rows ?? [])]
      .filter((row) => !heldOnly || isHeldTwSecurity(heldKeys, row.market, row.code))
      .filter((row) => !needle || `${row.code} ${row.name} ${row.market}`.toLowerCase().includes(needle))
      .sort((a, b) => Number(isHeldTwSecurity(heldKeys, b.market, b.code)) - Number(isHeldTwSecurity(heldKeys, a.market, a.code)) || a.code.localeCompare(b.code, "en"))
      .slice(0, 120);
  }, [cache, heldKeys, heldOnly, query]);

  const counts = useMemo(() => ({
    twse: cache?.rows.filter((row) => row.market === "TWSE").length ?? 0,
    tpex: cache?.rows.filter((row) => row.market === "TPEx").length ?? 0,
    held: cache?.rows.filter((row) => isHeldTwSecurity(heldKeys, row.market, row.code)).length ?? 0
  }), [cache, heldKeys]);

  return (
    <div className="space-y-4">
      <div className="rounded-[24px] border border-black/6 bg-[#e9eee9] p-5 dark:border-white/8 dark:bg-[#18211d]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#1f332a] text-white dark:bg-[#dce9e2] dark:text-[#122018]"><Scale size={18} /></div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.14em] text-black/40 dark:text-white/40">Official Valuation · TWSE + TPEx</p>
              <h3 className="mt-1 text-xl font-semibold">本益比、股價淨值比、殖利率</h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-black/55 dark:text-white/55">直接使用交易所官方快照；空白官方欄位保留為「—」，不自行猜 EPS、淨值或股利，也不把估值比率轉成買賣分數。</p>
            </div>
          </div>
          <div className="text-right text-sm text-black/45 dark:text-white/45"><p>上市 {counts.twse}</p><p>上櫃 {counts.tpex}</p><p>持有可對應 {counts.held}</p></div>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
        <div className="relative"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-black/35 dark:text-white/35" size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋代號、名稱或市場" className="field pl-11" /></div>
        <GhostButton onClick={() => setHeldOnly((value) => !value)}>{heldOnly ? "顯示全部" : "只看持有"}</GhostButton>
        <GhostButton disabled={loading} onClick={() => void reload()}><RefreshCw size={16} className={loading ? "animate-spin" : ""} />{loading ? "讀取中" : "重新讀取"}</GhostButton>
      </div>

      {error ? <div className="rounded-2xl border border-[#b98b57]/25 bg-[#f5ece1] p-4 text-sm text-[#6f4c26] dark:border-[#b98b57]/20 dark:bg-[#2a2117] dark:text-[#e0bd8c]">{error}</div> : null}
      {!loading && !error && cache && cache.rows.length === 0 ? <div className="rounded-2xl border border-black/6 p-5 text-sm text-black/45 dark:border-white/8 dark:text-white/45">官方估值 cache 尚未產生。market-data Action 成功抓取 TWSE / TPEx 後才會顯示，不用 Demo 數值替代。</div> : null}

      <div className="grid gap-3 xl:grid-cols-2">
        {visible.map((row) => {
          const source = cache ? valuationSource(cache, row.market) : null;
          const held = isHeldTwSecurity(heldKeys, row.market, row.code);
          return <Card key={`${row.market}:${row.code}`}><CardContent className="p-4 md:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{row.name}</p><span className="text-xs text-black/40 dark:text-white/40">{row.code}</span>{held ? <Badge tone="good">持有</Badge> : null}</div><p className="mt-1 text-sm text-black/45 dark:text-white/45">{row.market}</p></div>
              <Badge>{row.date}</Badge>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="mini-metric"><span>本益比 PE</span><strong>{ratio(row.pe)}</strong></div>
              <div className="mini-metric"><span>股價淨值比 PB</span><strong>{ratio(row.pb)}</strong></div>
              <div className="mini-metric"><span>殖利率</span><strong>{yieldPercent(row.dividendYield)}</strong></div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-5 text-black/40 dark:text-white/40">
              <span>官方資料日期 {row.date}</span>
              {source ? <a className="inline-flex items-center gap-1 underline underline-offset-2" href={source.url} target="_blank" rel="noreferrer">{source.name} 官方 OpenAPI<ExternalLink size={10} /></a> : <span>來源 metadata 不完整</span>}
            </div>
          </CardContent></Card>;
        })}
      </div>

      {!loading && !error && cache && cache.rows.length > 0 && visible.length === 0 ? (
        <div className="py-14 text-center">
          <p className="text-sm text-black/40 dark:text-white/40">目前沒有符合搜尋／持股篩選條件的官方估值資料。</p>
          {(query || heldOnly) ? (
            <GhostButton className="mt-4" onClick={() => { setQuery(""); setHeldOnly(false); }}>清除搜尋與篩選</GhostButton>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
