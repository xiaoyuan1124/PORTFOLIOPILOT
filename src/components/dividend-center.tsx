"use client";

import { useMemo } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, Coins, History, ReceiptText } from "lucide-react";
import type { AppState } from "@/lib/types";
import { localDateKey } from "@/lib/calc";
import { buildDividendSummary } from "@/lib/dividend-data";
import { money } from "@/lib/utils";
import { Badge, Card, CardContent, CardHeader } from "./ui";

export function DividendCenter({ state }: { state: AppState }) {
  const today = localDateKey();
  const summary = useMemo(
    () => buildDividendSummary(state.activities, today),
    [state.activities, today]
  );

  const chartData = summary.monthly.map((row) => ({
    ...row,
    label: row.month.slice(2).replace("-", "/")
  }));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.14em] text-black/40 dark:text-white/40">Dividend center</p>
              <h2 className="mt-1 text-lg font-semibold">股息中心</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-black/48 dark:text-white/48">
                只統計你已記錄、且實際日期不晚於今天的股息收入。USD 股息使用每筆紀錄當時保存的匯率換算，不用目前匯率回推歷史。
              </p>
            </div>
            <Badge>{summary.recordCount} 筆已收股息</Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 pt-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl bg-[#edf2ee] p-4 dark:bg-[#17201b]">
              <span className="text-xs text-black/45 dark:text-white/45">今年已收</span>
              <strong className="mt-1 block text-xl tabular-nums">{money(summary.currentYearTwd)}</strong>
            </div>
            <div className="rounded-2xl border border-black/6 p-4 dark:border-white/8">
              <span className="text-xs text-black/45 dark:text-white/45">近 12 個月</span>
              <strong className="mt-1 block text-xl tabular-nums">{money(summary.trailing12Twd)}</strong>
            </div>
            <div className="rounded-2xl border border-black/6 p-4 dark:border-white/8">
              <span className="text-xs text-black/45 dark:text-white/45">本月已收</span>
              <strong className="mt-1 block text-xl tabular-nums">{money(summary.currentMonthTwd)}</strong>
            </div>
            <div className="rounded-2xl border border-black/6 p-4 dark:border-white/8">
              <span className="text-xs text-black/45 dark:text-white/45">累計已記錄</span>
              <strong className="mt-1 block text-xl tabular-nums">{money(summary.lifetimeTwd)}</strong>
            </div>
          </div>

          {summary.futureCount ? (
            <p className="flex items-start gap-1.5 text-[11px] leading-5 text-[#8b6538] dark:text-[#d4ad7c]">
              <AlertTriangle className="mt-0.5 shrink-0" size={13} />
              已排除 {summary.futureCount} 筆晚於今天（{today}）的股息紀錄；尚未發生的日期不會算進「已收股息」。
            </p>
          ) : null}

          {summary.missingSymbolCount ? (
            <p className="text-[11px] leading-5 text-black/38 dark:text-white/38">
              有 {summary.missingSymbolCount} 筆股息沒有股票代號，仍會計入總額，但只會歸在「未指定」，不會猜測來源標的。
            </p>
          ) : null}
        </CardContent>
      </Card>

      {!summary.recordCount ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Coins className="mx-auto text-black/25 dark:text-white/25" size={32} />
            <p className="mt-3 text-sm font-semibold">目前沒有已記錄的股息</p>
            <p className="mt-1 text-xs leading-5 text-black/42 dark:text-white/42">
              到「交易／現金流」新增類型為股息的紀錄後，這裡會自動整理月份、年度與標的來源。
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <History size={18} className="text-black/35 dark:text-white/35" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[.14em] text-black/40 dark:text-white/40">12 months</p>
                  <h3 className="mt-1 font-semibold">近 12 個月股息</h3>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#78817b" }} minTickGap={18} />
                    <YAxis hide />
                    <Tooltip
                      formatter={(value) => money(Number(value))}
                      labelFormatter={(label) => `月份 ${label}`}
                      contentStyle={{ borderRadius: 14, border: "1px solid rgba(0,0,0,.08)", fontSize: 12 }}
                    />
                    <Bar dataKey="amountTwd" fill="#456b58" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 text-[11px] leading-5 text-black/35 dark:text-white/35">
                圖表只反映已記錄的實際股息，不做下一次配息月份、金額或殖利率預測。
              </p>
            </CardContent>
          </Card>

          <section className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <ReceiptText size={18} className="text-black/35 dark:text-white/35" />
                  <h3 className="font-semibold">依標的累計</h3>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 pt-4">
                {summary.bySymbol.slice(0, 12).map((row) => (
                  <div key={row.symbol} className="flex items-center justify-between gap-3 rounded-2xl border border-black/6 px-4 py-3 dark:border-white/8">
                    <div>
                      <strong className="text-sm">{row.symbol}</strong>
                      <span className="ml-2 text-xs text-black/40 dark:text-white/40">{row.count} 筆</span>
                    </div>
                    <strong className="tabular-nums">{money(row.amountTwd)}</strong>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <h3 className="font-semibold">年度股息紀錄</h3>
              </CardHeader>
              <CardContent className="space-y-2 pt-4">
                {summary.byYear.map((row) => (
                  <div key={row.year} className="flex items-center justify-between gap-3 rounded-2xl border border-black/6 px-4 py-3 dark:border-white/8">
                    <div>
                      <strong className="text-sm">{row.year}</strong>
                      <span className="ml-2 text-xs text-black/40 dark:text-white/40">{row.count} 筆</span>
                    </div>
                    <strong className="tabular-nums">{money(row.amountTwd)}</strong>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>
        </>
      )}

      <div className="rounded-2xl border border-black/6 p-4 text-xs leading-5 text-black/40 dark:border-white/8 dark:text-white/40">
        PortfolioPilot 目前不以歷史配息規律推估未來股息。未來若加入官方除權息／配息資料，預估與「已實際收到」的紀錄也會分開標示。
      </div>
    </div>
  );
}
