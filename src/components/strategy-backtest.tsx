"use client";

import { useMemo, useState } from "react";
import {
  DEFAULT_BACKTEST_COSTS, runStrategyBacktest, type BacktestCosts,
  type BacktestReport, type BacktestSummary
} from "@/lib/strategy-backtest";
import { strategyCandlesFromCache, strategyOhlcvMissingMonths, type StrategyOhlcvCache } from "@/lib/strategy-ohlcv-data";
import type { StrategyLabTarget, StrategyProfile } from "@/lib/strategy-lab";
import { Card, CardContent } from "./ui";

function signed(value: number | null, fraction = 2) {
  return value === null || !Number.isFinite(value) ? "資料不足" : (value >= 0 ? "+" : "") + value.toFixed(fraction) + "%";
}
function scalar(value: number | null, digits = 2) {
  return value === null || !Number.isFinite(value) ? "資料不足" : value.toFixed(digits);
}
function taipeiToday() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function Summary({ label, data }: { label: string; data: BacktestSummary }) {
  return (
    <section className="rounded-2xl border border-black/8 p-3 dark:border-white/10">
      <h4 className="font-semibold">{label}</h4>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {[
          ["總報酬", signed(data.totalReturnPct)],
          ["年化報酬", signed(data.annualizedReturnPct)],
          ["最大回撤", signed(data.maxDrawdownPct)],
          ["勝率", signed(data.winRatePct)],
          ["交易數", String(data.tradeCount)],
          ["平均單筆損益", signed(data.averageTradeReturnPct)],
          ["Profit Factor", scalar(data.profitFactor)],
          ["正報酬交易", String(data.wins)],
          ["負報酬交易", String(data.losses)]
        ].map(([name, value]) => (
          <div className="mini-metric" key={name}><span>{name}</span><strong>{value}</strong></div>
        ))}
      </div>
    </section>
  );
}

function DataSummary({ report, onReset }: { report: BacktestReport; onReset: () => void }) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-black/8 p-3 text-xs leading-5 dark:border-white/10">
        <p className="font-semibold">{report.status === "insufficient" ? "資料不足，未執行回測" : report.status === "no_trades" ? "可計算，但這段歷史沒有完整觸發交易" : "研究回測完成（不代表未來有效）"}</p>
        <p className="mt-1 text-black/55 dark:text-white/55">{report.reason}</p>
        <p className="mt-1 text-black/55 dark:text-white/55">樣本：{report.firstDate ?? "—"} ～ {report.lastDate ?? "—"} · 樣本外起點：{report.sampleSplitDate ?? "—"}</p>
      </div>
      {report.status !== "insufficient" ? (
        <>
          <div className="mini-metric"><span>買入持有基準 · 同期扣除相同成本</span><strong>{signed(report.benchmarkBuyHoldPct)}</strong></div>
          <Summary label="全期間" data={report.all}/>
          <div className="grid gap-3 xl:grid-cols-2">
            <Summary label="樣本內 · 前 70%" data={report.inSample}/>
            <Summary label="樣本外 · 後 30%" data={report.outOfSample}/>
          </div>
          <div className="rounded-xl border border-black/8 p-3 text-xs dark:border-white/10">
            <h4 className="font-semibold">進場時的市場狀態（前 60 根收盤報酬）</h4>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {([
                ["bull", "多頭（超過 +10%）"], ["bear", "空頭（低於 -10%）"],
                ["sideways", "盤整（±10%）"], ["unknown", "樣本不足"]
              ] as const).map(([key, label]) => (
                <div key={key}><p className="text-black/55 dark:text-white/55">{label}</p><strong>{report.regime[key].trades} 筆</strong><p>均值 {signed(report.regime[key].averageTradeReturnPct)}</p></div>
              ))}
            </div>
          </div>
          <details className="rounded-xl border border-black/8 p-3 dark:border-white/10">
            <summary className="cursor-pointer text-sm font-semibold">逐筆交易與觸發日期（{report.trades.length} 筆）</summary>
            <div className="mt-3 max-h-[380px] space-y-2 overflow-y-auto text-xs">
              {report.trades.map((trade, index) => (
                <div key={trade.entryDate + ":" + index} className="rounded-lg bg-black/[.03] p-3 dark:bg-white/[.04]">
                  <p className="font-semibold">訊號 {trade.signalDate} → 下一交易日買入 {trade.entryDate}</p>
                  <p className="mt-1">入場 {scalar(trade.entryPrice)} · 出場 {scalar(trade.exitPrice)} · 出場日 {trade.exitDate}</p>
                  <p className="mt-1">淨損益 {signed(trade.netReturnPct)} · {trade.reason === "stop" ? "停損" : trade.reason === "target" ? "停利" : "資料末日平倉"} · {trade.sample === "in_sample" ? "樣本內" : trade.sample === "out_of_sample" ? "樣本外" : "跨樣本邊界"}</p>
                </div>
              ))}
              {!report.trades.length && <p>本次回測沒有已完成的交易；不能計算勝率或 Profit Factor。</p>}
            </div>
          </details>
        </>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button className="min-h-10 rounded-xl border border-black/10 px-3 text-xs dark:border-white/10" onClick={onReset}>還原台股實驗成本</button>
      </div>
    </div>
  );
}

export function StrategyBacktest({
  targets, profile, ohlcv
}: { targets: StrategyLabTarget[]; profile: StrategyProfile; ohlcv: StrategyOhlcvCache | null }) {
  const [selection, setSelection] = useState("");
  const [costs, setCosts] = useState<BacktestCosts>(DEFAULT_BACKTEST_COSTS);
  const target = targets.find((item) => item.venue + ":" + item.symbol === selection) ?? targets[0];
  const candles = useMemo(
    () => target ? strategyCandlesFromCache(ohlcv, target.venue, target.symbol) : null,
    [ohlcv, target]
  );
  const missingMonths = target ? strategyOhlcvMissingMonths(ohlcv, target.venue, target.symbol) : [];
  const report = useMemo(
    () => runStrategyBacktest(missingMonths.length ? [] : (candles ?? []), profile, taipeiToday(), costs),
    [candles, costs, profile, missingMonths.length]
  );
  return (
    <Card><CardContent className="space-y-4 p-4 md:p-5">
      <div>
        <p className="text-xs font-semibold tracking-[.12em] text-black/45 dark:text-white/45">V0.93 · HISTORICAL BACKTEST</p>
        <h3 className="mt-1 text-xl font-semibold">歷史回測報告</h3>
        <p className="mt-2 text-xs leading-5 text-black/55 dark:text-white/55">使用目前選取的策略 B 固定參數。訊號只看當日收盤以前的真實資料，下一交易日以真實開盤價執行；停損與停利同日都觸發，保守假設先停損。</p>
      </div>
      <label className="block text-xs font-semibold text-black/55 dark:text-white/55">
        研究標的
        <select className="field mt-2" value={target ? target.venue + ":" + target.symbol : ""} onChange={(e) => setSelection(e.target.value)}>
          {targets.map((item) => <option key={item.id} value={item.venue + ":" + item.symbol}>{item.symbol} · {item.name} ({item.venue})</option>)}
        </select>
      </label>
      <div className="grid grid-cols-3 gap-2">
        {([
          ["feeBps", "單邊手續費 bps"], ["slippageBps", "單邊滑價 bps"], ["sellTaxBps", "賣出交易稅 bps"]
        ] as const).map(([field, label]) => (
          <label className="text-[11px] font-medium text-black/55 dark:text-white/55" key={field}>{label}
            <input className="field mt-1 px-2" type="number" min="0" max="500" step="0.25"
              value={costs[field]} onChange={(e) => setCosts((current) => ({ ...current, [field]: Number(e.target.value) }))} />
          </label>
        ))}
      </div>
      <p className="text-xs text-black/45 dark:text-white/45">bps = 萬分之一；預設費用、滑價與證交稅是可調實驗假設，未依券商個別折扣估算。</p>
      {missingMonths.length > 0 ? <p className="rounded-xl border border-amber-400/30 p-3 text-xs">官方 OHLCV 缺漏：{missingMonths.join("、")}。為防止將不連續樣本當成完整行情，本次回測已停用，待資料補齊再驗證。</p> : null}
      <DataSummary report={report} onReset={() => setCosts(DEFAULT_BACKTEST_COSTS)}/>
      <p className="text-xs leading-5 text-[#7b592f] dark:text-[#e3c18e]">限制：TWSE STOCK_DAY 未還原權息；沒有歷史逐筆撮合、實際成交量限制或除權息調整。這不是實盤績效、買進建議，也不是已證實能勝過大盤的策略。無完整官方日 K 一律顯示資料不足。</p>
    </CardContent></Card>
  );
}
