"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowDownCircle, ArrowUpCircle, Banknote, Layers3, Pencil, Plus, ReceiptText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { ActivityType, AppState, Currency, PortfolioActivity } from "@/lib/types";
import { isExternalActivityType, isTradeActivityType } from "@/lib/activity-data";
import { localDateKey, localTimeKey, portfolioSummary } from "@/lib/calc";
import {
  buildHoldingLookupCatalog,
  searchHoldingLookupCatalog,
  type HoldingLookupCandidate
} from "@/lib/holding-autofill";
import { loadBundledTwQuotes } from "@/lib/market-data";
import { loadBundledRevenue } from "@/lib/revenue-data";
import {
  applyCashLinkedActivity,
  revertCashLinkedActivity,
  type CashLinkedActivityInput
} from "@/lib/cash-account";
import {
  applyShareAdjustment,
  revertCorporateAction,
  type ShareAdjustmentInput
} from "@/lib/corporate-actions";
import { accountName } from "@/lib/local-data";
import { activityAmountTwd } from "@/lib/performance";
import {
  applyManagedTrade,
  applyOpeningBuy,
  realizedManagedTradePnlTwd,
  revertManagedTrade,
  type ManagedTradeInput,
  type NewPositionBuyInput
} from "@/lib/trade-inventory";
import { money } from "@/lib/utils";
import { Badge, Button, Card, CardContent, GhostButton, Modal } from "./ui";

const labels: Record<ActivityType, string> = {
  deposit: "入金",
  withdrawal: "出金",
  buy: "買進",
  sell: "賣出",
  dividend: "股息",
  fee: "費用",
  corporate_action: "股數調整"
};

const icons: Record<ActivityType, typeof Banknote> = {
  deposit: ArrowDownCircle,
  withdrawal: ArrowUpCircle,
  buy: Banknote,
  sell: Banknote,
  dividend: ReceiptText,
  fee: ReceiptText,
  corporate_action: Layers3
};

function nextActivityId(activities: PortfolioActivity[], date: string) {
  const prefix = `activity-${date}-`;
  const used = new Set(activities.map((activity) => activity.id));
  let sequence = activities.length + 1;
  while (used.has(`${prefix}${sequence}`)) sequence += 1;
  return `${prefix}${sequence}`;
}

function OpeningBuyForm({
  state,
  onSave
}: {
  state: AppState;
  onSave: (input: NewPositionBuyInput) => boolean;
}) {
  const today = localDateKey();
  const [market, setMarket] = useState<"TW" | "US">("TW");
  const currency: Currency = market === "TW" ? "TWD" : "USD";
  const compatibleCash = useMemo(
    () => state.holdings.filter((holding) => holding.type === "cash" && holding.currency === currency),
    [currency, state.holdings]
  );
  const [cashHoldingId, setCashHoldingId] = useState("");
  const selectedCash = compatibleCash.find((holding) => holding.id === cashHoldingId) ?? compatibleCash[0] ?? null;
  const [catalog, setCatalog] = useState<HoldingLookupCandidate[]>([]);
  const [catalogStatus, setCatalogStatus] = useState<"loading" | "ready" | "error">("loading");
  const [query, setQuery] = useState("");
  const [candidate, setCandidate] = useState<HoldingLookupCandidate | null>(null);
  const [usSymbol, setUsSymbol] = useState("");
  const [usName, setUsName] = useState("");
  const [usType, setUsType] = useState<"stock" | "etf">("stock");
  const [usSector, setUsSector] = useState("");
  const [usCurrentPrice, setUsCurrentPrice] = useState(0);
  const [quantity, setQuantity] = useState(0);
  const [executionPrice, setExecutionPrice] = useState(0);
  const [fee, setFee] = useState(0);
  const [tax, setTax] = useState(0);
  const [fxRate, setFxRate] = useState(state.usdTwd);
  const [note, setNote] = useState("");
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadBundledTwQuotes(), loadBundledRevenue()])
      .then(([quotes, revenue]) => {
        if (cancelled) return;
        setCatalog(buildHoldingLookupCatalog(quotes, revenue));
        setCatalogStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setCatalog([]);
        setCatalogStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const lookupResults = useMemo(
    () => market === "TW" && query.trim() ? searchHoldingLookupCatalog(catalog, query) : [],
    [catalog, market, query]
  );

  const gross = quantity * executionPrice;
  const totalOutflow = gross + fee + tax;
  const currentPrice = market === "TW" ? (candidate?.close ?? 0) : usCurrentPrice;
  const symbol = market === "TW" ? (candidate?.code ?? "") : usSymbol.trim().toUpperCase();
  const name = market === "TW" ? (candidate?.name ?? "") : usName.trim();
  const sector = market === "TW" ? (candidate?.industry ?? "") : usSector.trim();
  const assetType = market === "TW" ? (candidate?.type ?? "stock") : usType;
  const sufficientCash = selectedCash !== null && totalOutflow <= selectedCash.price + 1e-9;
  const valid = Boolean(selectedCash) &&
    quantity > 0 &&
    executionPrice > 0 &&
    currentPrice > 0 &&
    fee >= 0 &&
    tax >= 0 &&
    Boolean(symbol) &&
    Boolean(name) &&
    Boolean(sector) &&
    (currency === "TWD" || fxRate > 0) &&
    sufficientCash;

  function switchMarket(next: "TW" | "US") {
    setMarket(next);
    setCandidate(null);
    setQuery("");
    setQuantity(0);
    setExecutionPrice(0);
    setFee(0);
    setTax(0);
    if (next === "US") setFxRate(state.usdTwd);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid || !selectedCash) return;

    const activityId = nextActivityId(state.activities, today);
    const saved = onSave({
      id: activityId,
      date: today,
      cashHoldingId: selectedCash.id,
      position: {
        id: `holding-${activityId}`,
        symbol,
        name,
        market,
        type: assetType,
        price: currentPrice,
        currency,
        sector,
        account: accountName(selectedCash.account),
        ...(market === "TW" && candidate
          ? { priceSource: candidate.venue, priceAsOf: candidate.date }
          : { priceSource: "manual" as const })
      },
      quantity,
      price: executionPrice,
      fee,
      tax,
      fxRate: currency === "USD" ? fxRate : 1,
      note
    });
    if (!saved) return;
    closeRef.current?.click();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className={`min-h-11 rounded-xl border px-3 text-sm font-semibold ${market === "TW" ? "border-[#1f332a] bg-[#edf2ee] dark:border-[#dce9e2] dark:bg-[#17201b]" : "border-black/7 dark:border-white/9"}`}
          onClick={() => switchMarket("TW")}
        >
          台股
        </button>
        <button
          type="button"
          className={`min-h-11 rounded-xl border px-3 text-sm font-semibold ${market === "US" ? "border-[#1f332a] bg-[#edf2ee] dark:border-[#dce9e2] dark:bg-[#17201b]" : "border-black/7 dark:border-white/9"}`}
          onClick={() => switchMarket("US")}
        >
          美股
        </button>
      </div>

      {market === "TW" ? (
        <div className="space-y-2">
          <input
            className="field"
            placeholder="輸入台股代號或名稱，例如 2330、台積電"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setCandidate(null);
            }}
          />
          {catalogStatus === "loading" ? <p className="px-1 text-xs text-black/40 dark:text-white/40">正在載入 TWSE／TPEx 官方標的快取…</p> : null}
          {catalogStatus === "error" ? <p className="px-1 text-xs text-[#8b6538] dark:text-[#e0bd8c]">官方標的快取載入失敗；為避免猜測標的，台股首次買進暫不允許送出。</p> : null}
          {lookupResults.length ? (
            <div className="overflow-hidden rounded-2xl border border-black/7 bg-white dark:border-white/8 dark:bg-white/4">
              {lookupResults.map((item) => (
                <button
                  key={`${item.venue}:${item.code}`}
                  type="button"
                  className="flex w-full items-center justify-between gap-3 border-b border-black/5 px-3 py-3 text-left last:border-b-0 dark:border-white/6"
                  onClick={() => {
                    setCandidate(item);
                    setQuery(`${item.code} ${item.name}`);
                    if (!executionPrice) setExecutionPrice(item.close);
                  }}
                >
                  <span><strong>{item.code}</strong> · {item.name}</span>
                  <span className="text-xs text-black/40 dark:text-white/40">{item.venue} · {item.date}</span>
                </button>
              ))}
            </div>
          ) : null}
          {candidate ? (
            <div className="rounded-2xl border border-black/6 bg-black/[.018] p-3 text-xs leading-5 text-black/50 dark:border-white/8 dark:bg-white/[.025] dark:text-white/50">
              <strong>{candidate.code} {candidate.name}</strong> · {candidate.type === "etf" ? "ETF" : "股票"} · {candidate.industry}<br />
              官方目前價 {candidate.close.toLocaleString()} · {candidate.venue} · {candidate.date}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input className="field" placeholder="美股代號，例如 QQQM" value={usSymbol} onChange={(event) => setUsSymbol(event.target.value)} />
            <select className="field" value={usType} onChange={(event) => setUsType(event.target.value as "stock" | "etf")}>
              <option value="stock">股票</option>
              <option value="etf">ETF</option>
            </select>
          </div>
          <input className="field" placeholder="標的名稱" value={usName} onChange={(event) => setUsName(event.target.value)} />
          <input className="field" placeholder="分類／產業，例如 ETF、半導體" value={usSector} onChange={(event) => setUsSector(event.target.value)} />
          <input className="field" type="number" min="0.000001" step="any" placeholder="目前價格（USD，手動）" value={usCurrentPrice || ""} onChange={(event) => setUsCurrentPrice(Number(event.target.value))} />
          <p className="px-1 text-[11px] leading-5 text-black/38 dark:text-white/38">目前尚未接免費官方美股收盤來源，因此美股目前價格標記為 manual；成交價仍獨立保存。</p>
        </div>
      )}

      <select className="field" value={selectedCash?.id ?? ""} onChange={(event) => setCashHoldingId(event.target.value)}>
        <option value="">選擇 {currency} 現金帳戶</option>
        {compatibleCash.map((holding) => (
          <option key={holding.id} value={holding.id}>
            {accountName(holding.account)} · {holding.currency} {holding.price.toLocaleString()}
          </option>
        ))}
      </select>
      {!compatibleCash.length ? <p className="px-1 text-xs text-[#8b6538] dark:text-[#e0bd8c]">沒有 {currency} 現金帳戶，請先到「持股」新增對應幣別現金。</p> : null}

      <div className="grid grid-cols-2 gap-3">
        <input className="field" type="number" min="0.000001" step="any" placeholder="買進數量" value={quantity || ""} onChange={(event) => setQuantity(Number(event.target.value))} />
        <input className="field" type="number" min="0.000001" step="any" placeholder={`成交價（${currency}）`} value={executionPrice || ""} onChange={(event) => setExecutionPrice(Number(event.target.value))} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <input className="field" type="number" min="0" step="any" placeholder="手續費" value={fee || ""} onChange={(event) => setFee(Number(event.target.value))} />
        <input className="field" type="number" min="0" step="any" placeholder="交易稅／其他稅費" value={tax || ""} onChange={(event) => setTax(Number(event.target.value))} />
      </div>

      {currency === "USD" ? (
        <input className="field" type="number" min="0.0001" step="0.01" placeholder="當日 USD/TWD 匯率" value={fxRate || ""} onChange={(event) => setFxRate(Number(event.target.value))} />
      ) : null}

      <div className="rounded-2xl border border-black/6 bg-black/[.018] p-3 text-xs leading-5 text-black/48 dark:border-white/8 dark:bg-white/[.025] dark:text-white/48">
        <div className="flex justify-between gap-3"><span>含費稅總支出</span><strong>{currency} {Number.isFinite(totalOutflow) ? totalOutflow.toLocaleString() : "—"}</strong></div>
        {selectedCash ? <div className="mt-1 flex justify-between gap-3"><span>現金餘額</span><strong>{selectedCash.price.toLocaleString()} → {(selectedCash.price - totalOutflow).toLocaleString()}</strong></div> : null}
        {selectedCash && !sufficientCash ? <p className="mt-2 text-[#8b6538] dark:text-[#e0bd8c]">現金不足，首次買進不會寫入任何資料。</p> : null}
      </div>

      <textarea className="field resize-none" rows={3} placeholder="備註（選填）" value={note} onChange={(event) => setNote(event.target.value)} />
      <p className="text-xs leading-5 text-black/40 dark:text-white/40">
        首次買進會同時建立新持股、扣現金並寫入交易。之後加碼請使用一般「買進」，避免重複建立相同部位。
      </p>
      <Button type="submit" disabled={!valid} className="w-full"><Plus size={16} />建立部位並買進</Button>
      <Dialog.Close asChild>
        <button ref={closeRef} type="button" className="hidden" aria-hidden="true" tabIndex={-1} />
      </Dialog.Close>
    </form>
  );
}

function ActivityForm({
  state,
  onSaveCash,
  onSaveTrade,
  onSaveCorporateAction
}: {
  state: AppState;
  onSaveCash: (input: CashLinkedActivityInput) => boolean;
  onSaveTrade: (input: ManagedTradeInput) => boolean;
  onSaveCorporateAction: (input: ShareAdjustmentInput) => boolean;
}) {
  const [type, setType] = useState<ActivityType>("deposit");
  const today = localDateKey();
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("");
  const tradeHoldings = useMemo(
    () => state.holdings.filter((holding) => holding.type !== "cash"),
    [state.holdings]
  );
  const cashHoldings = useMemo(
    () => state.holdings.filter((holding) => holding.type === "cash"),
    [state.holdings]
  );
  const defaultTradeHolding = tradeHoldings[0];
  const defaultCashHolding = cashHoldings.find((holding) =>
    holding.currency === defaultTradeHolding?.currency &&
    accountName(holding.account) === accountName(defaultTradeHolding?.account)
  ) ?? cashHoldings.find((holding) => holding.currency === defaultTradeHolding?.currency) ?? cashHoldings[0];
  const [symbol, setSymbol] = useState("");
  const [amount, setAmount] = useState(0);
  const [currency, setCurrency] = useState<Currency>(defaultTradeHolding?.currency ?? "TWD");
  const [fxRate, setFxRate] = useState(defaultTradeHolding?.currency === "USD" ? state.usdTwd : 1);
  const [quantity, setQuantity] = useState(0);
  const [price, setPrice] = useState(0);
  const [fee, setFee] = useState(0);
  const [tax, setTax] = useState(0);
  const [tradeHoldingId, setTradeHoldingId] = useState(defaultTradeHolding?.id ?? "");
  const [tradeCashHoldingId, setTradeCashHoldingId] = useState(defaultCashHolding?.id ?? "");
  const [cashHoldingId, setCashHoldingId] = useState(defaultCashHolding?.id ?? "");
  const [corporateHoldingId, setCorporateHoldingId] = useState(defaultTradeHolding?.id ?? "");
  const [shareRatio, setShareRatio] = useState(1);
  const [note, setNote] = useState("");
  const [preFlowValueTwd, setPreFlowValueTwd] = useState<number | null>(null);
  const [boundaryMode, setBoundaryMode] = useState<"auto" | "manual">("auto");
  const closeRef = useRef<HTMLButtonElement>(null);

  const external = isExternalActivityType(type);
  const trade = isTradeActivityType(type);
  const corporate = type === "corporate_action";
  const selectedHolding = tradeHoldings.find((holding) => holding.id === tradeHoldingId) ?? null;
  const selectedTradeCash = cashHoldings.find((holding) => holding.id === tradeCashHoldingId) ?? null;
  const selectedCash = cashHoldings.find((holding) => holding.id === cashHoldingId) ?? null;
  const selectedCorporateHolding = tradeHoldings.find((holding) => holding.id === corporateHoldingId) ?? null;
  const compatibleTradeCash = selectedHolding
    ? cashHoldings.filter((holding) => holding.currency === selectedHolding.currency)
    : [];
  const tradeGross = quantity * price;
  const tradeNet = type === "sell" ? tradeGross - fee - tax : tradeGross + fee + tax;
  const cashOnlyDebit = type === "withdrawal" || type === "fee";
  const tradeCashSufficient = type !== "buy" || (selectedTradeCash !== null && tradeNet <= selectedTradeCash.price + 1e-9);
  const cashOnlySufficient = !cashOnlyDebit || (selectedCash !== null && amount <= selectedCash.price + 1e-9);
  const currentPortfolioValueTwd = portfolioSummary(state.holdings, state.usdTwd).total;
  const boundaryValid = !external ||
    (boundaryMode === "auto"
      ? date === today
      : preFlowValueTwd === null || (Number.isFinite(preFlowValueTwd) && preFlowValueTwd >= 0));
  const valid = Boolean(date) &&
    date <= today &&
    fxRate > 0 &&
    boundaryValid &&
    (trade
      ? Boolean(selectedHolding) &&
        Boolean(selectedTradeCash) &&
        selectedTradeCash?.currency === selectedHolding?.currency &&
        date === today &&
        quantity > 0 &&
        price > 0 &&
        fee >= 0 &&
        tax >= 0 &&
        tradeCashSufficient &&
        (type !== "sell" || (selectedHolding !== null && quantity <= selectedHolding.quantity && tradeNet > 0))
      : corporate
        ? Boolean(selectedCorporateHolding) &&
          date === today &&
          Number.isFinite(shareRatio) &&
          shareRatio > 0 &&
          Math.abs(shareRatio - 1) > 1e-12
        : Boolean(selectedCash) && amount > 0 && cashOnlySufficient);

  function changeType(nextType: ActivityType) {
    setType(nextType);

    if (isExternalActivityType(nextType)) {
      setSymbol("");
      setQuantity(0);
      setPrice(0);
      setBoundaryMode(date === today ? "auto" : "manual");
      return;
    }

    setTime("");
    setPreFlowValueTwd(null);

    if (nextType === "corporate_action") {
      setQuantity(0);
      setPrice(0);
      setFee(0);
      setTax(0);
      setAmount(0);
      const current = tradeHoldings.find((holding) => holding.id === corporateHoldingId) ?? tradeHoldings[0];
      if (current) {
        setCorporateHoldingId(current.id);
        setCurrency(current.currency);
        setFxRate(current.currency === "USD" ? state.usdTwd : 1);
      }
      return;
    }

    if (!isTradeActivityType(nextType)) {
      setQuantity(0);
      setPrice(0);
      setFee(0);
      setTax(0);
      const currentCash = cashHoldings.find((holding) => holding.id === cashHoldingId) ?? cashHoldings[0];
      if (currentCash) {
        setCashHoldingId(currentCash.id);
        setCurrency(currentCash.currency);
        setFxRate(currentCash.currency === "USD" ? state.usdTwd : 1);
      }
    } else {
      const current = tradeHoldings.find((holding) => holding.id === tradeHoldingId) ?? tradeHoldings[0];
      if (current) {
        setTradeHoldingId(current.id);
        setCurrency(current.currency);
        setFxRate(current.currency === "USD" ? state.usdTwd : 1);
        const preferredCash =
          cashHoldings.find((holding) =>
            holding.currency === current.currency &&
            accountName(holding.account) === accountName(current.account)
          ) ?? cashHoldings.find((holding) => holding.currency === current.currency);
        setTradeCashHoldingId(preferredCash?.id ?? "");
      }
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid) return;

    if (trade) {
      if (!selectedHolding) return;
      const saved = onSaveTrade({
        id: nextActivityId(state.activities, date),
        date,
        type,
        holdingId: selectedHolding.id,
        cashHoldingId: selectedTradeCash!.id,
        quantity,
        price,
        fee,
        tax,
        fxRate: selectedHolding.currency === "USD" ? fxRate : 1,
        note
      });
      if (!saved) return;
      closeRef.current?.click();
      return;
    }

    if (corporate) {
      if (!selectedCorporateHolding) return;
      const saved = onSaveCorporateAction({
        id: nextActivityId(state.activities, date),
        date,
        holdingId: selectedCorporateHolding.id,
        ratio: shareRatio,
        note
      });
      if (!saved) return;
      closeRef.current?.click();
      return;
    }

    if (!selectedCash) return;
    const saved = onSaveCash({
      id: nextActivityId(state.activities, date),
      date,
      type: type as "deposit" | "withdrawal" | "dividend" | "fee",
      cashHoldingId: selectedCash.id,
      amount,
      fxRate: selectedCash.currency === "USD" ? fxRate : 1,
      symbol: external ? "" : symbol,
      note,
      ...(external && boundaryMode === "auto" && date === today
        ? {
            time: localTimeKey(),
            capturePreFlowFromCurrentState: true
          }
        : {
            ...(external && time ? { time } : {}),
            ...(external && preFlowValueTwd !== null ? { preFlowValueTwd } : {})
          })
    });
    if (!saved) return;
    closeRef.current?.click();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <select className="field" value={type} onChange={(event) => changeType(event.target.value as ActivityType)}>
          {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <input
          className="field"
          type="date"
          max={today}
          value={date}
          onChange={(event) => {
            const nextDate = event.target.value;
            setDate(nextDate);
            if (nextDate !== today) setBoundaryMode("manual");
          }}
        />
      </div>

      {date > today ? <p className="px-1 text-xs text-[#8b6538] dark:text-[#e0bd8c]">不能新增未來日期的交易／現金流；請改成實際發生日。</p> : null}

      {trade ? (
        <div>
          <select
            className="field"
            value={tradeHoldingId}
            onChange={(event) => {
              const nextId = event.target.value;
              setTradeHoldingId(nextId);
              const next = tradeHoldings.find((holding) => holding.id === nextId);
              if (next) {
                setCurrency(next.currency);
                setFxRate(next.currency === "USD" ? state.usdTwd : 1);
                const preferredCash =
                  cashHoldings.find((holding) =>
                    holding.currency === next.currency &&
                    accountName(holding.account) === accountName(next.account)
                  ) ?? cashHoldings.find((holding) => holding.currency === next.currency);
                setTradeCashHoldingId(preferredCash?.id ?? "");
              }
            }}
          >
            <option value="">選擇要套用的既有持股</option>
            {tradeHoldings.map((holding) => (
              <option key={holding.id} value={holding.id}>
                {holding.symbol} · {holding.name} · {accountName(holding.account)} · 持有 {holding.quantity}
              </option>
            ))}
          </select>
          {!tradeHoldings.length ? (
            <p className="mt-2 px-1 text-xs text-[#8b6538] dark:text-[#e0bd8c]">目前沒有可連動的投資部位。請先到「持股」建立部位，再記錄新式連動交易。</p>
          ) : null}
          <select
            className="field mt-3"
            value={tradeCashHoldingId}
            onChange={(event) => setTradeCashHoldingId(event.target.value)}
          >
            <option value="">選擇交易使用的 {selectedHolding?.currency ?? ""} 現金帳戶</option>
            {compatibleTradeCash.map((holding) => (
              <option key={holding.id} value={holding.id}>
                {accountName(holding.account)} · {holding.currency} {holding.price.toLocaleString()}
              </option>
            ))}
          </select>
          {selectedHolding && !compatibleTradeCash.length ? (
            <p className="mt-2 px-1 text-xs text-[#8b6538] dark:text-[#e0bd8c]">
              沒有 {selectedHolding.currency} 現金部位。請先到「持股」建立對應幣別的現金帳戶。
            </p>
          ) : null}
          <p className="mt-2 px-1 text-[11px] leading-5 text-black/38 dark:text-white/38">
            V0.56 會讓證券與現金在同一次操作中一起更新；買進現金不足時直接拒絕。舊交易不會被回溯重播。
          </p>
        </div>
      ) : corporate ? (
        <div>
          <select
            className="field"
            value={corporateHoldingId}
            onChange={(event) => {
              const nextId = event.target.value;
              setCorporateHoldingId(nextId);
              const next = tradeHoldings.find((holding) => holding.id === nextId);
              if (next) {
                setCurrency(next.currency);
                setFxRate(next.currency === "USD" ? state.usdTwd : 1);
              }
            }}
          >
            <option value="">選擇要套用股數調整的既有持股</option>
            {tradeHoldings.map((holding) => (
              <option key={holding.id} value={holding.id}>
                {holding.symbol} · {holding.name} · {accountName(holding.account)} · 持有 {holding.quantity}
              </option>
            ))}
          </select>
          <p className="mt-2 px-1 text-[11px] leading-5 text-black/38 dark:text-white/38">
            只用於非現金比例式調整，例如 1 拆 2、5 併 1、10% 股票股利。現金增資／認購不屬於此類。
          </p>
        </div>
      ) : (
        <div>
          <select
            className="field"
            value={cashHoldingId}
            onChange={(event) => {
              const nextId = event.target.value;
              setCashHoldingId(nextId);
              const next = cashHoldings.find((holding) => holding.id === nextId);
              if (next) {
                setCurrency(next.currency);
                setFxRate(next.currency === "USD" ? state.usdTwd : 1);
              }
            }}
          >
            <option value="">選擇要連動的現金帳戶</option>
            {cashHoldings.map((holding) => (
              <option key={holding.id} value={holding.id}>
                {accountName(holding.account)} · {holding.currency} {holding.price.toLocaleString()}
              </option>
            ))}
          </select>
          {!cashHoldings.length ? (
            <p className="mt-2 px-1 text-xs text-[#8b6538] dark:text-[#e0bd8c]">
              目前沒有現金部位。請先到「持股」新增 TWD 或 USD 現金，再記錄現金流、股息或費用。
            </p>
          ) : null}
        </div>
      )}

      {external ? (
        <div className="rounded-2xl border border-black/6 bg-black/[.018] p-3.5 dark:border-white/8 dark:bg-white/[.025]">
          <p className="text-sm font-semibold">Exact TWR 邊界</p>
          <p className="mt-1 text-xs leading-5 text-black/45 dark:text-white/45">
            邊界是入金／出金發生前一刻的整體投資組合淨值，不是現金流金額。當下事件可由系統在寫入前自動擷取；歷史補登不可拿目前淨值代替。
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={date !== today}
              className={`min-h-10 rounded-xl border px-3 text-xs font-semibold ${boundaryMode === "auto" ? "border-[#1f332a] bg-[#edf2ee] dark:border-[#dce9e2] dark:bg-[#17201b]" : "border-black/7 dark:border-white/9"} disabled:cursor-not-allowed disabled:opacity-40`}
              onClick={() => setBoundaryMode("auto")}
            >
              現在發生 · 自動擷取
            </button>
            <button
              type="button"
              className={`min-h-10 rounded-xl border px-3 text-xs font-semibold ${boundaryMode === "manual" ? "border-[#1f332a] bg-[#edf2ee] dark:border-[#dce9e2] dark:bg-[#17201b]" : "border-black/7 dark:border-white/9"}`}
              onClick={() => setBoundaryMode("manual")}
            >
              歷史補登 · 手動
            </button>
          </div>

          {boundaryMode === "auto" && date === today ? (
            <div className="mt-3 rounded-xl border border-black/6 bg-white/60 p-3 text-xs leading-5 dark:border-white/8 dark:bg-white/[.035]">
              <div className="flex items-center justify-between gap-3">
                <span className="text-black/48 dark:text-white/48">目前 PortfolioPilot 淨值</span>
                <strong>{money(currentPortfolioValueTwd)}</strong>
              </div>
              <p className="mt-1 text-black/38 dark:text-white/38">
                送出時會重新擷取現金變動前的淨值並自動保存事件時間；現金異動本身不會被算進 pre-flow 邊界。
              </p>
            </div>
          ) : (
            <>
              <div className="mt-3 grid grid-cols-[120px_1fr] gap-3">
                <input className="field" type="time" value={time} onChange={(event) => setTime(event.target.value)} aria-label="現金流時間" />
                <input
                  className="field"
                  type="number"
                  min="0"
                  step="any"
                  placeholder="現金流前總淨值（TWD）"
                  value={preFlowValueTwd ?? ""}
                  onChange={(event) => setPreFlowValueTwd(event.target.value === "" ? null : Number(event.target.value))}
                />
              </div>
              <p className="mt-2 text-[11px] leading-5 text-black/38 dark:text-white/38">
                歷史資料只接受你能確認的當時邊界；不確定可留白，Exact TWR 會維持資料不足而不是猜值。同一天多筆入出金請填不同時間。
              </p>
            </>
          )}
        </div>
      ) : null}

      {!trade && !corporate ? (
        <div className="grid grid-cols-[1fr_120px] gap-3">
          <input className="field" type="number" min="0" step="any" placeholder="金額" value={amount || ""} onChange={(event) => setAmount(Number(event.target.value))} />
          <select className="field" value={currency} disabled>
            <option value="TWD">TWD</option>
            <option value="USD">USD</option>
          </select>
        </div>
      ) : null}

      {currency === "USD" && !corporate ? (
        <div>
          <input
            className="field"
            type="number"
            min="0.0001"
            step="0.01"
            placeholder="當日 USD/TWD 匯率"
            value={external && boundaryMode === "auto" ? state.usdTwd : (fxRate || "")}
            disabled={external && boundaryMode === "auto"}
            onChange={(event) => setFxRate(Number(event.target.value))}
          />
          {external && boundaryMode === "auto" ? (
            <p className="mt-2 px-1 text-[11px] leading-5 text-black/38 dark:text-white/38">
              自動 TWR 邊界使用目前 PortfolioPilot USD/TWD {state.usdTwd.toFixed(2)}，確保 pre-flow、現金流與寫入後估值使用同一匯率基準。
            </p>
          ) : null}
        </div>
      ) : null}

      {!external && !trade && !corporate ? (
        <input
          className="field"
          placeholder="股票代號（選填）"
          value={symbol}
          onChange={(event) => setSymbol(event.target.value)}
        />
      ) : null}

      {trade ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input className="field" type="number" min="0" step="any" placeholder="成交數量" value={quantity || ""} onChange={(event) => setQuantity(Number(event.target.value))} />
            <input className="field" type="number" min="0" step="any" placeholder="成交價" value={price || ""} onChange={(event) => setPrice(Number(event.target.value))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input className="field" type="number" min="0" step="any" placeholder="手續費" value={fee || ""} onChange={(event) => setFee(Number(event.target.value))} />
            <input className="field" type="number" min="0" step="any" placeholder="交易稅／其他交易稅費" value={tax || ""} onChange={(event) => setTax(Number(event.target.value))} />
          </div>
          <div className="rounded-2xl border border-black/6 bg-black/[.018] p-3 text-xs leading-5 text-black/48 dark:border-white/8 dark:bg-white/[.025] dark:text-white/48">
            <div className="flex justify-between gap-3"><span>成交總額</span><strong>{selectedHolding?.currency ?? currency} {Number.isFinite(tradeGross) ? tradeGross.toLocaleString() : "—"}</strong></div>
            <div className="mt-1 flex justify-between gap-3"><span>{type === "sell" ? "扣除費稅後淨收入" : "含費稅總支出"}</span><strong>{selectedHolding?.currency ?? currency} {Number.isFinite(tradeNet) ? tradeNet.toLocaleString() : "—"}</strong></div>
            {selectedTradeCash ? (
              <div className="mt-1 flex justify-between gap-3">
                <span>現金餘額</span>
                <strong>
                  {selectedTradeCash.price.toLocaleString()} → {(selectedTradeCash.price + (type === "buy" ? -tradeNet : tradeNet)).toLocaleString()}
                </strong>
              </div>
            ) : null}
            {type === "buy" && selectedTradeCash && tradeNet > selectedTradeCash.price + 1e-9 ? (
              <p className="mt-2 text-[#8b6538] dark:text-[#e0bd8c]">現金不足，這筆買進不會寫入任何資料。</p>
            ) : null}
            {type === "sell" && selectedHolding && quantity > selectedHolding.quantity ? (
              <p className="mt-2 text-[#8b6538] dark:text-[#e0bd8c]">賣出數量不可超過目前持有 {selectedHolding.quantity}。</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {corporate ? (
        <div className="space-y-3">
          <input
            className="field"
            type="number"
            min="0.000001"
            step="any"
            placeholder="股數倍率，例如 2、0.2、1.1"
            value={shareRatio || ""}
            onChange={(event) => setShareRatio(Number(event.target.value))}
          />
          <div className="rounded-2xl border border-black/6 bg-black/[.018] p-3 text-xs leading-5 text-black/48 dark:border-white/8 dark:bg-white/[.025] dark:text-white/48">
            <p>2 = 1 拆 2 · 0.2 = 5 併 1 · 1.1 = 股數增加 10%</p>
            {selectedCorporateHolding && shareRatio > 0 ? (
              <div className="mt-2 space-y-1">
                <div className="flex justify-between gap-3"><span>股數</span><strong>{selectedCorporateHolding.quantity.toLocaleString()} → {(selectedCorporateHolding.quantity * shareRatio).toLocaleString()}</strong></div>
                <div className="flex justify-between gap-3"><span>平均成本</span><strong>{selectedCorporateHolding.averageCost.toLocaleString()} → {(selectedCorporateHolding.averageCost / shareRatio).toLocaleString()}</strong></div>
                <p className="mt-2">總成本基礎維持不變；目前市價與官方來源不會被此事件覆寫。</p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {!trade && !corporate && selectedCash ? (
        <div className="rounded-2xl border border-black/6 bg-black/[.018] p-3 text-xs leading-5 text-black/48 dark:border-white/8 dark:bg-white/[.025] dark:text-white/48">
          <div className="flex justify-between gap-3">
            <span>現金餘額</span>
            <strong>
              {selectedCash.currency} {selectedCash.price.toLocaleString()} → {(selectedCash.price + ((type === "deposit" || type === "dividend") ? amount : -amount)).toLocaleString()}
            </strong>
          </div>
          {cashOnlyDebit && amount > selectedCash.price + 1e-9 ? (
            <p className="mt-2 text-[#8b6538] dark:text-[#e0bd8c]">現金不足，這筆紀錄不會寫入。</p>
          ) : null}
        </div>
      ) : null}

      <textarea className="field resize-none" rows={3} placeholder="備註（選填）" value={note} onChange={(event) => setNote(event.target.value)} />

      <p className="text-xs leading-5 text-black/40 dark:text-white/40">
        V0.58 起，今天實際發生的入出金可在寫入現金前自動擷取 Exact TWR pre-flow 淨值；歷史補登仍必須使用當時可確認的手動邊界。交易、股息、費用與入出金持續同步更新指定現金帳戶。
      </p>

      <Button type="submit" disabled={!valid} className="w-full"><Plus size={16} />新增紀錄</Button>
      <Dialog.Close asChild>
        <button ref={closeRef} type="button" className="hidden" aria-hidden="true" tabIndex={-1} />
      </Dialog.Close>
    </form>
  );
}

function BoundaryForm({ activity, onSave }: { activity: PortfolioActivity; onSave: (activity: PortfolioActivity) => boolean }) {
  const [time, setTime] = useState(activity.time ?? "");
  const [preFlowValueTwd, setPreFlowValueTwd] = useState<number | null>(activity.preFlowValueTwd ?? null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const valid = preFlowValueTwd !== null && Number.isFinite(preFlowValueTwd) && preFlowValueTwd >= 0;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid || preFlowValueTwd === null) return;
    const saved = onSave({
      ...activity,
      ...(time ? { time } : { time: undefined }),
      preFlowValueTwd,
      preFlowValueSource: "manual"
    });
    if (!saved) return;
    closeRef.current?.click();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-sm leading-6 text-black/50 dark:text-white/50">
        補的是這筆{labels[activity.type]}發生前一刻的整體投資組合淨值。若同日有多筆外部現金流，請填不同時間。
      </p>
      <div className="grid grid-cols-[120px_1fr] gap-3">
        <input className="field" type="time" value={time} onChange={(event) => setTime(event.target.value)} aria-label="現金流時間" />
        <input className="field" type="number" min="0" step="any" placeholder="現金流前總淨值（TWD）" value={preFlowValueTwd ?? ""} onChange={(event) => setPreFlowValueTwd(event.target.value === "" ? null : Number(event.target.value))} />
      </div>
      <Button type="submit" disabled={!valid} className="w-full">儲存 TWR 邊界</Button>
      <Dialog.Close asChild>
        <button ref={closeRef} type="button" className="hidden" aria-hidden="true" tabIndex={-1} />
      </Dialog.Close>
    </form>
  );
}

export function ActivityLedger({ state, onChange }: { state: AppState; onChange: (state: AppState) => boolean }) {
  const [filter, setFilter] = useState<"all" | "cash" | "trade" | "income">("all");
  const [accountFilter, setAccountFilter] = useState("all");

  const accounts = useMemo(() => [...new Set([
    ...state.holdings.map((holding) => accountName(holding.account)),
    ...state.activities.map((activity) => accountName(activity.account))
  ])].sort((a, b) => a.localeCompare(b, "zh-Hant")), [state.activities, state.holdings]);

  const activities = useMemo(() => {
    return [...state.activities]
      .filter((activity) => accountFilter === "all" || accountName(activity.account) === accountFilter)
      .filter((activity) => {
        if (filter === "cash") return activity.type === "deposit" || activity.type === "withdrawal";
        if (filter === "trade") return activity.type === "buy" || activity.type === "sell" || activity.type === "corporate_action";
        if (filter === "income") return activity.type === "dividend" || activity.type === "fee";
        return true;
      })
      .sort((a, b) =>
        b.date.localeCompare(a.date) ||
        (b.time ?? "").localeCompare(a.time ?? "") ||
        b.id.localeCompare(a.id)
      );
  }, [accountFilter, filter, state.activities]);

  function addCashActivity(input: CashLinkedActivityInput) {
    try {
      const next = applyCashLinkedActivity(state, input);
      if (!onChange(next)) return false;
      toast.success("紀錄已新增，現金帳戶已同步更新");
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "無法安全更新現金帳戶");
      return false;
    }
  }

  function addManagedTrade(input: ManagedTradeInput) {
    try {
      const next = applyManagedTrade(state, input);
      if (!onChange(next)) return false;
      toast.success(input.type === "buy" ? "買進已記錄並更新持股" : "賣出已記錄並更新持股");
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "無法安全套用交易");
      return false;
    }
  }

  function addOpeningPosition(input: NewPositionBuyInput) {
    try {
      const next = applyOpeningBuy(state, input);
      if (!onChange(next)) return false;
      toast.success(`${input.position.symbol.toUpperCase()} 已建立並完成首次買進`);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "無法安全建立新持股");
      return false;
    }
  }

  function addCorporateAction(input: ShareAdjustmentInput) {
    try {
      const next = applyShareAdjustment(state, input);
      if (!onChange(next)) return false;
      toast.success("股數調整已記錄並更新持股");
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "無法安全套用股數調整");
      return false;
    }
  }

  const realizedPnlTwd = useMemo(
    () => realizedManagedTradePnlTwd(state.activities),
    [state.activities]
  );

  function updateBoundary(activity: PortfolioActivity) {
    const saved = onChange({
      ...state,
      activities: state.activities.map((item) => item.id === activity.id ? activity : item)
    });
    if (!saved) return false;
    toast.success("TWR 邊界已更新");
    return true;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <div className="inline-flex rounded-2xl border border-black/6 bg-white/70 p-1 dark:border-white/8 dark:bg-white/4">
            {[
              ["all", "全部"],
              ["cash", "入出金"],
              ["trade", "交易/股數調整"],
              ["income", "股息/費用"]
            ].map(([key, label]) => (
              <button key={key} onClick={() => setFilter(key as typeof filter)} className={`min-h-10 rounded-xl px-3 text-sm font-semibold transition ${filter === key ? "bg-[#1f332a] text-white dark:bg-[#dce9e2] dark:text-[#122018]" : "text-black/50 dark:text-white/50"}`}>
                {label}
              </button>
            ))}
          </div>
          {accounts.length > 1 ? <select className="field min-w-[160px]" value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)}>
            <option value="all">全部帳戶</option>
            {accounts.map((name) => <option key={name} value={name}>{name}</option>)}
          </select> : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Modal title="首次買進新標的" trigger={<GhostButton><Plus size={16} />首次買進</GhostButton>}>
            <OpeningBuyForm state={state} onSave={addOpeningPosition} />
          </Modal>
          <Modal title="新增交易／現金流" trigger={<Button><Plus size={16} />新增紀錄</Button>}>
            <ActivityForm state={state} onSaveCash={addCashActivity} onSaveTrade={addManagedTrade} onSaveCorporateAction={addCorporateAction} />
          </Modal>
        </div>
      </div>

      {state.activities.some((activity) => activity.inventoryImpact?.kind === "trade" && activity.type === "sell") ? (
        <div className="rounded-2xl border border-black/6 bg-[#edf2ee] px-4 py-3 text-sm dark:border-white/8 dark:bg-[#17201b]">
          <span className="text-black/48 dark:text-white/48">V0.54 持股連動交易累積已實現損益：</span>
          <strong className="ml-2 tabular-nums">{money(realizedPnlTwd)}</strong>
          <span className="ml-2 text-xs text-black/38 dark:text-white/38">（平均成本法，依各筆交易保存的歷史 FX 換算）</span>
        </div>
      ) : null}

      <div className="grid gap-3">
        {activities.map((activity) => {
          const Icon = icons[activity.type];
          const twd = activityAmountTwd(activity);
          const external = isExternalActivityType(activity.type);
          const trade = isTradeActivityType(activity.type);
          const corporate = activity.type === "corporate_action";

          return (
            <Card key={activity.id}>
              <CardContent className="p-4 md:p-5">
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-black/[.04] dark:bg-white/[.06]">
                    <Icon size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{labels[activity.type]}</p>
                      {!external && activity.symbol ? <span className="text-xs text-black/40 dark:text-white/40">{activity.symbol}</span> : null}
                      <Badge>{accountName(activity.account)}</Badge>
                      {external ? <Badge tone="good">外部現金流</Badge> : <Badge>內部紀錄</Badge>}
                      {activity.inventoryImpact ? <Badge tone="good">已套用持股</Badge> : null}
                      {activity.cashImpact ? <Badge tone="good">已連動現金</Badge> : null}
                      {external ? (activity.preFlowValueTwd !== undefined ? (
                        <Badge tone="good">
                          {activity.preFlowValueSource === "system_current_state"
                            ? "TWR 邊界・系統"
                            : activity.preFlowValueSource === "manual"
                              ? "TWR 邊界・手動"
                              : "TWR 邊界已記"}
                        </Badge>
                      ) : <Badge tone="warn">缺 TWR 邊界</Badge>) : null}
                    </div>
                    <p className="mt-1 text-xs text-black/40 dark:text-white/40">{activity.date}{activity.time ? ` · ${activity.time}` : ""}</p>
                    <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      {corporate ? (
                        <p className="text-sm font-semibold">非現金股數調整</p>
                      ) : (
                        <>
                          <p className="text-lg font-semibold tabular-nums">{activity.currency} {activity.amount.toLocaleString()}</p>
                          {activity.currency === "USD" ? <span className="text-xs text-black/40 dark:text-white/40">≈ {money(twd)}</span> : null}
                        </>
                      )}
                    </div>
                    {trade && (activity.quantity > 0 || activity.price > 0) ? <p className="mt-2 text-xs text-black/45 dark:text-white/45">數量 {activity.quantity || "—"} · 成交價 {activity.price || "—"}</p> : null}
                    {activity.inventoryImpact?.kind === "trade" ? (
                      <p className="mt-1 text-xs text-black/45 dark:text-white/45">
                        手續費 {activity.currency} {activity.inventoryImpact.fee.toLocaleString()} · 交易稅 {activity.currency} {activity.inventoryImpact.tax.toLocaleString()}
                        {activity.type === "sell" ? ` · 已實現損益 ${activity.currency} ${activity.inventoryImpact.realizedPnl.toLocaleString()}` : ""}
                      </p>
                    ) : null}
                    {activity.inventoryImpact?.kind === "corporate_action" ? (
                      <p className="mt-2 text-xs text-black/45 dark:text-white/45">
                        股數倍率 ×{activity.inventoryImpact.ratio.toLocaleString()} · 股數 {activity.inventoryImpact.before.quantity.toLocaleString()} → {activity.inventoryImpact.after.quantity.toLocaleString()} · 平均成本 {activity.inventoryImpact.before.averageCost.toLocaleString()} → {activity.inventoryImpact.after.averageCost.toLocaleString()}
                      </p>
                    ) : null}
                    {activity.cashImpact ? (
                      <p className="mt-1 text-xs text-black/45 dark:text-white/45">
                        {accountName(activity.cashImpact.before.account)} · 現金 {activity.cashImpact.delta > 0 ? "+" : ""}{activity.cashImpact.delta.toLocaleString()} · {activity.cashImpact.before.price.toLocaleString()} → {(activity.cashImpact.after?.price ?? 0).toLocaleString()}
                      </p>
                    ) : null}
                    {external && activity.preFlowValueTwd !== undefined ? (
                      <p className="mt-2 text-xs text-black/45 dark:text-white/45">
                        現金流前淨值：{money(activity.preFlowValueTwd)}
                        {activity.preFlowValueSource === "system_current_state"
                          ? " · 系統於事件寫入前擷取"
                          : activity.preFlowValueSource === "manual"
                            ? " · 手動輸入"
                            : ""}
                      </p>
                    ) : null}
                    {activity.note ? <p className="mt-2 text-sm leading-6 text-black/55 dark:text-white/55">{activity.note}</p> : null}
                  </div>
                  <div className="flex shrink-0 flex-col gap-2">
                    {external ? (
                      <Modal
                        title={activity.preFlowValueTwd === undefined ? "補 TWR 邊界" : "修改 TWR 邊界"}
                        trigger={<GhostButton className="h-10 min-h-10 w-10 px-0" aria-label={activity.preFlowValueTwd === undefined ? "補 TWR 邊界" : "修改 TWR 邊界"}><Pencil size={15} /></GhostButton>}
                      >
                        <BoundaryForm activity={activity} onSave={updateBoundary} />
                      </Modal>
                    ) : null}
                    <GhostButton
                      className="h-10 min-h-10 w-10 px-0"
                      aria-label="刪除紀錄"
                      onClick={() => {
                        if (activity.inventoryImpact?.kind === "corporate_action") {
                          if (!window.confirm("這筆股數調整已套用到持股。刪除時會嘗試精確還原事件前庫存；若後續交易或手動修改使資料不一致，系統會拒絕回滾。確定繼續？")) return;
                          try {
                            const next = revertCorporateAction(state, activity.id);
                            if (!onChange(next)) return;
                            toast.success("股數調整已刪除，持股已還原");
                          } catch (error) {
                            toast.error(error instanceof Error ? error.message : "無法安全回滾股數調整");
                          }
                          return;
                        }

                        if (activity.inventoryImpact?.kind === "trade") {
                          if (!window.confirm("這筆交易已套用到持股。刪除時系統會嘗試精確還原交易前庫存；若後續交易或手動修改使資料不再一致，系統會拒絕回滾。確定繼續？")) return;
                          try {
                            const next = revertManagedTrade(state, activity.id);
                            if (!onChange(next)) return;
                            toast.success("交易已刪除，持股已還原");
                          } catch (error) {
                            toast.error(error instanceof Error ? error.message : "無法安全回滾交易");
                          }
                          return;
                        }

                        if (activity.cashImpact) {
                          if (!window.confirm("這筆紀錄已連動現金帳戶。刪除時會嘗試精確還原現金餘額；若後續事件或手動修改使資料不一致，系統會拒絕回滾。確定繼續？")) return;
                          try {
                            const next = revertCashLinkedActivity(state, activity.id);
                            if (!onChange(next)) return;
                            toast.success("紀錄已刪除，現金餘額已還原");
                          } catch (error) {
                            toast.error(error instanceof Error ? error.message : "無法安全回滾現金事件");
                          }
                          return;
                        }

                        if (!window.confirm("刪除這筆舊版交易／現金流紀錄？")) return;
                        if (!onChange({ ...state, activities: state.activities.filter((item) => item.id !== activity.id) })) return;
                        toast.success("紀錄已刪除");
                      }}
                    >
                      <Trash2 size={15} />
                    </GhostButton>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {!activities.length ? (
        <div className="py-14 text-center">
          <p className="text-sm text-black/40 dark:text-white/40">
            {state.activities.length ? "目前沒有符合篩選條件的交易／現金流紀錄。" : "目前尚未記錄任何交易／現金流。"}
          </p>
          {state.activities.length && (filter !== "all" || accountFilter !== "all") ? (
            <GhostButton className="mt-4" onClick={() => { setFilter("all"); setAccountFilter("all"); }}>
              清除篩選
            </GhostButton>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
