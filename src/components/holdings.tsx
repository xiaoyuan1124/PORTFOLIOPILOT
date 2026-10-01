"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowDownUp, ListChecks, Pencil, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { AppState, AssetType, Currency, Holding, Market } from "@/lib/types";
import { holdingCostTwd, holdingValueTwd, portfolioSummary } from "@/lib/calc";
import { applyHoldingCorrections, accountName, holdingIdentityKey, type HoldingCorrection } from "@/lib/local-data";
import { money, percent } from "@/lib/utils";
import { applyTwQuotes, cacheFreshnessLabel, cacheMarketFreshness, loadBundledTwQuotes, shouldRejectStaleClosingCache } from "@/lib/market-data";
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

function HoldingForm({ initial, onSave }: { initial?: Holding; onSave: (holding: Holding) => boolean }) {
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

export function HoldingsPanel({ state, onChange, onResearch }: { state: AppState; onChange: (state: AppState) => boolean; onResearch?: (researchKey: string) => void }) {
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
    setRefreshing(true);
    try {
      const [quoteLoad, compositionLoad] = await Promise.allSettled([
        loadBundledTwQuotes(),
        loadBundledEtfCompositions()
      ]);

      let nextHoldings = state.holdings;
      let nextCompositions = state.etfCompositions;
      let quoteSummary = "";
      let quoteWarning = "";
      let compositionSummary = "";
      let compositionWarning = "";

      if (quoteLoad.status === "fulfilled") {
        const cache = quoteLoad.value;
        const asOf = cacheFreshnessLabel(cache);
        if (shouldRejectStaleClosingCache(cache)) {
          quoteWarning = `官方收盤價快取目前只到 ${asOf}，可能休市或尚未發布今天資料；本次沒有覆寫持股價格。`;
        } else {
          const result = applyTwQuotes(state.holdings, cache);
          nextHoldings = result.holdings;
          const freshness = cacheMarketFreshness(cache);
          const dateLabel = [
            freshness.TWSE ? `TWSE ${freshness.TWSE}` : null,
            freshness.TPEx ? `TPEx ${freshness.TPEx}` : null
          ].filter(Boolean).join(" · ");
          quoteSummary = result.updated
            ? `台股價格 ${result.updated}/${result.matched} · ${dateLabel || asOf}`
            : result.matched > 0
              ? `台股價格已最新 · ${dateLabel || asOf}`
              : `台股無可套用報價 · ${dateLabel || asOf}`;
          if (result.skippedStale || result.skippedAmbiguous) {
            quoteWarning = `另有 ${result.skippedStale + result.skippedAmbiguous} 筆價格因舊日期或市場不明而保留原值。`;
          }
        }
      } else {
        quoteWarning = quoteLoad.reason instanceof Error ? quoteLoad.reason.message : "無法載入官方台股收盤資料。";
      }

      if (compositionLoad.status === "fulfilled") {
        const result = applyHeldEtfCompositions(state.etfCompositions, state.holdings, compositionLoad.value);
        nextCompositions = result.compositions;
        if (result.heldTwEtfCount > 0) {
          compositionSummary = result.matched > 0
            ? `ETF 成份 ${result.updated} 更新、${result.unchanged} 已最新`
            : "持有 ETF 尚無支援的官方自動成份來源";
          if (result.unsupported > 0 || result.preservedNewer > 0) {
            compositionWarning = [
              result.unsupported > 0 ? `${result.unsupported} 檔持有台灣 ETF 尚未支援自動成份` : "",
              result.preservedNewer > 0 ? `${result.preservedNewer} 檔本機資料較新，已保留` : ""
            ].filter(Boolean).join("；");
          }
        }
      } else {
        compositionWarning = compositionLoad.reason instanceof Error
          ? compositionLoad.reason.message
          : "無法載入官方 ETF 成份快取。";
      }

      const changed =
        nextHoldings.some((holding, index) => holding !== state.holdings[index]) ||
        nextCompositions.length !== state.etfCompositions.length ||
        nextCompositions.some((composition, index) => composition !== state.etfCompositions[index]);

      if (changed && !onChange({
        ...state,
        holdings: nextHoldings,
        etfCompositions: nextCompositions
      })) return;

      const successes = [quoteSummary, compositionSummary].filter(Boolean);
      if (successes.length) toast.success(`市場資料更新完成 · ${successes.join(" · ")}`);
      if (!successes.length && (quoteWarning || compositionWarning)) {
        toast.warning("市場資料本次沒有可安全套用的更新。");
      }
      for (const warning of [quoteWarning, compositionWarning].filter(Boolean)) {
        toast.info(warning);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "市場資料更新失敗");
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
            {refreshing ? "更新中" : "更新市場資料"}
          </GhostButton>
          {state.holdings.length ? (
            <Modal
              title="快速校正目前庫存"
              trigger={<GhostButton type="button"><ListChecks size={16} />快速校正</GhostButton>}
            >
              <QuickCorrectionForm holdings={state.holdings} onSave={quickCorrect} />
            </Modal>
          ) : null}
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
