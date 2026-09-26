"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ArrowUpRight, Landmark, Layers3, WalletCards } from "lucide-react";
import type { AppState } from "@/lib/types";
import { allocationBySector, portfolioSummary } from "@/lib/calc";
import { money, percent } from "@/lib/utils";
import { Badge, Card, CardContent, CardHeader, Metric } from "./ui";

export function Overview({ state }: { state: AppState }) {
  const summary = portfolioSummary(state.holdings, state.usdTwd);
  const sectors = allocationBySector(state.holdings, state.usdTwd);
  const trend = [0.84, 0.87, 0.9, 0.94, 0.97, 1].map((ratio, index) => ({
    month: ["Apr", "May", "Jun", "Jul", "Aug", "Sep"][index],
    value: Math.round(summary.total * ratio)
  }));
  const top = sectors[0];

  return (
    <div className="space-y-4 md:space-y-6">
      <section className="grid gap-4 md:grid-cols-4">
        <Card className="md:col-span-2">
          <CardContent>
            <div className="flex items-start justify-between gap-4">
              <Metric label="總資產淨值" value={money(summary.total)} helper="依目前輸入價格估算" />
              <Badge tone="good"><ArrowUpRight size={13} /> 本地資料</Badge>
            </div>
            <div className="mt-7 h-36">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="networth" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#456b58" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="#456b58" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#78817b" }} />
                  <YAxis hide domain={["dataMin", "dataMax"]} />
                  <Tooltip formatter={(value) => money(Number(value))} contentStyle={{ borderRadius: 14, border: "1px solid rgba(0,0,0,.08)", fontSize: 12 }} />
                  <Area type="monotone" dataKey="value" stroke="#456b58" strokeWidth={2.5} fill="url(#networth)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Metric label="未實現損益" value={money(summary.gain)} helper={percent(summary.gainPct)} />
            <div className="mt-6 flex items-center gap-2 text-xs text-black/50 dark:text-white/50">
              <WalletCards size={15} />
              {state.holdings.filter((h) => h.type !== "cash").length} 個投資標的
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Metric label="USD / TWD" value={state.usdTwd.toFixed(2)} helper="可在設定中手動更新" />
            <div className="mt-6 flex items-center gap-2 text-xs text-black/50 dark:text-white/50">
              <Landmark size={15} />
              美股依此匯率折算
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.25fr_.75fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[.14em] text-black/40 dark:text-white/40">Allocation</p>
                <h2 className="mt-1 text-lg font-semibold">實際資產配置</h2>
              </div>
              <Layers3 size={19} className="text-black/35 dark:text-white/35" />
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            {sectors.slice(0, 6).map((item) => (
              <div key={item.name}>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-medium">{item.name}</span>
                  <span className="tabular-nums text-black/50 dark:text-white/50">{item.pct.toFixed(1)}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-black/5 dark:bg-white/8">
                  <div className="h-full rounded-full bg-[#456b58]" style={{ width: `${Math.max(item.pct, 2)}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <p className="text-xs font-semibold uppercase tracking-[.14em] text-black/40 dark:text-white/40">Checks</p>
            <h2 className="mt-1 text-lg font-semibold">今天先看這些</h2>
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            <div className="rounded-2xl bg-[#edf2ee] p-4 dark:bg-[#17201b]">
              <p className="text-sm font-semibold">最大曝險：{top?.name ?? "—"}</p>
              <p className="mt-1 text-sm leading-6 text-black/55 dark:text-white/55">
                {top ? `目前約占 ${top.pct.toFixed(1)}%。先看集中度，再決定是否需要增加其他資產。` : "新增持股後會在這裡顯示集中度。"}
              </p>
            </div>
            <div className="flex gap-3 rounded-2xl border border-black/6 p-4 dark:border-white/8">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[#8b6538]" />
              <p className="text-sm leading-6 text-black/55 dark:text-white/55">
                研究頁目前使用示範資料，不代表即時市場資訊，也不是投資建議。
              </p>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
