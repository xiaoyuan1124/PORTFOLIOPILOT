"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowDownUp, Pencil, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { AppState, AssetType, Currency, Holding, Market } from "@/lib/types";
import { holdingCostTwd, holdingValueTwd, portfolioSummary } from "@/lib/calc";
import { accountName, holdingIdentityKey } from "@/lib/local-data";
import { money, percent } from "@/lib/utils";
import { applyTwQuotes, cacheFreshnessLabel, cacheMarketFreshness, loadBundledTwQuotes, shouldRejectStaleClosingCache } from "@/lib/market-data";
import { loadBundledRevenue } from "@/lib/revenue-data";
import { buildHoldingLookupCatalog, findExactHoldingLookupCandidate, searchHoldingLookupCatalog, type HoldingLookupCandidate } from "@/lib/holding-autofill";
import { Badge, Button, Card, CardContent, GhostButton, Modal } from "./ui";

const emptyHolding: Omit<Holding, "id"> = {
  symbol: "",
  name: "",
  market: "TW",
  type: "stock",
  quantity: 0,
  price: 0,
  averageCost: 0,
  currency: "TWD",
  sector: "",
  account: "預設帳戶"
};

function HoldingForm({ initial, onSave }: { initial?: Holding; onSave: (holding: Holding) => boolean }) {
  const [form, setForm] = useState<Omit<Holding, "id">>(initial ? {
    symbol: initial.symbol,
    name: initial.name,
    market: initial.market,
    type: initial.type,
    quantity: initial.quantity,
    price: initial.price,
    averageCost: initial.averageCost,
    currency: initial.currency,
    sector: initial.sector,
    account: accountName(initial.account),
    priceSource: initial.priceSource,
    priceAsOf: initial.priceAsOf
  } : emptyHolding);
  const [catalog, setCatalog] = useState<HoldingLookupCandidate[] | null>(initial ? [] : null);
  const [lookupQuery, setLookupQuery] = useState("");
  const [lookupField, setLookupField] = useState<"symbol" | "name" | null>(null);
  const [lookupUnavailable, setLookupUnavailable] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const lookupFieldRef = useRef<"symbol" | "name" | null>(null);
  const lookupQueryRef = useRef("");

  useEffect(() => {
    if (initial || form.market !== "TW" || catalog !== null) return;
    let active = true;
    void Promise.all([loadBundledTwQuotes(), loadBundledRevenue()])
      .then(([quotes, revenue]) => {
        if (!active) return;
        const nextCatalog = buildHoldingLookupCatalog(quotes, revenue);
        setCatalog(nextCatalog);
        const field = lookupFieldRef.current;
        const query = lookupQueryRef.current;
        const exact = field && query ? findExactHoldingLookupCandidate(nextCatalog, field, query) : null;
        if (exact) applyCandidate(exact);
      })
      .catch(() => {
        if (active) {
          setCatalog([]);
          setLookupUnavailable(true);
        }
      });
    return () => { active = false; };
  }, [catalog, form.market, initial]);

  const lookupResults = useMemo(
    () => lookupField && lookupQuery.trim() ? searchHoldingLookupCatalog(catalog ?? [], lookupQuery) : [],
    [catalog, lookupField, lookupQuery]
  );

  const costValid = form.type === "cash" ? form.averageCost >= 0 : form.averageCost > 0;
  const valid = Boolean(form.name.trim()) &&
    Boolean(form.symbol.trim()) &&
    form.quantity > 0 &&
    form.price > 0 &&
    costValid &&
    accountName(form.account).length > 0;

  function applyCandidate(candidate: HoldingLookupCandidate) {
    setForm((current) => ({
      ...current,
      symbol: candidate.code,
      name: candidate.name,
      market: "TW",
      type: candidate.type,
      price: candidate.close,
      currency: "TWD",
      sector: candidate.industry,
      priceSource: candidate.venue,
      priceAsOf: candidate.date
    }));
    lookupFieldRef.current = null;
    lookupQueryRef.current = "";
    setLookupField(null);
    setLookupQuery("");
  }

  function updateLookup(field: "symbol" | "name", value: string) {
    if (initial) {
      const symbolChanged =
        field === "symbol" &&
        value.trim().toUpperCase() !== initial.symbol.trim().toUpperCase();

      setForm((current) => ({
        ...current,
        [field]: value,
        ...(symbolChanged
          ? { price: 0, sector: "", priceSource: undefined, priceAsOf: undefined }
          : {})
      }));
      return;
    }

    if (form.market !== "TW") {
      setForm((current) => ({ ...current, [field]: value }));
      lookupFieldRef.current = null;
      lookupQueryRef.current = "";
      setLookupField(null);
      setLookupQuery("");
      return;
    }

    setForm((current) => ({
      ...current,
      [field]: value,
      ...(field === "symbol" ? { name: "" } : { symbol: "" }),
      price: 0,
      sector: "",
      priceSource: undefined,
      priceAsOf: undefined
    }));
    lookupFieldRef.current = field;
    lookupQueryRef.current = value;
    setLookupField(field);
    setLookupQuery(value);

    const exact = findExactHoldingLookupCandidate(catalog ?? [], field, value);
    if (exact) applyCandidate(exact);
  }

  function persistHolding() {
    if (!valid) return false;
    return onSave({
      id: initial?.id ?? `h-${Date.now()}`,
      ...form,
      symbol: form.symbol.trim().toUpperCase(),
      name: form.name.trim(),
      sector: form.sector.trim() || "未分類",
      account: accountName(form.account)
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!persistHolding()) return;
    closeRef.current?.click();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-[120px_1fr] gap-3">
        <input
          className="field"
          placeholder="代號"
          value={form.symbol}
          onChange={(e) => updateLookup("symbol", e.target.value)}
          autoComplete="off"
        />
        <input
          className="field"
          placeholder="名稱"
          value={form.name}
          onChange={(e) => updateLookup("name", e.target.value)}
          autoComplete="off"
        />
      </div>

      {!initial && form.market === "TW" ? (
        <div className="space-y-2">
          {catalog === null ? (
            <p className="px-1 text-xs text-black/40 dark:text-white/40">正在載入 TWSE／TPEx 官方清單…</p>
          ) : lookupUnavailable ? (
            <p className="px-1 text-xs text-amber-700 dark:text-amber-300">目前無法載入官方清單，仍可改用手動輸入。</p>
          ) : lookupQuery.trim() && lookupResults.length ? (
            <div className="overflow-hidden rounded-2xl border border-black/8 bg-black/[.02] dark:border-white/10 dark:bg-white/[.03]">
              {lookupResults.map((candidate) => (
                <button
                  key={`${candidate.venue}:${candidate.code}`}
                  type="button"
                  onClick={() => applyCandidate(candidate)}
                  className="flex w-full items-center justify-between gap-3 border-b border-black/6 px-4 py-3 text-left last:border-b-0 hover:bg-black/[.04] dark:border-white/8 dark:hover:bg-white/[.05]"
                >
                  <span className="min-w-0">
                    <strong className="block truncate text-sm">{candidate.code} · {candidate.name}</strong>
                    <span className="mt-0.5 block truncate text-xs text-black/40 dark:text-white/40">{candidate.venue} · {candidate.industry} · {candidate.type === "etf" ? "ETF" : "個股"}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <strong className="block text-sm">{candidate.close.toLocaleString()}</strong>
                    <span className="text-[11px] text-black/35 dark:text-white/35">{candidate.date}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : lookupQuery.trim() && catalog.length ? (
            <p className="px-1 text-xs text-black/40 dark:text-white/40">找不到相符的官方台股資料，可繼續手動輸入。</p>
          ) : (
            <p className="px-1 text-xs text-black/40 dark:text-white/40">代號或名稱只要輸入其中一邊；完整吻合時會自動帶入另一欄與公開市場資料。</p>
          )}
        </div>
      ) : null}
      {!initial && form.market === "US" ? (
        <p className="px-1 text-xs leading-5 text-black/40 dark:text-white/40">
          美股目前不使用付費或授權不明的即時資料源；請手動填代號、名稱、目前價格與實際平均成本，兩個文字欄位不會互相清除。
        </p>
      ) : null}

      <input className="field" placeholder="帳戶，例如：台股證券、複委託、銀行現金" value={form.account ?? ""} onChange={(e) => setForm({ ...form, account: e.target.value })} />
      <div className="grid grid-cols-2 gap-3">
        <select className="field" value={form.market} onChange={(e) => {
          const market = e.target.value as Market;
          const leavingOfficialTaiwan =
            market === "US" &&
            (form.priceSource === "TWSE" || form.priceSource === "TPEx");

          setForm({
            ...form,
            market,
            currency: market === "TW" ? "TWD" : "USD",
            ...(leavingOfficialTaiwan
              ? { price: 0, sector: "", priceSource: undefined, priceAsOf: undefined }
              : {})
          });
          lookupFieldRef.current = null;
          lookupQueryRef.current = "";
          setLookupField(null);
          setLookupQuery("");
        }}>
          <option value="TW">台灣</option>
          <option value="US">美國</option>
        </select>
        <select className="field" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as AssetType })}>
          <option value="stock">個股</option>
          <option value="etf">ETF</option>
          <option value="cash">現金</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <input className="field" type="number" step="any" min="0" placeholder="股數 / 數量" value={form.quantity || ""} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} />
        <select className="field" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value as Currency })}>
          <option value="TWD">TWD</option>
          <option value="USD">USD</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <input className="field" type="number" step="any" min="0" placeholder="目前價格" value={form.price || ""} onChange={(e) => setForm({ ...form, price: Number(e.target.value), priceSource: "manual", priceAsOf: undefined })} />
        <input className="field" type="number" step="any" min="0" placeholder="平均成本" value={form.averageCost || ""} onChange={(e) => setForm({ ...form, averageCost: Number(e.target.value) })} />
      </div>
      {form.priceSource && form.priceSource !== "manual" && form.priceAsOf ? (
        <p className="px-1 text-xs text-black/40 dark:text-white/40">目前價格已由 {form.priceSource} 官方資料自動帶入 · 資料日 {form.priceAsOf}。平均成本屬於你的實際交易資料，不會用市價假造。</p>
      ) : (
        <p className="px-1 text-xs text-black/35 dark:text-white/35">目前價格若不是官方帶入，請確認後再新增。</p>
      )}
      <p className="px-1 text-xs text-black/35 dark:text-white/35">
        股數必須大於 0；{form.type === "cash" ? "現金可用數量 × 價格表示金額。" : "平均成本必須大於 0，才能避免產生錯誤的未實現損益。"}
      </p>
      <input className="field" placeholder="產業 / 類別" value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })} />
      <Button disabled={!valid} type="submit" className="w-full">{initial ? "儲存修改" : "新增部位"}</Button>
      <Dialog.Close asChild>
        <button ref={closeRef} type="button" className="hidden" aria-hidden="true" tabIndex={-1} />
      </Dialog.Close>
    </form>
  );
}

type SortMode = "value" | "gain" | "name";

export function HoldingsPanel({ state, onChange, onResearch }: { state: AppState; onChange: (state: AppState) => void; onResearch?: (researchKey: string) => void }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("value");
  const [account, setAccount] = useState("all");
  const [refreshing, setRefreshing] = useState(false);
  const summary = portfolioSummary(state.holdings, state.usdTwd);

  const accounts = useMemo(() => [...new Set(state.holdings.map((holding) => accountName(holding.account)))].sort((a, b) => a.localeCompare(b, "zh-Hant")), [state.holdings]);

  const sorted = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = state.holdings.filter((holding) =>
      (account === "all" || accountName(holding.account) === account) &&
      (!needle || `${holding.symbol} ${holding.name} ${holding.sector} ${accountName(holding.account)}`.toLowerCase().includes(needle))
    );

    return [...filtered].sort((a, b) => {
      if (sort === "name") return a.symbol.localeCompare(b.symbol);
      if (sort === "gain") {
        const aGain = holdingValueTwd(a, state.usdTwd) - holdingCostTwd(a, state.usdTwd);
        const bGain = holdingValueTwd(b, state.usdTwd) - holdingCostTwd(b, state.usdTwd);
        return bGain - aGain;
      }
      return holdingValueTwd(b, state.usdTwd) - holdingValueTwd(a, state.usdTwd);
    });
  }, [account, query, sort, state.holdings, state.usdTwd]);

  function upsert(holding: Holding) {
    const exists = state.holdings.some((item) => item.id === holding.id);
    const duplicate = state.holdings.find(
      (item) => item.id !== holding.id && holdingIdentityKey(item) === holdingIdentityKey(holding)
    );
    if (duplicate) {
      toast.warning(`${holding.symbol} 已存在於「${accountName(holding.account)}」，請直接編輯既有部位，避免資產重複計算。`);
      return false;
    }

    onChange({
      ...state,
      holdings: exists ? state.holdings.map((item) => item.id === holding.id ? holding : item) : [...state.holdings, holding]
    });
    toast.success(exists ? "部位已更新" : "部位已新增");
    return true;
  }

  async function refreshTaiwanPrices() {
    setRefreshing(true);
    try {
      const cache = await loadBundledTwQuotes();
      const asOf = cacheFreshnessLabel(cache);
      if (shouldRejectStaleClosingCache(cache)) {
        toast.warning(`官方收盤價快取目前只到 ${asOf}，可能休市或尚未發布今天資料；為避免錯價，本次未覆寫持股。`);
        return;
      }

      const result = applyTwQuotes(state.holdings, cache);
      const freshness = cacheMarketFreshness(cache);
      const dateLabel = [
        freshness.TWSE ? `TWSE ${freshness.TWSE}` : null,
        freshness.TPEx ? `TPEx ${freshness.TPEx}` : null
      ].filter(Boolean).join(" · ");

      if (!result.updated) {
        const skipped = result.skippedStale + result.skippedAmbiguous;
        if (result.matched > 0) {
          toast.success(`台股收盤價已是最新 · ${dateLabel || asOf}`);
        } else {
          toast.info(`目前持股沒有可套用的 TWSE／TPEx 報價 · ${dateLabel || `官方資料日 ${asOf}`}${skipped ? ` · 已保護略過 ${skipped} 筆` : ""}`);
        }
        return;
      }
      onChange({ ...state, holdings: result.holdings });
      toast.success(`實際更新 ${result.updated}/${result.matched} 個台股部位 · ${dateLabel || `官方資料日 ${asOf}`}`);
      if (result.skippedStale || result.skippedAmbiguous) {
        toast.info(`另有 ${result.skippedStale + result.skippedAmbiguous} 筆因舊日期或市場不明而保留原價`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "無法載入官方台股資料");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-black/45 dark:text-white/45">目前總淨值</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight">{money(summary.total)}</p>
          {accounts.length ? <p className="mt-1 text-xs text-black/38 dark:text-white/38">{accounts.length} 個帳戶 · 可分帳戶檢視</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <GhostButton type="button" disabled={refreshing} onClick={refreshTaiwanPrices}>
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "更新中" : "更新台股收盤價"}
          </GhostButton>
          <Modal title="新增投資部位" trigger={<Button><Plus size={16} />新增部位</Button>}>
            <HoldingForm onSave={upsert} />
          </Modal>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-[1fr_180px_180px]">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-black/30 dark:text-white/30" size={17} />
          <input className="field pl-11" placeholder="搜尋代號、名稱、產業、帳戶" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <select className="field" value={account} onChange={(e) => setAccount(e.target.value)}>
          <option value="all">全部帳戶</option>
          {accounts.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <div className="relative">
          <ArrowDownUp className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-black/30 dark:text-white/30" size={16} />
          <select className="field pl-11" value={sort} onChange={(e) => setSort(e.target.value as SortMode)}>
            <option value="value">依市值排序</option>
            <option value="gain">依損益排序</option>
            <option value="name">依代號排序</option>
          </select>
        </div>
      </div>

      <div className="grid gap-3">
        {sorted.map((holding) => {
          const value = holdingValueTwd(holding, state.usdTwd);
          const cost = holdingCostTwd(holding, state.usdTwd);
          const gain = value - cost;
          const gainPct = cost > 0 ? (gain / cost) * 100 : 0;
          const pct = summary.total ? (value / summary.total) * 100 : 0;
          return (
            <Card key={holding.id}>
              <CardContent className="p-4 md:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="font-semibold">{holding.name}</p>
                      <span className="text-xs text-black/40 dark:text-white/40">{holding.symbol}</span>
                      <Badge>{accountName(holding.account)}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-black/45 dark:text-white/45">{holding.sector} · {holding.market} · {holding.currency}</p>
                    {holding.priceSource && holding.priceAsOf ? (
                      <p className="mt-1 text-[11px] text-black/35 dark:text-white/35">
                        價格來源 {holding.priceSource} · {holding.priceAsOf}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {holding.market === "TW" && (holding.priceSource === "TWSE" || holding.priceSource === "TPEx") && onResearch ? (
                      <GhostButton
                        className="h-10 min-h-10 w-10 px-0"
                        aria-label={`研究 ${holding.name}`}
                        title="查看官方研究"
                        onClick={() => onResearch(`${holding.priceSource}:${holding.symbol}`)}
                      >
                        <Search size={15} />
                      </GhostButton>
                    ) : null}
                    <Modal title={`編輯 ${holding.name}`} trigger={<GhostButton className="h-10 min-h-10 w-10 px-0" aria-label="編輯"><Pencil size={15} /></GhostButton>}>
                      <HoldingForm initial={holding} onSave={upsert} />
                    </Modal>
                    <GhostButton
                      className="h-10 min-h-10 w-10 px-0"
                      aria-label="刪除"
                      onClick={() => {
                        if (!window.confirm(`刪除 ${holding.name}？`)) return;
                        onChange({ ...state, holdings: state.holdings.filter((item) => item.id !== holding.id) });
                        toast.success("部位已刪除");
                      }}
                    >
                      <Trash2 size={15} />
                    </GhostButton>
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="mini-metric"><span>數量</span><strong>{holding.quantity.toLocaleString()}</strong></div>
                  <div className="mini-metric"><span>市值</span><strong>{money(value)}</strong></div>
                  <div className="mini-metric"><span>損益</span><strong>{percent(gainPct)}</strong></div>
                  <div className="mini-metric"><span>占比</span><strong>{pct.toFixed(1)}%</strong></div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {!sorted.length ? (
        <div className="py-14 text-center">
          <p className="text-sm text-black/40 dark:text-white/40">{state.holdings.length ? "沒有符合搜尋或帳戶條件的部位。" : "目前沒有持股，新增第一個部位開始追蹤。"}</p>
          {state.holdings.length && (query || account !== "all") ? (
            <GhostButton className="mt-4" onClick={() => { setQuery(""); setAccount("all"); }}>清除搜尋與帳戶篩選</GhostButton>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
