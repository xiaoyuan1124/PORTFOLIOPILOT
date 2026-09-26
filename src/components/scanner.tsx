"use client";

import { Check, X } from "lucide-react";
import { demoResearch } from "@/lib/demo-data";
import { passesGrowthScanner } from "@/lib/calc";
import { Badge, Card, CardContent } from "./ui";

function Flag({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${ok ? "bg-[#e7f1e9] text-[#28573b] dark:bg-[#173426] dark:text-[#a8dab8]" : "bg-black/5 text-black/45 dark:bg-white/8 dark:text-white/45"}`}>
      {ok ? <Check size={12} /> : <X size={12} />}{children}
    </span>
  );
}

export function Scanner() {
  const rows = demoResearch.map((stock) => ({ stock, result: passesGrowthScanner(stock) }));
  const passed = rows.filter((row) => row.result.pass);

  return (
    <div className="space-y-4">
      <div className="rounded-[24px] border border-black/6 bg-[#1f332a] p-5 text-white shadow-sm dark:border-white/8 dark:bg-[#dce9e2] dark:text-[#122018]">
        <p className="text-xs font-semibold uppercase tracking-[.14em] opacity-55">Growth + Institutions</p>
        <div className="mt-2 flex items-end justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold">成長＋雙法人共振</h3>
            <p className="mt-2 max-w-xl text-sm leading-6 opacity-70">最近 3 個月營收 YoY &gt; 20%、毛利率連兩季改善、外資 10D 與投信 10D 皆為淨買超。</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-semibold">{passed.length}</p>
            <p className="text-xs opacity-60">示範命中</p>
          </div>
        </div>
      </div>

      <div className="grid gap-3">
        {rows.map(({ stock, result }) => (
          <Card key={stock.symbol}>
            <CardContent className="p-4 md:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">{stock.name}</p>
                    <span className="text-xs text-black/40 dark:text-white/40">{stock.symbol}</span>
                    {result.pass ? <Badge tone="good">通過</Badge> : <Badge>未通過</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-black/45 dark:text-white/45">{stock.sector}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Flag ok={result.revenuePass}>3月營收</Flag>
                  <Flag ok={result.marginPass}>毛利率</Flag>
                  <Flag ok={result.foreignPass}>外資</Flag>
                  <Flag ok={result.trustPass}>投信</Flag>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
