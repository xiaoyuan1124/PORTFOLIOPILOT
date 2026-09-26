"use client";

import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowDownCircle, ArrowUpCircle, Banknote, Plus, ReceiptText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { ActivityType, AppState, Currency, PortfolioActivity } from "@/lib/types";
import { localDateKey } from "@/lib/calc";
import { activityAmountTwd } from "@/lib/performance";
import { money } from "@/lib/utils";
import { Badge, Button, Card, CardContent, GhostButton, Modal } from "./ui";

const labels: Record<ActivityType, string> = {
  deposit: "入金",
  withdrawal: "出金",
  buy: "買進",
  sell: "賣出",
  dividend: "股息",
  fee: "費用"
};

const icons: Record<ActivityType, typeof Banknote> = {
  deposit: ArrowDownCircle,
  withdrawal: ArrowUpCircle,
  buy: Banknote,
  sell: Banknote,
  dividend: ReceiptText,
  fee: ReceiptText
};

function ActivityForm({ state, onSave }: { state: AppState; onSave: (activity: PortfolioActivity) => void }) {
  const [type, setType] = useState<ActivityType>("deposit");
  const [date, setDate] = useState(localDateKey());
  const [symbol, setSymbol] = useState("");
  const [amount, setAmount] = useState(0);
  const [currency, setCurrency] = useState<Currency>("TWD");
  const [fxRate, setFxRate] = useState(state.usdTwd);
  const [quantity, setQuantity] = useState(0);
  const [price, setPrice] = useState(0);
  const [note, setNote] = useState("");

  const valid = Boolean(date) && amount > 0 && fxRate > 0;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid) return;

    onSave({
      id: `activity-${Date.now()}`,
      date,
      type,
      symbol: symbol.trim().toUpperCase(),
      amount,
      currency,
      fxRate: currency === "USD" ? fxRate : 1,
      quantity,
      price,
      note: note.trim()
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <select className="field" value={type} onChange={(event) => setType(event.target.value as ActivityType)}>
          {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <input className="field" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      </div>

      <div className="grid grid-cols-[1fr_120px] gap-3">
        <input className="field" type="number" min="0" step="any" placeholder="金額" value={amount || ""} onChange={(event) => setAmount(Number(event.target.value))} />
        <select className="field" value={currency} onChange={(event) => setCurrency(event.target.value as Currency)}>
          <option value="TWD">TWD</option>
          <option value="USD">USD</option>
        </select>
      </div>

      {currency === "USD" ? (
        <input className="field" type="number" min="0.0001" step="0.01" placeholder="當日 USD/TWD 匯率" value={fxRate || ""} onChange={(event) => setFxRate(Number(event.target.value))} />
      ) : null}

      <input className="field" placeholder="股票代號（入金/出金可留空）" value={symbol} onChange={(event) => setSymbol(event.target.value)} />

      {(type === "buy" || type === "sell") ? (
        <div className="grid grid-cols-2 gap-3">
          <input className="field" type="number" min="0" step="any" placeholder="數量（選填）" value={quantity || ""} onChange={(event) => setQuantity(Number(event.target.value))} />
          <input className="field" type="number" min="0" step="any" placeholder="成交價（選填）" value={price || ""} onChange={(event) => setPrice(Number(event.target.value))} />
        </div>
      ) : null}

      <textarea className="field resize-none" rows={3} placeholder="備註（選填）" value={note} onChange={(event) => setNote(event.target.value)} />

      <p className="text-xs leading-5 text-black/40 dark:text-white/40">
        買進／賣出目前只做交易紀錄，不會自動改動持股；持股仍由「持股」頁維護，避免自動計算錯誤。
      </p>

      <Dialog.Close asChild>
        <Button type="submit" disabled={!valid} className="w-full"><Plus size={16} />新增紀錄</Button>
      </Dialog.Close>
    </form>
  );
}

export function ActivityLedger({ state, onChange }: { state: AppState; onChange: (state: AppState) => void }) {
  const [filter, setFilter] = useState<"all" | "cash" | "trade" | "income">("all");

  const activities = useMemo(() => {
    return [...state.activities]
      .filter((activity) => {
        if (filter === "cash") return activity.type === "deposit" || activity.type === "withdrawal";
        if (filter === "trade") return activity.type === "buy" || activity.type === "sell";
        if (filter === "income") return activity.type === "dividend" || activity.type === "fee";
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  }, [filter, state.activities]);

  function add(activity: PortfolioActivity) {
    onChange({ ...state, activities: [...state.activities, activity] });
    toast.success("交易／現金流已記錄");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-2xl border border-black/6 bg-white/70 p-1 dark:border-white/8 dark:bg-white/4">
          {[
            ["all", "全部"],
            ["cash", "入出金"],
            ["trade", "交易"],
            ["income", "股息/費用"]
          ].map(([key, label]) => (
            <button key={key} onClick={() => setFilter(key as typeof filter)} className={`min-h-10 rounded-xl px-3 text-sm font-semibold transition ${filter === key ? "bg-[#1f332a] text-white dark:bg-[#dce9e2] dark:text-[#122018]" : "text-black/50 dark:text-white/50"}`}>
              {label}
            </button>
          ))}
        </div>

        <Modal title="新增交易／現金流" trigger={<Button><Plus size={16} />新增紀錄</Button>}>
          <ActivityForm state={state} onSave={add} />
        </Modal>
      </div>

      <div className="grid gap-3">
        {activities.map((activity) => {
          const Icon = icons[activity.type];
          const twd = activityAmountTwd(activity);
          const external = activity.type === "deposit" || activity.type === "withdrawal";

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
                      {activity.symbol ? <span className="text-xs text-black/40 dark:text-white/40">{activity.symbol}</span> : null}
                      {external ? <Badge tone="good">外部現金流</Badge> : <Badge>內部紀錄</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-black/40 dark:text-white/40">{activity.date}</p>
                    <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <p className="text-lg font-semibold tabular-nums">{activity.currency} {activity.amount.toLocaleString()}</p>
                      {activity.currency === "USD" ? <span className="text-xs text-black/40 dark:text-white/40">≈ {money(twd)}</span> : null}
                    </div>
                    {(activity.quantity > 0 || activity.price > 0) ? <p className="mt-2 text-xs text-black/45 dark:text-white/45">數量 {activity.quantity || "—"} · 成交價 {activity.price || "—"}</p> : null}
                    {activity.note ? <p className="mt-2 text-sm leading-6 text-black/55 dark:text-white/55">{activity.note}</p> : null}
                  </div>
                  <GhostButton
                    className="h-10 min-h-10 w-10 shrink-0 px-0"
                    aria-label="刪除紀錄"
                    onClick={() => {
                      if (!window.confirm("刪除這筆交易／現金流紀錄？")) return;
                      onChange({ ...state, activities: state.activities.filter((item) => item.id !== activity.id) });
                      toast.success("紀錄已刪除");
                    }}
                  >
                    <Trash2 size={15} />
                  </GhostButton>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {!activities.length ? <p className="py-16 text-center text-sm text-black/40 dark:text-white/40">目前沒有符合條件的交易／現金流紀錄。</p> : null}
    </div>
  );
}
