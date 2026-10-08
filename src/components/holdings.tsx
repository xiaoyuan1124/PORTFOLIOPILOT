"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowDownUp, ListChecks, Pencil, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { AppState, AssetType, Currency, Holding, Market } from "@/lib/types";
import { holdingCostTwd, holdingValueTwd, portfolioSummary } from "@/lib/calc";
import { applyHoldingCorrections, accountName, holdingIdentityKey, type HoldingCorrection } from "@/lib/local-data";
import { money, percent } from "@/lib/utils";
import { applyTwQuotes, cacheFreshnessLabel, cacheMarketFreshness, closingPriceStatusLabel, loadBundledTwQuotes, shouldRejectStaleClosingCache } from "@/lib/market-data";
import { applyHeldEtfCompositions, loadBundledEtfCompositions } from "@/lib/etf-composition-data";
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

function HoldingForm({
  initial,
  candidate,
  onSave
}: {
  initial?: Holding;
  candidate?: HoldingLookupCandidate;
  onSave: (holding: Holding) => boolean;
}) {
  const [form, setForm] = useState<Omit<Holding, "id">>(initial ? {
    symbol: initial.type === "cash" ? `CASH-${initial.currency}` : initial.symbol,
    name: initial.type === "cash" ? `${initial.currency} 現金` : initial.name,
    market: initial.type === "cash" ? (initial.currency === "USD" ? "US" : "TW") : initial.market,
    type: initial.type,
    quantity: initial.type === "cash" ? 1 : initial.quantity,
    price: initial.type === "cash" ? initial.quantity * initial.price : initial.price,
    averageCost: initial.type === "cash" ? initial.quantity * initial.price : initial.averageCost,
    currency: initial.currency,
    sector: initial.type === "cash" ? "現金" : initial.sector,
    account: accountName(initial.account),
    priceSource: initial.type === "cash" ? undefined : initial.priceSource,
    priceAsOf: initial.type === "cash" ? undefined : initial.priceAsOf
  } : candidate ? {
    symbol: candidate.code,
    name: candidate.name,
    market: "TW",
    type: candidate.type,
    quantity: 0,
    price: candidate.close,
    averageCost: 0,
    currency: "TWD",
    sector: candidate.industry,
    account: "預設帳戶",
    priceSource: candidate.venue,
    priceAsOf: candidate.date
  } : emptyHolding);
  const [catalog, setCatalog] = useState<HoldingLookupCandidate[] | null>(null);
  const [lookupQuery, setLookupQuery] = useState("");
  const [lookupField, setLookupField] = useState<"symbol" | "name" | null>(null);
  const [lookupUnavailable, setLookupUnavailable] = useState(false);
  const [manualIdentity, setManualIdentity] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const lookupFieldRef = useRef<"symbol" | "name" | null>(null);
  const lookupQueryRef = useRef("");

  useEffect(() => {
    if (form.market !== "TW" || form.type === "cash" || manualIdentity || catalog !== null) return;
    let active = true;
    void Promise.all([loadBundledTwQuotes(), loadBundledRevenue()])
      .then(([quotes, revenue]) => {
        if (!active) return;
        const nextCatalog = buildHoldingLookupCatalog(quotes, revenue);
        setCatalog(nextCatalog);
        setLookupUnavailable(false);
        const field = lookupFieldRef.current;
        const query = lookupQueryRef.current;
        const exact = field && query ? findExactHoldingLookupCandidate(nextCatalog, field, query) : null;
        if (exact) applyCandidate(exact);
      })
      .catch(() => {
        if (active) {
          setCatalog([]);
          setLookupUnavailable(true);
          setManualIdentity(true);
        }
      });
    return () => { active = false; };
  }, [catalog, form.market, form.type, manualIdentity]);

  const smartLookupActive = form.market === "TW" && form.type !== "cash" && !manualIdentity;

  const lookupResults = useMemo(
    () => smartLookupActive && lookupField && lookupQuery.trim() ? searchHoldingLookupCatalog(catalog ?? [], lookupQuery) : [],
    [catalog, lookupField, lookupQuery, smartLookupActive]
  );

  const valid = form.type === "cash"
    ? form.price >= 0 && Number.isFinite(form.price) && accountName(form.account).length > 0
    : Boolean(form.name.trim()) &&
      Boolean(form.symbol.trim()) &&
      form.quantity > 0 &&
      form.price > 0 &&
      form.averageCost > 0 &&
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
    setManualIdentity(false);
  }

  function clearLookupIntent() {
    lookupFieldRef.current = null;
    lookupQueryRef.current = "";
    setLookupField(null);
    setLookupQuery("");
  }

  function useManualIdentity() {
    clearLookupIntent();
    setManualIdentity(true);
  }

  function retryOfficialIdentity() {
    setLookupUnavailable(false);
    setManualIdentity(false);
    if (!catalog?.length) setCatalog(null);
  }

  function updateLookup(field: "symbol" | "name", value: string) {
    if (!smartLookupActive) {
      setForm((current) => {
        const symbolChanged =
          field === "symbol" &&
          value.trim().toUpperCase() !== current.symbol.trim().toUpperCase();
        return {
          ...current,
          [field]: value,
          ...(symbolChanged
            ? { price: 0, sector: "", priceSource: undefined, priceAsOf: undefined }
            : {})
        };
      });
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

  function changeMarket(market: Market) {
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
    clearLookupIntent();
    if (market === "TW") {
      setManualIdentity(false);
      setLookupUnavailable(false);
      if (!catalog?.length) setCatalog(null);
    } else {
      setManualIdentity(true);
    }
  }

  function changeAssetType(type: AssetType) {
    const enteringCash = type === "cash";
    const leavingCash = form.type === "cash" && !enteringCash;

    if (enteringCash) {
      const currency = form.currency;
      setForm({
        ...form,
        type,
        market: currency === "USD" ? "US" : "TW",
        symbol: `CASH-${currency}`,
        name: `${currency} 現金`,
        quantity: 1,
        price: 0,
        averageCost: 0,
        sector: "現金",
        priceSource: undefined,
        priceAsOf: undefined
      });
      clearLookupIntent();
      setManualIdentity(true);
      return;
    }

    setForm({
      ...form,
      type,
      ...(leavingCash
        ? {
            symbol: "",
            name: "",
            quantity: 0,
            price: 0,
            averageCost: 0,
            sector: "",
            priceSource: undefined,
            priceAsOf: undefined
          }
        : {})
    });
    clearLookupIntent();
    if (form.market === "TW") {
      setManualIdentity(false);
      setLookupUnavailable(false);
      if (!catalog?.length) setCatalog(null);
    }
  }

  function changeCashCurrency(currency: Currency) {
    setForm({
      ...form,
      currency,
      market: currency === "USD" ? "US" : "TW",
      symbol: `CASH-${currency}`,
      name: `${currency} 現金`,
      quantity: 1,
      price: 0,
      averageCost: 0,
      sector: "現金",
      priceSource: undefined,
      priceAsOf: undefined
    });
  }

  function persistHolding() {
    if (!valid) return false;

    if (form.type === "cash") {
      return onSave({
        id: initial?.id ?? `h-${Date.now()}`,
        ...form,
        market: form.currency === "USD" ? "US" : "TW",
        symbol: `CASH-${form.currency}`,
        name: `${form.currency} 現金`,
        quantity: 1,
        averageCost: form.price,
        sector: "現金",
        priceSource: undefined,
        priceAsOf: undefined,
        account: accountName(form.account)
      });
    }

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
      {form.type !== "cash" ? <>
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

      {form.market === "TW" ? (
        <div className="space-y-2">
          {manualIdentity ? (
            <div className="flex items-start justify-between gap-3 rounded-xl border border-black/6 bg-black/[.018] px-3 py-2.5 dark:border-white/8 dark:bg-white/[.025]">
              <p className="text-xs leading-5 text-black/45 dark:text-white/45">
                {lookupUnavailable
                  ? "官方 TWSE／TPEx 清單目前無法載入，已切換手動輸入；代號與名稱不會互相清除。"
                  : "目前是手動輸入模式；代號與名稱可分別修改，系統不會猜測或覆寫公開市場資料。"}
              </p>
              <button type="button" onClick={retryOfficialIdentity} className="shrink-0 text-xs font-semibold underline underline-offset-2">
                {lookupUnavailable ? "重試官方清單" : "回到官方搜尋"}
              </button>
            </div>
          ) : catalog === null ? (
            <p className="px-1 text-xs text-black/40 dark:text-white/40">正在載入 TWSE／TPEx 官方清單…</p>
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
            <div className="flex items-center justify-between gap-3 px-1">
              <p className="text-xs text-black/40 dark:text-white/40">找不到相符的官方台股資料。</p>
              <button type="button" onClick={useManualIdentity} className="shrink-0 text-xs font-semibold underline underline-offset-2">改用手動輸入</button>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-3 px-1">
              <p className="text-xs leading-5 text-black/40 dark:text-white/40">
                {initial
                  ? "修改代號或名稱時會重新比對官方清單；選中結果後才會更新公司名稱、產業、收盤價與來源。"
                  : "代號或名稱只要輸入其中一邊；完整吻合時會自動帶入另一欄與公開市場資料。"}
              </p>
              <button type="button" onClick={useManualIdentity} className="shrink-0 text-xs font-semibold underline underline-offset-2">手動輸入</button>
            </div>
          )}
        </div>
      ) : null}
      {form.market === "US" ? (
        <p className="px-1 text-xs leading-5 text-black/40 dark:text-white/40">
          美股目前不使用付費或授權不明的即時資料源；請手動填代號、名稱、目前價格與實際平均成本，兩個文字欄位不會互相清除。
        </p>
      ) : null}
      </> : (
        <div className="rounded-2xl border border-black/6 bg-black/[.018] p-3.5 dark:border-white/8 dark:bg-white/[.025]">
          <p className="text-sm font-semibold">現金部位只需要餘額</p>
          <p className="mt-1 text-xs leading-5 text-black/45 dark:text-white/45">
            不需要代號、股數、價格或平均成本。選擇幣別並填目前現金餘額即可；底層會以 1 × 餘額保存，不會產生未實現損益。
          </p>
        </div>
      )}

      <input className="field" placeholder="帳戶，例如：台股證券、複委託、銀行現金" value={form.account ?? ""} onChange={(e) => setForm({ ...form, account: e.target.value })} />
      {form.type === "cash" ? (
        <div className="grid grid-cols-2 gap-3">
          <select className="field" value={form.type} onChange={(e) => changeAssetType(e.target.value as AssetType)}>
            <option value="stock">個股</option>
            <option value="etf">ETF</option>
            <option value="cash">現金</option>
          </select>
          <select className="field" value={form.currency} onChange={(e) => changeCashCurrency(e.target.value as Currency)}>
            <option value="TWD">TWD 現金</option>
            <option value="USD">USD 現金</option>
          </select>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <select className="field" value={form.market} onChange={(e) => changeMarket(e.target.value as Market)}>
            <option value="TW">台灣</option>
            <option value="US">美國</option>
          </select>
          <select className="field" value={form.type} onChange={(e) => changeAssetType(e.target.value as AssetType)}>
            <option value="stock">個股</option>
            <option value="etf">ETF</option>
            <option value="cash">現金</option>
          </select>
        </div>
      )}
      {form.type === "cash" ? (
        <>
          <label className="block text-xs font-semibold text-black/45 dark:text-white/45">目前現金餘額（{form.currency}）</label>
          <input
            className="field"
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            placeholder={form.currency === "TWD" ? "例如：50000" : "例如：1500"}
            value={form.price || ""}
            onChange={(e) => {
              const balance = Number(e.target.value);
              setForm({
                ...form,
                quantity: 1,
                price: balance,
                averageCost: balance,
                sector: "現金",
                priceSource: undefined,
                priceAsOf: undefined
              });
            }}
          />
          <p className="px-1 text-xs leading-5 text-black/35 dark:text-white/35">
            PortfolioPilot 會把這筆餘額視為現金，不計算未實現損益；USD 現金會依目前 USD/TWD 匯率換算總淨值。
          </p>
        </>
      ) : (
        <>
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
            <p className="px-1 text-xs text-black/35 dark:text-white/35">目前價格若不是官方帶入，請在儲存前確認數值與標的身分。</p>
          )}
          <p className="px-1 text-xs text-black/35 dark:text-white/35">股數與平均成本都必須大於 0，避免產生錯誤的未實現損益。</p>
          <input className="field" placeholder="產業 / 類別" value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })} />
        </>
      )}
      <Button disabled={!valid} type="submit" className="w-full">{initial ? "儲存修改" : "新增部位"}</Button>
      <Dialog.Close asChild>
        <button ref={closeRef} type="button" className="hidden" aria-hidden="true" tabIndex={-1} />
      </Dialog.Close>
    </form>
  );
}

type CorrectionDraft = {
  quantity: string;
  price: string;
  averageCost: string;
};

function correctionDraft(holding: Holding): CorrectionDraft {
  if (holding.type === "cash") {
    const balance = holding.quantity * holding.price;
    return {
      quantity: "1",
      price: String(balance),
      averageCost: String(balance)
    };
  }

  return {
    quantity: String(holding.quantity),
    price: String(holding.price),
    averageCost: String(holding.averageCost)
  };
}

function QuickCorrectionForm({
  holdings,
  onSave
}: {
  holdings: Holding[];
  onSave: (corrections: HoldingCorrection[]) => boolean;
}) {
  const [drafts, setDrafts] = useState<Record<string, CorrectionDraft>>(
    () => Object.fromEntries(holdings.map((holding) => [holding.id, correctionDraft(holding)])) as Record<string, CorrectionDraft>
  );
  const closeRef = useRef<HTMLButtonElement>(null);

  const valid = holdings.length > 0 && holdings.every((holding) => {
    const draft = drafts[holding.id] ?? correctionDraft(holding);
    const price = Number(draft.price);
    if (holding.type === "cash") return Number.isFinite(price) && price >= 0;

    const quantity = Number(draft.quantity);
    const averageCost = Number(draft.averageCost);
    return Number.isFinite(quantity) && quantity > 0 &&
      Number.isFinite(price) && price > 0 &&
      Number.isFinite(averageCost) && averageCost > 0;
  });

  function updateDraft(id: string, field: keyof CorrectionDraft, value: string) {
    setDrafts((current) => ({
      ...current,
      [id]: {
        ...(current[id] ?? { quantity: "", price: "", averageCost: "" }),
        [field]: value
      }
    }));
  }

  function persist(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid) return;

    const corrections: HoldingCorrection[] = holdings.map((holding) => {
      const draft = drafts[holding.id] ?? correctionDraft(holding);
      if (holding.type === "cash") {
        const balance = Number(draft.price);
        return {
          id: holding.id,
          quantity: 1,
          price: balance,
          averageCost: balance
        };
      }

      return {
        id: holding.id,
        quantity: Number(draft.quantity),
        price: Number(draft.price),
        averageCost: Number(draft.averageCost)
      };
    });

    if (onSave(corrections)) closeRef.current?.click();
  }

  return (
    <form onSubmit={persist} className="space-y-4">
      <div className="rounded-2xl border border-black/6 bg-black/[.018] p-4 dark:border-white/8 dark:bg-white/[.025]">
        <p className="text-sm font-semibold">依券商目前庫存一次校正</p>
        <p className="mt-1 text-xs leading-5 text-black/45 dark:text-white/45">
          這裡只更新數量、目前價格、平均成本與現金餘額；標的、帳戶、市場與幣別不會改動。手動修改目前價格時，舊的官方價格來源日期會自動清除，避免把手動數值誤標成 TWSE／TPEx 官方價。
        </p>
      </div>

      <div className="space-y-3">
        {holdings.map((holding) => {
          const draft = drafts[holding.id] ?? correctionDraft(holding);
          const isCash = holding.type === "cash";

          return (
            <div key={holding.id} className="rounded-2xl border border-black/6 p-4 dark:border-white/8">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">{isCash ? `${holding.currency} 現金` : holding.name}</p>
                  <p className="mt-1 text-xs text-black/40 dark:text-white/40">
                    {isCash ? accountName(holding.account) : `${holding.symbol} · ${accountName(holding.account)} · ${holding.market}`}
                  </p>
                </div>
                {!isCash && holding.priceSource && holding.priceSource !== "manual" && holding.priceAsOf ? (
                  <Badge>{holding.priceSource} · {holding.priceAsOf}</Badge>
                ) : null}
              </div>

              {isCash ? (
                <div className="mt-4">
                  <label className="block text-xs font-semibold text-black/45 dark:text-white/45">目前現金餘額（{holding.currency}）</label>
                  <input
                    className="field mt-2"
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min="0"
                    value={draft.price}
                    onChange={(event) => updateDraft(holding.id, "price", event.target.value)}
                  />
                </div>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <label className="block">
                    <span className="text-xs font-semibold text-black/45 dark:text-white/45">數量</span>
                    <input
                      className="field mt-2"
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min="0"
                      value={draft.quantity}
                      onChange={(event) => updateDraft(holding.id, "quantity", event.target.value)}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-black/45 dark:text-white/45">目前價格（{holding.currency}）</span>
                    <input
                      className="field mt-2"
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min="0"
                      value={draft.price}
                      onChange={(event) => updateDraft(holding.id, "price", event.target.value)}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-black/45 dark:text-white/45">平均成本（{holding.currency}）</span>
                    <input
                      className="field mt-2"
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min="0"
                      value={draft.averageCost}
                      onChange={(event) => updateDraft(holding.id, "averageCost", event.target.value)}
                    />
                  </label>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="sticky bottom-0 -mx-1 bg-white/95 px-1 pb-[max(.25rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur dark:bg-[#111713]/95">
        <Button disabled={!valid} type="submit" className="w-full">
          儲存全部校正
        </Button>
      </div>

      <Dialog.Close asChild>
        <button ref={closeRef} type="button" className="hidden" aria-hidden="true" tabIndex={-1} />
      </Dialog.Close>
    </form>
  );
}

type SortMode = "value" | "gain" | "name";

type RefreshFeedback = {
  tone: "good" | "warn";
  title: string;
  details: string[];
  needsEtfHelp: boolean;
};

export function HoldingsPanel({
  state,
  onChange,
  onResearch,
  onOpenEtfLookthrough,
  requestedCandidate
}: {
  state: AppState;
  onChange: (state: AppState) => boolean;
  onResearch?: (researchKey: string, researchType: "stock" | "etf") => void;
  onOpenEtfLookthrough?: () => void;
  requestedCandidate?: HoldingLookupCandidate;
}) {
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(Boolean(requestedCandidate));
  const [addCandidate, setAddCandidate] = useState<HoldingLookupCandidate | undefined>(requestedCandidate);
  const [sort, setSort] = useState<SortMode>("value");
  const [account, setAccount] = useState("all");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFeedback, setRefreshFeedback] = useState<RefreshFeedback | null>(null);
  const refreshInFlight = useRef(false);
  const latestState = useRef(state);
  useEffect(() => {
    latestState.current = state;
  }, [state]);
  const summary = portfolioSummary(state.holdings, state.usdTwd);

  const accounts = useMemo(() => [...new Set(state.holdings.map((holding) => accountName(holding.account)))].sort((a, b) => a.localeCompare(b, "zh-Hant")), [state.holdings]);

  const latestOfficialPriceDate = useMemo(
    () => state.holdings
      .filter((holding) =>
        holding.market === "TW" &&
        holding.type !== "cash" &&
        (holding.priceSource === "TWSE" || holding.priceSource === "TPEx") &&
        Boolean(holding.priceAsOf)
      )
      .map((holding) => holding.priceAsOf!)
      .sort()
      .at(-1) ?? null,
    [state.holdings]
  );

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

    const saved = onChange({
      ...state,
      holdings: exists ? state.holdings.map((item) => item.id === holding.id ? holding : item) : [...state.holdings, holding]
    });
    if (!saved) return false;
    toast.success(exists ? "部位已更新" : "部位已新增");
    return true;
  }

  function quickCorrect(corrections: HoldingCorrection[]) {
    const currentById = new Map(state.holdings.map((holding) => [holding.id, holding]));
    const changedCount = corrections.filter((correction) => {
      const current = currentById.get(correction.id);
      if (!current) return true;
      if (current.type === "cash") {
        return current.quantity !== 1 ||
          current.price !== correction.price ||
          current.averageCost !== correction.price;
      }

      return current.quantity !== correction.quantity ||
        current.price !== correction.price ||
        current.averageCost !== correction.averageCost;
    }).length;

    if (changedCount === 0) {
      toast.info("目前庫存沒有需要儲存的變更");
      return true;
    }

    try {
      const holdings = applyHoldingCorrections(state.holdings, corrections);
      if (!onChange({ ...state, holdings })) return false;
      toast.success(`已校正 ${changedCount} 個部位`);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "快速校正失敗");
      return false;
    }
  }

  async function refreshTaiwanPrices() {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    setRefreshing(true);
    setRefreshFeedback(null);

    try {
      const [quoteLoad, compositionLoad] = await Promise.allSettled([
        loadBundledTwQuotes(),
        loadBundledEtfCompositions()
      ]);

      // A user may edit a holding while the two network requests are pending.
      // Always apply the fetched cache to the latest local state, not a stale closure.
      const currentState = latestState.current;
      let nextHoldings = currentState.holdings;
      let nextCompositions = currentState.etfCompositions;
      const details: string[] = [];
      const warnings: string[] = [];
      let needsEtfHelp = false;

      if (quoteLoad.status === "fulfilled") {
        const cache = quoteLoad.value;
        const asOf = cacheFreshnessLabel(cache);
        if (cache.offlineFallback) {
          warnings.push(`離線狀態：目前僅取得 ${asOf} 的收盤價快取，沒有更新持股價格。請恢復網路後再同步。`);
        } else if (shouldRejectStaleClosingCache(cache)) {
          warnings.push(`官方收盤快取目前只到 ${asOf}，本次未覆寫持股價格。`);
        } else {
          const result = applyTwQuotes(currentState.holdings, cache);
          nextHoldings = result.holdings;
          const freshness = cacheMarketFreshness(cache);
          const dateLabel = [
            freshness.TWSE ? `TWSE ${closingPriceStatusLabel(freshness.TWSE)}` : null,
            freshness.TPEx ? `TPEx ${closingPriceStatusLabel(freshness.TPEx)}` : null
          ].filter(Boolean).join(" · ");
          if (result.matched > 0) {
            details.push(
              result.updated > 0
                ? `收盤價：更新 ${result.updated}/${result.matched} 筆 · ${dateLabel || asOf}`
                : `收盤價：已是最新可用資料 · ${dateLabel || asOf}`
            );
          } else if (currentState.holdings.some((holding) => holding.market === "TW" && holding.type !== "cash")) {
            warnings.push(`現有台股持倉沒有可安全匹配的官方收盤價 · ${dateLabel || asOf}`);
          } else {
            details.push("沒有需要更新收盤價的台股持倉。");
          }
          if (result.skippedStale || result.skippedAmbiguous) {
            warnings.push(`${result.skippedStale + result.skippedAmbiguous} 筆持倉因報價日期較舊或交易市場／來源重複不明，已保留原價。`);
          }
          if (result.skippedInvalidDate) {
            warnings.push(`${result.skippedInvalidDate} 筆報價日期無效或晚於台灣今天，已拒絕覆寫持股價格。`);
          }
        }
      } else {
        warnings.push(
          quoteLoad.reason instanceof Error ? quoteLoad.reason.message : "官方收盤價快取暫時不可用。"
        );
      }

      if (compositionLoad.status === "fulfilled") {
        const cache = compositionLoad.value;
        if (cache.offlineFallback) {
          warnings.push(`離線狀態：ETF 成份僅取得 ${cache.generatedAt.slice(0, 10)} 的舊快取，沒有覆寫本機成份。`);
        } else {
          const result = applyHeldEtfCompositions(currentState.etfCompositions, currentState.holdings, cache);
          nextCompositions = result.compositions;
          if (result.heldTwEtfCount > 0) {
            const generatedAt = new Date(cache.generatedAt);
            const cacheTime = Number.isFinite(generatedAt.getTime())
              ? generatedAt.toLocaleString("zh-TW", {
                  timeZone: "Asia/Taipei",
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false
                })
              : "時間未知";
            details.push(`ETF 官方快取時間：${cacheTime}（台灣時間）`);
            if (result.matched > 0) {
              details.push(`ETF 成份：${result.updated} 檔更新、${result.unchanged} 檔未變更。`);
            } else if (result.supported > 0) {
              warnings.push("ETF 官方來源已收錄，但這次沒有可安全套用的成份資料。");
            }
            if (result.sourceIssueSymbols.length) {
              warnings.push(`ETF ${result.sourceIssueSymbols.join("、")}：官方成份來源本次異常，已保留可用本機資料。`);
              needsEtfHelp = true;
            }
            if (result.unsupportedSymbols.length) {
              warnings.push(`ETF ${result.unsupportedSymbols.join("、")}：尚未支援官方自動成份；未推估或覆寫成份。`);
              needsEtfHelp = true;
            }
            if (result.preservedNewer > 0) {
              details.push(`${result.preservedNewer} 檔 ETF 的本機成份日期較新，已保留。`);
            }
          } else {
            details.push("目前沒有需要同步成份的台灣 ETF。");
          }
        }
      } else {
        warnings.push(
          compositionLoad.reason instanceof Error ? compositionLoad.reason.message : "官方 ETF 成份快取暫時不可用。"
        );
      }

      const changed =
        nextHoldings.some((holding, index) => holding !== currentState.holdings[index]) ||
        nextCompositions.length !== currentState.etfCompositions.length ||
        nextCompositions.some((composition, index) => composition !== currentState.etfCompositions[index]);

      if (changed && !onChange({
        ...currentState,
        holdings: nextHoldings,
        etfCompositions: nextCompositions
      })) {
        setRefreshFeedback({
          tone: "warn",
          title: "已讀取資料，但本機儲存未成功",
          details: ["請先處理本機資料儲存狀態；此次沒有安全套用變更。"],
          needsEtfHelp: false
        });
        return;
      }

      setRefreshFeedback({
        tone: warnings.length ? "warn" : "good",
        title: warnings.length
          ? changed ? "部分更新完成，另有資料需要注意" : "已檢查，部分資料未更新"
          : changed ? "最新資料已同步" : "已檢查，資料沒有新變更",
        details: [...details, ...warnings],
        needsEtfHelp
      });
    } catch (error) {
      setRefreshFeedback({
        tone: "warn",
        title: "同步未完成",
        details: [error instanceof Error ? error.message : "市場資料更新失敗"],
        needsEtfHelp: false
      });
    } finally {
      refreshInFlight.current = false;
      setRefreshing(false);
    }
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm text-black/45 dark:text-white/45">目前總淨值</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight">{money(summary.total)}</p>
          {accounts.length ? <p className="mt-1 text-xs text-black/38 dark:text-white/38">{accounts.length} 個帳戶 · 可分帳戶檢視</p> : null}
        </div>

        <div className="grid w-full grid-cols-2 items-start gap-2 sm:w-auto sm:flex sm:flex-wrap sm:items-center sm:justify-end">
          <Modal
            title="新增投資部位"
            open={addOpen}
            onOpenChange={(open) => {
              setAddOpen(open);
              if (!open) setAddCandidate(undefined);
            }}
            trigger={<Button className="col-span-2 w-full sm:w-auto" onClick={() => setAddCandidate(undefined)}><Plus size={16} />新增部位</Button>}
          >
            <HoldingForm candidate={addCandidate} onSave={upsert} />
          </Modal>
          <div className="flex min-w-0 flex-col gap-1">
            <GhostButton className="w-full whitespace-nowrap sm:w-auto" type="button" disabled={refreshing} onClick={refreshTaiwanPrices}>
              <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
              {refreshing ? "同步中" : "同步資料"}
            </GhostButton>
            {latestOfficialPriceDate ? (
              <span className="px-1 text-center text-[11px] text-black/38 dark:text-white/38">
                {closingPriceStatusLabel(latestOfficialPriceDate)}
              </span>
            ) : null}
          </div>
          {state.holdings.length ? (
            <Modal
              title="快速校正目前庫存"
              trigger={<GhostButton type="button" className="w-full whitespace-nowrap sm:w-auto"><ListChecks size={16} />快速校正</GhostButton>}
            >
              <QuickCorrectionForm holdings={state.holdings} onSave={quickCorrect} />
            </Modal>
          ) : null}
        </div>
      </div>

      {refreshFeedback ? (
        <section
          role="status"
          aria-live="polite"
          aria-label="最新資料同步結果"
          className={`rounded-2xl border px-4 py-3 text-sm ${refreshFeedback.tone === "warn"
            ? "border-[#b98b57]/25 bg-[#f8f1e8] text-[#6f4c26] dark:border-[#b98b57]/20 dark:bg-[#2a2117] dark:text-[#e0bd8c]"
            : "border-[#87b49c]/30 bg-[#edf5ef] text-[#245238] dark:border-[#87b49c]/20 dark:bg-[#17281e] dark:text-[#a8dab8]"}`}
        >
          <div className="flex items-center justify-between gap-3">
            <strong className="font-semibold">{refreshFeedback.title}</strong>
            <button type="button" aria-label="關閉同步結果" onClick={() => setRefreshFeedback(null)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"><X size={16} /></button>
          </div>
          <div className="mt-1 space-y-1 break-words text-xs leading-5">
            {refreshFeedback.details.map((detail, index) => <p key={`${index}:${detail}`}>{detail}</p>)}
          </div>
          {refreshFeedback.needsEtfHelp && onOpenEtfLookthrough ? (
            <button type="button" onClick={onOpenEtfLookthrough} className="mt-3 min-h-10 rounded-xl border border-current/20 px-3 text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/10">
              前往 ETF 穿透／匯入成份 CSV
            </button>
          ) : null}
        </section>
      ) : null}

      <div className="grid grid-cols-2 gap-2 md:grid-cols-[minmax(0,1fr)_180px_180px]">
        <div className="relative col-span-2 md:col-span-1">
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
          const isCash = holding.type === "cash";
          const nativeCashBalance = isCash ? holding.quantity * holding.price : 0;
          return (
            <Card key={holding.id}>
              <CardContent className="p-4 md:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="font-semibold">{isCash ? `${holding.currency} 現金` : holding.name}</p>
                      {!isCash ? <span className="text-xs text-black/40 dark:text-white/40">{holding.symbol}</span> : null}
                      <Badge>{accountName(holding.account)}</Badge>
                      {isCash ? <Badge tone="good">現金</Badge> : null}
                    </div>
                    <p className="mt-1 text-sm text-black/45 dark:text-white/45">
                      {isCash ? `${holding.currency} 餘額 · 不計未實現損益` : `${holding.sector} · ${holding.market} · ${holding.currency}`}
                    </p>
                    {!isCash && holding.priceSource && holding.priceAsOf ? (
                      <p className="mt-1 text-[11px] text-black/35 dark:text-white/35">
                        價格來源 {holding.priceSource} · {closingPriceStatusLabel(holding.priceAsOf)}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {holding.market === "TW" && (holding.priceSource === "TWSE" || holding.priceSource === "TPEx") && onResearch ? (
                      <GhostButton
                        className="h-10 min-h-10 w-10 px-0"
                        aria-label={`研究 ${holding.name}`}
                        title="查看官方研究"
                        onClick={() => onResearch(`${holding.priceSource}:${holding.symbol}`, holding.type === "etf" ? "etf" : "stock")}
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
                        if (!onChange({ ...state, holdings: state.holdings.filter((item) => item.id !== holding.id) })) return;
                        toast.success("部位已刪除");
                      }}
                    >
                      <Trash2 size={15} />
                    </GhostButton>
                  </div>
                </div>
                {isCash ? (
                  <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="mini-metric"><span>餘額</span><strong>{holding.currency} {nativeCashBalance.toLocaleString("zh-TW", { maximumFractionDigits: 2 })}</strong></div>
                    <div className="mini-metric"><span>台幣換算</span><strong>{money(value)}</strong></div>
                    <div className="mini-metric"><span>未實現損益</span><strong>不計算</strong></div>
                    <div className="mini-metric"><span>總資產占比</span><strong>{pct.toFixed(1)}%</strong></div>
                  </div>
                ) : (
                  <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="mini-metric"><span>數量</span><strong>{holding.quantity.toLocaleString()}</strong></div>
                    <div className="mini-metric"><span>市值</span><strong>{money(value)}</strong></div>
                    <div className="mini-metric"><span>損益</span><strong>{percent(gainPct)}</strong></div>
                    <div className="mini-metric"><span>占比</span><strong>{pct.toFixed(1)}%</strong></div>
                  </div>
                )}
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
