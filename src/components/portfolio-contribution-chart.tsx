"use client";

import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DailyHoldingDriver } from "@/lib/daily-drivers";
import { money } from "@/lib/utils";

export function PortfolioContributionChart({
  rows,
  limit = 8,
  height = 260
}: {
  rows: DailyHoldingDriver[];
  limit?: number;
  height?: number;
}) {
  const data = [...rows]
    .sort((a, b) => Math.abs(b.impactTwd) - Math.abs(a.impactTwd))
    .slice(0, limit)
    .map((row) => ({
      symbol: row.symbol,
      name: row.name,
      type: row.holdingType,
      impactTwd: row.impactTwd,
      changePct: row.changePct
    }));

  if (!data.length) return null;

  return (
    <div className="w-full" style={{ height }} aria-label="持股每日績效貢獻圖">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
          <XAxis
            type="number"
            tick={{ fontSize: 10 }}
            tickFormatter={(value) => {
              const amount = Number(value);
              const abs = Math.abs(amount);
              if (abs >= 10000) return `${amount >= 0 ? "+" : "-"}${(abs / 10000).toFixed(1)}萬`;
              return `${amount >= 0 ? "+" : ""}${Math.round(amount)}`;
            }}
          />
          <YAxis
            type="category"
            dataKey="symbol"
            width={62}
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11 }}
          />
          <ReferenceLine x={0} stroke="rgba(127,127,127,.45)" />
          <Tooltip
            cursor={{ fill: "rgba(69,107,88,.07)" }}
            formatter={(value) => [money(Number(value)), "當日持倉影響"]}
            labelFormatter={(label, payload) => {
              const row = payload?.[0]?.payload;
              if (!row) return String(label);
              return `${row.symbol} · ${row.name} · ${row.type === "etf" ? "ETF" : "個股"} · ${row.changePct >= 0 ? "+" : ""}${Number(row.changePct).toFixed(2)}%`;
            }}
          />
          <Bar dataKey="impactTwd" radius={[4, 4, 4, 4]}>
            {data.map((row) => (
              <Cell key={row.symbol} fill={row.impactTwd >= 0 ? "#456b58" : "#9a624f"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
