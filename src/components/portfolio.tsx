"use client";

import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowDownUp, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { AppState, AssetType, Currency, Holding, Market } from "@/lib/types";
import { holdingCostTwd, holdingValueTwd, portfolioSummary } from "@/lib/calc";
import { money, percent } from "@/lib/utils";
import { Button, Card, CardContent, GhostButton, Modal } from "./ui";

const emptyHolding: Omit<Holding, "id"> = {
  symbol: "",
  name: "",
  market: "TW",
  type: "stock",
  quantity: 0,
  price: 0,
  averageCost: 0,
  currency: "TWD",
  sector: ""
};

function HoldingForm({ initial, onSave }: { initial?: Holding; onSave: (holding: Holding) => void }) {
  const [form, setForm] = useState<Omit<Holding, "id">>(initial ? {
    symbol: initial.symbol,
    name: initial.name,
    market: initial.market,
    type: initial.type,
    quantity: initial.quantity,
    price: initial.price,
    averageCost: initial.averageCost,
    currency: initial.currency,
    sector: initial.sector
  } : emptyHolding);

  const valid = form.name.trim() && form.symbol.trim() && form.quantity >= 0 && form.price >= 0 && form.averageCost >= 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    onSave({
      id: initial?.id ?? `h-${Date.now()}`,
      ...form,
      symbol: form.symbol.trim().toUpperCase(),
      name: form.name.trim(),
      sector: form.sector.trim() || "未分類"
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-[120px_1fr] gap-3">
        <input className="field" placeholder="代號" value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} />
        <input className="field" placeholder="名稱" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <select className="field" value={form.market} onChange={(e) => setForm({ ...form, market: e.target.value as Market })}>
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
        <input className="field" type="number" step="any" min="0" placeholder="目前價格" value={form.price || ""} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
        <input className="field" type="number" step="any" min="0" placeholder="平均成本" value={form.averageCost || ""} onChange={(e) => setForm({ ...form, averageCost: Number(e.target.value) })} />
      </div>
      <input className="field" placeholder="產業 / 類別" value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })} />
      <Dialog.Close asChild>
        <Button disabled={!valid} type="submit" className="w-full">{initial ? "儲存修改" : "新增部位"}</Button>
      </Dialog.Close>
    </form>
  );
}

type SortMode = "value" | "gain" | "name";

export function Portfolio({ state, onChange }: { state: AppState; onChange: (state: AppState) => void }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("value");
  const summary = portfolioSummary(state.holdings, state.usdTwd);

  const sorted = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = state.holdings.filter((holding) =>
      !needle || `${holding.symbol} ${holding.name} ${holding.sector}`.toLowerCase().includes(needle)
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
  }, [query, sort, state.holdings, state.usdTwd]);

  function upsert(holding: Holding) {
    const exists = state.holdings.some((item) => item.id === holding.id);
    onChange({
      ...state,
      holdings: exists ? state.holdings.map((item) => item.id === holding.id ? holding : item) : [...state.holdings, holding]
    });
    toast.success(exists ? "部位已更新" : "部位已新增");
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-black/45 dark:text-white/45">目前總淨值</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight">{money(summary.total)}</p>
        </div>
        <Modal title="新增投資部位" trigger={<Button><Plus size={16} />新增部位</Button>}>
          <HoldingForm onSave={upsert} />
        </Modal>
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_180px]">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-black/30 dark:text-white/30" size={17} />
          <input className="field pl-11" placeholder="搜尋代號、名稱、產業" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
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
                    </div>
                    <p className="mt-1 text-sm text-black/45 dark:text-white/45">{holding.sector} · {holding.market} · {holding.currency}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
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
      {!sorted.length ? <p className="py-16 text-center text-sm text-black/40 dark:text-white/40">{state.holdings.length ? "沒有符合搜尋條件的部位。" : "目前沒有持股，新增第一個部位開始追蹤。"}</p> : null}
    </div>
  );
}
