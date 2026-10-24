"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { AppState } from "@/lib/types";
import { loadBundledTwQuotes, type TwQuoteCache } from "@/lib/market-data";
import { loadTwPriceHistory, type TwPriceHistorySeries } from "@/lib/price-history-data";
import { loadBundledStrategyOhlcv, strategyCandlesFromCache, strategyOhlcvMissingMonths, type StrategyOhlcvCache } from "@/lib/strategy-ohlcv-data";
import {
  closeOnlyCandles, computeStrategyIndicators, DEFAULT_STRATEGY_LAB,
  evaluateOversoldStrategy, evaluateWatchZone, newestVerifiedClose, strategyLabStateSchema,
  type StrategyLabState, type StrategyLabTarget, type StrategyProfile
} from "@/lib/strategy-lab";
import { Badge, Card, CardContent } from "./ui";
import { BacktestReport } from "./backtest-report";

function number(value: number | null | undefined, digits = 2) {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "資料不足"
    : value.toLocaleString("zh-TW", { maximumFractionDigits: digits });
}
function taipeiToday() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
const fieldLabel = "block space-y-1 text-xs font-medium text-black/55 dark:text-white/55";
type Save = (next: StrategyLabState) => void;

function TargetEditor({
  target, onSave, onRemove
}: { target: StrategyLabTarget; onSave: (target: StrategyLabTarget) => void; onRemove: () => void }) {
  const [draft, setDraft] = useState(target);
  return (
    <details className="mt-3 rounded-xl border border-black/8 p-3 dark:border-white/10">
      <summary className="cursor-pointer text-xs font-semibold">編輯觀察價、建立日期與備註</summary>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className={fieldLabel}>第一階段（TWD）
          <input className="field" type="number" min="0.01" step="0.01" value={draft.firstPrice} onChange={(e) => setDraft({ ...draft, firstPrice: Number(e.target.value) })} />
        </label>
        <label className={fieldLabel}>第二階段（TWD）
          <input className="field" type="number" min="0.01" step="0.01" value={draft.secondPrice} onChange={(e) => setDraft({ ...draft, secondPrice: Number(e.target.value) })} />
        </label>
        <label className={fieldLabel}>建立日期
          <input className="field" type="date" value={draft.createdAt} onChange={(e) => setDraft({ ...draft, createdAt: e.target.value })} />
        </label>
        <label className={fieldLabel}>標的名稱
          <input className="field" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </label>
        <label className={fieldLabel + " col-span-2"}>研究備註
          <textarea className="field" rows={2} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
        </label>
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => onSave(draft)} className="min-h-11 rounded-xl bg-[#1f332a] px-4 text-sm font-semibold text-white">儲存變更</button>
        <button type="button" onClick={onRemove} className="min-h-11 rounded-xl border border-black/10 px-4 text-sm dark:border-white/10">移除</button>
      </div>
    </details>
  );
}

export function StrategyLab({
  state, onChange, onOpenResearch, onOpenRisk
}: {
  state: AppState;
  onChange: (next: AppState) => boolean;
  onOpenResearch: () => void;
  onOpenRisk: () => void;
}) {
  const config = state.strategyLab ?? DEFAULT_STRATEGY_LAB;
  const profile = config.profiles.find((item) => item.id === config.activeProfileId) ?? config.profiles[0]!;
  const [quoteCache, setQuoteCache] = useState<TwQuoteCache | null>(null);
  const [ohlcv, setOhlcv] = useState<StrategyOhlcvCache | null>(null);
  const [ohlcvError, setOhlcvError] = useState("");
  const [quotesError, setQuotesError] = useState("");
  const [histories, setHistories] = useState<Record<string, TwPriceHistorySeries | null>>({});
  const [historyErrors, setHistoryErrors] = useState<Record<string, string>>({});
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [backtestKey, setBacktestKey] = useState<string | null>(null);
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [venue, setVenue] = useState<"TWSE" | "TPEx">("TWSE");
  const [firstPrice, setFirstPrice] = useState("");
  const [secondPrice, setSecondPrice] = useState("");
  const targetKeys = config.targets.map((item) => item.venue + ":" + item.symbol).join("|");

  useEffect(() => {
    let active = true;
    loadBundledTwQuotes().then((cache) => {
      if (active) { setQuoteCache(cache); setQuotesError(""); }
    }).catch((error) => {
      if (active) { setQuoteCache(null); setQuotesError(error instanceof Error ? error.message : "行情不可用"); }
    });
    return () => { active = false; };
  }, [refreshIndex]);

  useEffect(() => {
    let active = true;
    loadBundledStrategyOhlcv().then((cache) => {
      if (active) { setOhlcv(cache); setOhlcvError(""); }
    }).catch((error) => {
      if (active) { setOhlcv(null); setOhlcvError(error instanceof Error ? error.message : "無法讀取 OHLCV"); }
    });
    return () => { active = false; };
  }, [refreshIndex]);

  useEffect(() => {
    let active = true;
    const keys = targetKeys ? targetKeys.split("|") : [];
    void Promise.all(keys.map(async (key) => {
      const [market, stock] = key.split(":") as ["TWSE" | "TPEx", string];
      try {
        const history = await loadTwPriceHistory(market, stock);
        return { key, history, error: "" };
      } catch (error) {
        return { key, history: null, error: error instanceof Error ? error.message : "讀取失敗" };
      }
    })).then((rows) => {
      if (!active) return;
      setHistories(Object.fromEntries(rows.map(({ key, history }) => [key, history])));
      setHistoryErrors(Object.fromEntries(rows.map(({ key, error }) => [key, error])));
    });
    return () => { active = false; };
  }, [targetKeys, refreshIndex]);

  const quotes = useMemo(() => new Map(
    (quoteCache?.quotes ?? []).map((item) => [item.market + ":" + item.code, item])
  ), [quoteCache]);
  const watched = config.targets.map((target) => {
    const key = target.venue + ":" + target.symbol;
    const quote = quotes.get(key);
    const history = histories[key];
    const latestHistory = history?.points.at(-1);
    const fullCandles = strategyCandlesFromCache(ohlcv, target.venue, target.symbol);
    const missingMonths = strategyOhlcvMissingMonths(ohlcv, target.venue, target.symbol);
    const candles = fullCandles ?? (history ? closeOnlyCandles(history.points) : []);
    const completeOhlcv = fullCandles !== null && fullCandles.length > 0;
    const latest = newestVerifiedClose([
      ...(quote ? [{ date: quote.date, close: quote.close, source: "quote" as const }] : []),
      ...(latestHistory ? [{ date: latestHistory[0], close: latestHistory[1], source: "history" as const }] : [])
    ], taipeiToday());
    const close = latest?.close ?? null;
    const asOf = latest?.date ?? null;
    const evaluated = candles.length ? evaluateOversoldStrategy(candles, profile, completeOhlcv ? "TWSE · STOCK_DAY 官方日 K OHLCV（未還原權息）" : "TWSE／TPEx · 歷史收盤價快取") : null;
    // Prevent a validated signal from appearing current when the official quote
    // cache has moved beyond the final OHLCV observation.
    const signal = evaluated && missingMonths.length > 0
      ? { ...evaluated, status: "insufficient" as const, source: evaluated.source + " · 官方 OHLCV 缺漏 " + missingMonths.join("、") + "，訊號暫停" }
      : evaluated && asOf && evaluated.asOf && evaluated.asOf < asOf
        ? { ...evaluated, status: "insufficient" as const, source: evaluated.source + " · 落後於最新官方收盤資料，訊號暫停" }
        : evaluated;
    const metrics = candles.length ? computeStrategyIndicators(candles, profile) : null;
    return { target, close, asOf, history, signal, metrics, key, isQuote: latest?.source === "quote", completeOhlcv, missingMonths, ohlcvCandles: missingMonths.length === 0 ? fullCandles : null, zone: evaluateWatchZone(close, target.firstPrice, target.secondPrice) };
  });
  const inZone = watched.filter((item) => item.zone === "first" || item.zone === "second").length;
  const backtestTarget = watched.find((item) => item.key === backtestKey) ?? null;

  const save: Save = (next) => {
    const parsed = strategyLabStateSchema.safeParse(next);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "策略設定格式不正確");
      return;
    }
    if (onChange({ ...state, strategyLab: parsed.data })) toast.success("策略研究設定已存入 PortfolioPilot 本機備份資料");
  };
  function updateProfile(next: StrategyProfile) {
    save({ ...config, profiles: config.profiles.map((p) => p.id === next.id ? next : p) });
  }
  function addTarget() {
    const code = symbol.trim().toUpperCase(), key = venue + ":" + code;
    save({ ...config, targets: [...config.targets, {
      id: key, venue, symbol: code, name: name.trim(),
      firstPrice: Number(firstPrice), secondPrice: Number(secondPrice),
      createdAt: taipeiToday(), note: "研究觀察，非下單指示。"
    }] });
    // Clear only after a valid write; validation protects existing holdings.
    const valid = strategyLabStateSchema.safeParse({ ...config, targets: [...config.targets, {
      id: key, venue, symbol: code, name: name.trim(), firstPrice: Number(firstPrice),
      secondPrice: Number(secondPrice), createdAt: taipeiToday(), note: "研究觀察，非下單指示。"
    }] });
    if (valid.success) { setSymbol(""); setName(""); setFirstPrice(""); setSecondPrice(""); }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[24px] bg-[#1f332a] p-5 text-white dark:bg-[#dce9e2] dark:text-[#122018]">
        <p className="text-xs font-semibold tracking-[.14em] opacity-60">STRATEGY LAB · V0.92</p>
        <h2 className="mt-2 text-2xl font-semibold">投資策略實驗室</h2>
        <p className="mt-2 text-sm leading-6 opacity-75">研究價位不是合理價，也不是買進建議。訊號必須同時具備完整資料與明確觸發理由；不足時不產生進場訊號。</p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <div><p className="text-2xl font-bold">{config.targets.length}</p><p className="text-xs opacity-65">觀察標的</p></div>
          <div><p className="text-2xl font-bold">{inZone}</p><p className="text-xs opacity-65">進入觀察價區</p></div>
          <div><p className="text-2xl font-bold">{watched.filter((item) => item.signal?.status === "triggered").length}</p><p className="text-xs opacity-65">完整策略訊號</p></div>
        </div>
      </div>

      <Card><CardContent className="space-y-3 p-4 md:p-5">
        <div className="flex flex-wrap justify-between gap-2">
          <div><h3 className="font-semibold">策略 B · 超跌反彈</h3><p className="mt-1 text-xs text-black/45 dark:text-white/45">實驗參數，尚未完成回測，無保證勝率</p></div>
          <button className="min-h-10 rounded-xl border border-black/10 px-3 text-xs dark:border-white/10" onClick={() => setRefreshIndex((v) => v + 1)}>重新讀取官方快取</button>
        </div>
        <label className={fieldLabel}>儲存的策略版本
          <select className="field" value={config.activeProfileId} onChange={(e) => save({ ...config, activeProfileId: e.target.value })}>
            {config.profiles.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <button className="min-h-10 rounded-xl border border-black/10 px-3 text-xs dark:border-white/10" onClick={() => {
            const id = "profile-" + Date.now();
            save({ ...config, profiles: [...config.profiles, { ...profile, id, name: "策略實驗 " + (config.profiles.length + 1) }], activeProfileId: id });
          }}>複製為新策略</button>
          {config.profiles.length > 1 && <button className="min-h-10 rounded-xl border border-black/10 px-3 text-xs dark:border-white/10" onClick={() => {
            const profiles = config.profiles.filter((item) => item.id !== profile.id);
            save({ ...config, profiles, activeProfileId: profiles[0]!.id });
          }}>刪除目前策略</button>}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {([
            ["rsiPeriod", "RSI 週期"], ["rsiBelow", "RSI 低於"], ["volumeMultiple", "量比大於"], ["kdPeriod", "KD 週期"],
            ["kdCrossAbove", "K 向上突破"], ["stopLossPct", "停損 %"], ["takeProfitPct", "停利 %"]
          ] as Array<[keyof StrategyProfile, string]>).map(([key, label]) => (
            <label className={fieldLabel} key={key}>{label}
              <input className="field" type="number" min="0" step={key === "volumeMultiple" || key.endsWith("Pct") ? "0.1" : "1"}
                value={profile[key]} onChange={(e) => updateProfile({ ...profile, [key]: Number(e.target.value) })} />
            </label>
          ))}
        </div>
        <p className="text-xs leading-5 text-[#7b592f] dark:text-[#e3c18e]">台股歷史收盤可計算 RSI、SMA、EMA、MACD；六檔上市股票另外使用 TWSE 官方 OHLCV 驗證 KD 與成交量。若來源尚未建立、缺日或期別不足，顯示資料不足，不補模擬數據；所有價格未還原權息。</p>
        <div className="flex flex-wrap gap-2">
          <button className="min-h-11 rounded-xl bg-[#1f332a] px-4 text-sm font-semibold text-white" onClick={onOpenResearch}>前往官方 Scanner</button>
          <button className="min-h-11 rounded-xl border border-black/10 px-4 text-sm dark:border-white/10" onClick={onOpenRisk}>檢查持股風險</button>
        </div>
      </CardContent></Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">自訂股票研究清單</h3>
        <span className="text-xs text-black/45 dark:text-white/45">台股盤後快取 · 非即時推播</span>
      </div>
      {quotesError && <p className="rounded-xl border border-amber-400/30 p-3 text-xs">官方收盤資料不可用：{quotesError}。歷史快取若存在仍會標示資料日期。</p>}
      {quoteCache?.offlineFallback && <p className="rounded-xl border border-amber-400/30 p-3 text-xs">目前使用離線快取，行情日期可能落後。</p>}
      {ohlcvError && <p className="rounded-xl border border-amber-400/30 p-3 text-xs">官方 OHLCV 尚未取得：{ohlcvError}；KD 與量能規則將維持資料不足。</p>}
      {ohlcv?.failed.length ? <p className="rounded-xl border border-amber-400/30 p-3 text-xs">官方日 K 部分月份失敗（{ohlcv.failed.length} 筆）：請查看資料期別，缺漏區間不補造數據。</p> : null}

      <div className="grid gap-3 lg:grid-cols-2">
        {watched.map(({ target, key, close, asOf, zone, history, signal, metrics, isQuote, completeOhlcv, missingMonths }) => (
          <Card key={key}><CardContent className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0"><h4 className="font-semibold">{target.symbol} · {target.name}</h4>
                <p className="mt-1 text-xs text-black/45 dark:text-white/45">{target.venue} · 建立 {target.createdAt}</p></div>
              <Badge tone={zone === "second" || zone === "first" ? "warn" : "neutral"}>
                {zone === "second" ? "第二階段觀察" : zone === "first" ? "第一階段觀察" : zone === "outside" ? "尚未進入觀察價" : "行情不足"}
              </Badge>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="mini-metric"><span>{isQuote ? "官方收盤" : "歷史收盤／缺值"}</span><strong>{number(close)}</strong></div>
              <div className="mini-metric"><span>第一階段</span><strong>{number(target.firstPrice)}</strong></div>
              <div className="mini-metric"><span>第二階段</span><strong>{number(target.secondPrice)}</strong></div>
            </div>
            <p className="mt-2 text-xs text-black/45 dark:text-white/45">資料日：{asOf ?? "資料不足"} · 來源：{isQuote ? "TWSE／TPEx 官方收盤快取" : "台股歷史快取（若有）"}</p>
            <p className="mt-1 text-xs text-black/45 dark:text-white/45">指標依據：{completeOhlcv ? "TWSE 官方未還原權息 OHLCV" : "僅有歷史收盤價／缺少完整日 K"} · 不是盤中即時資料</p>
            {missingMonths.length ? <p className="mt-1 text-xs text-amber-700 dark:text-amber-300" role="status">官方 OHLCV 缺漏：{missingMonths.join("、")}；策略訊號暫停，不能視為有效進場條件。</p> : null}
            <p className="mt-2 text-xs">RSI {number(metrics?.rsi)} · KD-K {number(metrics?.kdK)} · KD-D {number(metrics?.kdD)} · MACD {number(metrics?.macdHistogram, 3)} · SMA20 {number(metrics?.sma20)} · EMA20 {number(metrics?.ema20)}</p>
            <div className="mt-3 rounded-xl bg-black/[.025] p-3 text-xs dark:bg-white/[.04]">
              <p className="font-semibold">策略 B：{signal?.status === "triggered" ? "符合實驗條件（非買進指令）" : signal?.status === "not_triggered" ? "未觸發" : "資料不足，不產生交易訊號"}</p>
              <p className="mt-1 text-black/45 dark:text-white/45">訊號資料日：{signal?.asOf ?? "—"} · 歷史來源：{signal?.source ?? "—"}</p>
              {historyErrors[key] && !history && <p className="mt-1 text-amber-700 dark:text-amber-300">{historyErrors[key]}</p>}
              {signal && <ul className="mt-2 space-y-1 text-black/60 dark:text-white/60">
                <li>RSI：{signal.rules.rsi.status} · {signal.rules.rsi.reason}</li>
                <li>成交量：{signal.rules.volume.status} · {signal.rules.volume.reason}</li>
                <li>KD：{signal.rules.kd.status} · {signal.rules.kd.reason}</li>
              </ul>}
            </div>
            {target.note && <p className="mt-3 text-xs leading-5 text-black/55 dark:text-white/55">研究註記：{target.note}</p>}
            <button className="mt-3 min-h-11 w-full rounded-xl border border-[#1f332a]/20 px-3 text-sm font-semibold dark:border-white/20" onClick={() => setBacktestKey(key)}>查看歷史回測報告</button>
            <TargetEditor key={key} target={target} onSave={(changed) => save({ ...config, targets: config.targets.map((row) => row.id === target.id ? changed : row) })} onRemove={() => save({ ...config, targets: config.targets.filter((row) => row.id !== target.id) })} />
          </CardContent></Card>
        ))}
      </div>

      {backtestTarget ? (
        <section id="strategy-backtest" className="space-y-2">
          <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">回測：{backtestTarget.target.symbol} · {backtestTarget.target.name}</h3><button onClick={() => setBacktestKey(null)} className="min-h-10 rounded-xl border border-black/10 px-3 text-xs dark:border-white/10">關閉報告</button></div>
          <BacktestReport key={backtestTarget.key} candles={backtestTarget.ohlcvCandles} profile={profile} source="TWSE STOCK_DAY · 未還原權息" />
        </section>
      ) : null}

      <Card><CardContent className="space-y-3 p-4 md:p-5">
        <h3 className="font-semibold">新增觀察股票</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className={fieldLabel}>股票代號
            <input className="field" placeholder="例：2330" value={symbol} onChange={(e) => setSymbol(e.target.value)} />
          </label>
          <label className={fieldLabel}>公司名稱
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className={fieldLabel}>交易市場
            <select className="field" value={venue} onChange={(e) => setVenue(e.target.value as "TWSE" | "TPEx")}><option value="TWSE">上市</option><option value="TPEx">上櫃</option></select>
          </label>
          <label className={fieldLabel}>第一觀察價
            <input className="field" type="number" min="0.01" value={firstPrice} onChange={(e) => setFirstPrice(e.target.value)} />
          </label>
          <label className={fieldLabel}>第二觀察價
            <input className="field" type="number" min="0.01" value={secondPrice} onChange={(e) => setSecondPrice(e.target.value)} />
          </label>
          <div className="flex items-end"><button className="min-h-[46px] w-full rounded-xl bg-[#1f332a] px-3 text-sm font-semibold text-white" onClick={addTarget}>加入研究清單</button></div>
        </div>
        <p className="text-xs text-black/45 dark:text-white/45">觀察清單與策略參數存於現有 PortfolioPilot 本機資料，並沿用既有 JSON 備份／還原。新增代號需要官方歷史資料覆蓋才能顯示技術指標。</p>
      </CardContent></Card>
    </div>
  );
}
