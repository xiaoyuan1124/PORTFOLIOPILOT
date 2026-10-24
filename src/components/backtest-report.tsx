"use client";

import { useState } from "react";
import {
  backtestOversoldStrategy, DEFAULT_BACKTEST_CONFIG,
  type BacktestConfig, type BacktestMetrics, type BacktestResult
} from "@/lib/strategy-backtest";
import type { StrategyCandle, StrategyProfile } from "@/lib/strategy-lab";
import { Card, CardContent } from "./ui";

function fmt(value: number | null, digits = 2) {
  return value === null || !Number.isFinite(value) ? "資料不足" :
    value.toLocaleString("zh-TW", { maximumFractionDigits: digits });
}
function pct(value: number | null) {
  return value === null ? "資料不足" : (value >= 0 ? "+" : "") + fmt(value) + "%";
}
function Summary({ title, m }: { title: string; m: BacktestMetrics }) {
  return (
    <div className="space-y-3 rounded-2xl border border-black/8 p-4 dark:border-white/10">
      <div><h4 className="font-semibold">{title}</h4><p className="mt-1 text-xs text-black/45 dark:text-white/45">{m.firstDate} ～ {m.lastDate}</p></div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {[
          ["價格策略報酬", pct(m.totalReturnPct)],
          ["同標的買進持有", pct(m.benchmarkReturnPct)],
          ["相對基準", pct(m.excessReturnPct)],
          ["年化價格報酬", pct(m.annualizedReturnPct)],
          ["最大回撤", pct(m.maxDrawdownPct)],
          ["勝率", pct(m.winRatePct)],
          ["交易次數", String(m.tradeCount)],
          ["平均損益（TWD）", fmt(m.averageProfit)],
          ["Profit Factor", fmt(m.profitFactor)]
        ].map(([label, value]) => (
          <div className="mini-metric" key={label}><span>{label}</span><strong>{value}</strong></div>
        ))}
      </div>
      <div>
        <p className="text-xs font-semibold">進場時市場環境（60 日歷史價格變化）</p>
        <div className="mt-1 flex flex-wrap gap-2 text-xs text-black/50 dark:text-white/50">
          <span>多頭：{m.regimes.bull.trades} 筆 · 淨損益 {fmt(m.regimes.bull.profit)} TWD</span>
          <span>空頭：{m.regimes.bear.trades} 筆 · 淨損益 {fmt(m.regimes.bear.profit)} TWD</span>
          <span>盤整：{m.regimes.sideways.trades} 筆 · 淨損益 {fmt(m.regimes.sideways.profit)} TWD</span>
          {m.regimes.unknown.trades > 0 ? <span>不足判別：{m.regimes.unknown.trades} 筆</span> : null}
        </div>
      </div>
      {m.trades.length ? (
        <details className="text-xs">
          <summary className="min-h-10 cursor-pointer font-semibold">查看 {m.trades.length} 筆逐筆交易及停損／停利原因</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-[520px] w-full text-left">
              <thead><tr className="border-b border-black/10 dark:border-white/10"><th className="p-2">買進</th><th className="p-2">賣出</th><th className="p-2">股數</th><th className="p-2">原因</th><th className="p-2">淨損益</th></tr></thead>
              <tbody>{m.trades.map((t,i)=><tr key={t.entryDate + ":" + i} className="border-b border-black/5 dark:border-white/5"><td className="p-2">{t.entryDate}<span className="block opacity-60">{fmt(t.entryPrice)}</span></td><td className="p-2">{t.exitDate}<span className="block opacity-60">{fmt(t.exitPrice)}</span></td><td className="p-2">{t.shares}</td><td className="p-2">{t.reason==="stop"?"停損":t.reason==="take"?"停利":"樣本結束"}</td><td className="p-2">{fmt(t.profit)}<span className="block opacity-60">{pct(t.profitPct)}</span></td></tr>)}</tbody>
            </table>
          </div>
        </details>
      ) : <p className="text-xs text-black/50 dark:text-white/50">此區間沒有觸發可成交訊號，勝率及盈虧因子不適用。</p>}
    </div>
  );
}

export function BacktestReport({ candles, profile, source }: {
  candles: StrategyCandle[] | null;
  profile: StrategyProfile;
  source: string;
}) {
  const [config, setConfig] = useState<BacktestConfig>({ ...DEFAULT_BACKTEST_CONFIG });
  const fingerprint = JSON.stringify({ candles, profile, source, config });
  const [run, setRun] = useState<{ fingerprint: string; result: BacktestResult } | null>(null);
  const result = run?.fingerprint === fingerprint ? run.result : null;
  const fields: Array<{key: keyof BacktestConfig; label: string; step: string}> = [
    {key:"initialCapital",label:"模擬本金 TWD",step:"1000"},
    {key:"allocationPct",label:"單次使用現金 %",step:"1"},
    {key:"feePct",label:"單邊手續費 %",step:"0.0001"},
    {key:"sellTaxPct",label:"賣出交易稅 %",step:"0.01"},
    {key:"slippagePct",label:"單邊滑價 %",step:"0.01"},
    {key:"trainRatio",label:"樣本內占比 (0.5–0.9)",step:"0.05"}
  ];
  return (
    <Card>
      <CardContent className="space-y-4 p-4 md:p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.12em] text-black/40 dark:text-white/40">V0.93 · Walk-forward research</p>
          <h3 className="mt-1 text-lg font-semibold">歷史回測報告</h3>
          <p className="mt-1 text-xs leading-5 text-black/50 dark:text-white/50">資料來源：{source}。必須有可驗證的每日開高低收與成交量；價格未還原權息，不含股利及公司行為調整。回測只用過去資料，最早隔日開盤買進；不自動下單。</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {fields.map(({key,label,step}) => (
            <label key={key} className="text-xs font-medium text-black/50 dark:text-white/50">{label}
              <input type="number" className="field mt-1" step={step} value={config[key]}
                onChange={(event) => {
                  setConfig((current) => ({ ...current, [key]: Number(event.target.value) }));
                  setRun(null);
                }} />
            </label>
          ))}
        </div>
        <button className="min-h-11 w-full rounded-xl bg-[#1f332a] px-4 text-sm font-semibold text-white" onClick={() => {
          setRun({ fingerprint, result: backtestOversoldStrategy(candles ?? [], profile, config, source) });
        }}>執行本機歷史回測</button>
        {result?.status === "insufficient" ? (
          <div className="rounded-xl border border-amber-400/30 p-4 text-sm">
            <strong>資料不足，無法產生績效</strong>
            <p className="mt-1 text-xs leading-5">{result.reason}</p>
          </div>
        ) : null}
        {result?.status === "available" ? (
          <div className="space-y-3">
            <p className="text-xs font-semibold">依時間切分樣本內／樣本外；分別重新以本金開始、獨立結算，不把同一筆交易跨區間延續。</p>
            <Summary title="全部歷史樣本" m={result.full} />
            <Summary title="樣本內（建立與評估）" m={result.inSample} />
            <Summary title="樣本外（未見資料檢驗）" m={result.outOfSample} />
            <div className="rounded-xl bg-black/[.025] p-3 dark:bg-white/[.04]">
              <p className="text-xs font-semibold">計算假設及風險</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-black/55 dark:text-white/55">{result.assumptions.map((item,i)=><li key={i}>{item}</li>)}</ul>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
