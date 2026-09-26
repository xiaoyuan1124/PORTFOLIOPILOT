"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { AppState } from "@/lib/types";
import { demoResearch } from "@/lib/demo-data";
import { percent } from "@/lib/utils";
import { Badge, Card, CardContent } from "./ui";
import { Scanner } from "./scanner";
import { Journal } from "./journal";

export function Research({ state, onChange }: { state: AppState; onChange: (state: AppState) => void }) {
  const [tab, setTab] = useState<"stocks" | "scanner" | "journal">("stocks");
  const [query, setQuery] = useState("");
  const stocks = useMemo(() => demoResearch.filter((item) => `${item.symbol}${item.name}${item.sector}`.toLowerCase().includes(query.toLowerCase())), [query]);

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-2xl border border-black/6 bg-white/70 p-1 dark:border-white/8 dark:bg-white/4">
        {[
          ["stocks", "個股研究"],
          ["scanner", "策略 Scanner"],
          ["journal", "投資筆記"]
        ].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key as typeof tab)} className={`min-h-10 rounded-xl px-3 text-sm font-semibold transition ${tab === key ? "bg-[#1f332a] text-white shadow-sm dark:bg-[#dce9e2] dark:text-[#122018]" : "text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "stocks" ? (
        <>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-black/35 dark:text-white/35" size={18} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜尋股票代號、名稱或產業" className="field pl-11" />
          </div>
          <div className="grid gap-3 xl:grid-cols-2">
            {stocks.map((stock) => (
              <Card key={stock.symbol}>
                <CardContent className="p-4 md:p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{stock.name}</h3>
                        <span className="text-xs text-black/40 dark:text-white/40">{stock.symbol}</span>
                      </div>
                      <p className="mt-1 text-sm text-black/45 dark:text-white/45">{stock.sector}</p>
                    </div>
                    <Badge>示範資料</Badge>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="mini-metric"><span>最新營收 YoY</span><strong>{percent(stock.revenueYoY[2])}</strong></div>
                    <div className="mini-metric"><span>毛利率</span><strong>{stock.grossMargin[2] ? `${stock.grossMargin[2].toFixed(1)}%` : "N/A"}</strong></div>
                    <div className="mini-metric"><span>外資 10D</span><strong>{stock.foreign10d.toLocaleString()}</strong></div>
                    <div className="mini-metric"><span>投信 10D</span><strong>{stock.trust10d.toLocaleString()}</strong></div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-2xl bg-black/[.035] p-3 dark:bg-white/[.045]"><span className="text-black/40 dark:text-white/40">PE</span><p className="mt-1 font-semibold">{stock.pe.toFixed(1)}x</p></div>
                    <div className="rounded-2xl bg-black/[.035] p-3 dark:bg-white/[.045]"><span className="text-black/40 dark:text-white/40">PB</span><p className="mt-1 font-semibold">{stock.pb.toFixed(1)}x</p></div>
                  </div>
                  <p className="mt-4 text-sm leading-6 text-black/50 dark:text-white/50">{stock.statusNote}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      ) : tab === "scanner" ? <Scanner /> : <Journal state={state} onChange={onChange} />}
    </div>
  );
}
