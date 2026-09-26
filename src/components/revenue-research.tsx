"use client";

import { useEffect, useMemo, useState } from "react";
import { Database, RefreshCw, Search } from "lucide-react";
import type { AppState } from "@/lib/types";
import {
  latestRevenuePeriod,
  loadBundledRevenue,
  revenueRowsForView,
  type RevenueCache
} from "@/lib/revenue-data";
import { percent } from "@/lib/utils";
import { Badge, Card, CardContent, GhostButton } from "./ui";

function formatMetric(value: number | null, suffix = "") {
  if (value === null) return "—";
  return `${value.toLocaleString("zh-TW", { maximumFractionDigits: 2 })}${suffix}`;
}

export function RevenueResearch({ state }: { state: AppState }) {
  const [cache, setCache] = useState<RevenueCache | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const heldCodes = useMemo(
    () => new Set(
      state.holdings
        .filter((holding) => holding.market === "TW" && holding.type !== "cash")
        .map((holding) => holding.symbol.toUpperCase())
    ),
    [state.holdings]
  );

  useEffect(() => {
    let active = true;

    void loadBundledRevenue()
      .then((nextCache) => {
        if (!active) return;
        setCache(nextCache);
        setError("");
      })
      .catch((cause) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "無法讀取月營收資料。");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function reload() {
    setLoading(true);
    setError("");
    try {
      setCache(await loadBundledRevenue());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "無法讀取月營收資料。");
    } finally {
      setLoading(false);
    }
  }

  const rows = useMemo(
    () => cache ? revenueRowsForView(cache, query, heldCodes) : [],
    [cache, heldCodes, query]
  );

  const period = cache ? latestRevenuePeriod(cache) : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 md:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#edf2ee] text-[#335b46] dark:bg-[#17201b] dark:text-[#a8dab8]">
                <Database size={18} />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">官方月營收</h3>
                  <Badge tone="good">TWSE / TPEx</Badge>
                </div>
                <p className="mt-1 text-sm leading-6 text-black/50 dark:text-white/50">
                  預設只顯示你目前持有的台股；輸入代號、名稱或產業可查詢快取中的其他公司。
                </p>
                {period ? <p className="mt-1 text-xs text-black/35 dark:text-white/35">最新資料月份：{period}</p> : null}
              </div>
            </div>
            <GhostButton type="button" disabled={loading} onClick={() => void reload()}>
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              {loading ? "讀取中" : "重新讀取"}
            </GhostButton>
          </div>
        </CardContent>
      </Card>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-black/35 dark:text-white/35" size={18} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜尋股票代號、名稱或產業"
          className="field pl-11"
        />
      </div>

      {error ? (
        <div className="rounded-2xl border border-[#b98b57]/25 bg-[#f5ece1] p-4 text-sm text-[#6f4c26] dark:border-[#b98b57]/20 dark:bg-[#2a2117] dark:text-[#e0bd8c]">
          {error}
        </div>
      ) : null}

      {!loading && !error && !query && heldCodes.size === 0 ? (
        <p className="py-12 text-center text-sm text-black/40 dark:text-white/40">先在投資組合新增台股，或直接搜尋公司代號。</p>
      ) : null}

      {!loading && !error && rows.length === 0 && (query || heldCodes.size > 0) ? (
        <p className="py-12 text-center text-sm text-black/40 dark:text-white/40">目前快取沒有符合條件的月營收資料。</p>
      ) : null}

      <div className="grid gap-3 xl:grid-cols-2">
        {rows.map((row) => (
          <Card key={`${row.market}:${row.code}`}>
            <CardContent className="p-4 md:p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{row.name}</h3>
                    <span className="text-xs text-black/40 dark:text-white/40">{row.code}</span>
                    {heldCodes.has(row.code.toUpperCase()) ? <Badge tone="good">持有</Badge> : null}
                  </div>
                  <p className="mt-1 text-sm text-black/45 dark:text-white/45">{row.industry || "未分類"} · {row.market}</p>
                </div>
                <Badge>{row.period}</Badge>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="mini-metric">
                  <span>當月營收</span>
                  <strong title="官方來源原始數值">{formatMetric(row.revenue)}</strong>
                </div>
                <div className="mini-metric">
                  <span>MoM</span>
                  <strong>{row.momPct === null ? "—" : percent(row.momPct, 1)}</strong>
                </div>
                <div className="mini-metric">
                  <span>YoY</span>
                  <strong>{row.yoyPct === null ? "—" : percent(row.yoyPct, 1)}</strong>
                </div>
                <div className="mini-metric">
                  <span>累計 YoY</span>
                  <strong>{row.cumulativeYoyPct === null ? "—" : percent(row.cumulativeYoyPct, 1)}</strong>
                </div>
              </div>

              <p className="mt-4 text-[11px] leading-5 text-black/35 dark:text-white/35">
                金額保留官方資料原始數值，不在前端自行換算單位；成長率直接使用官方欄位。
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
