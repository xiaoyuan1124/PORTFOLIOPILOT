"use client";

import { useMemo, useState } from "react";
import { Calculator, Info, Wallet } from "lucide-react";
import type { AppState } from "@/lib/types";
import { simulateContributionOnlyPlan } from "@/lib/contribution-plan";
import { money } from "@/lib/utils";
import { Badge, Card, CardContent, InfoDisclosure } from "./ui";

const statusMessage = {
  buy: "可整股試算",
  cash_reserve: "台幣現金保留",
  no_gap: "已達目標或高於目標",
  no_price: "缺本機參考價格，無法試算股數",
  fx_required: "美元現金需要實際換匯，暫不分配",
  below_unit: "差額小於一股價格，暫不買入",
  out_of_budget: "剩餘預算不足，暫不買入"
} as const;

function BudgetRow({ row }: { row: ReturnType<typeof simulateContributionOnlyPlan>["rows"][number] }) {
  return (
    <div className="min-w-0 rounded-2xl border border-black/7 p-3 dark:border-white/8">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold">{row.label}</p>
          <p className="mt-1 text-xs text-black/45 dark:text-white/45">
            目前 {money(row.currentValueTwd)} · 目標 {row.targetPct.toFixed(1)}%
          </p>
        </div>
        <Badge tone={row.status === "buy" ? "good" : row.status === "no_price" || row.status === "fx_required" ? "warn" : "neutral"}>
          {statusMessage[row.status]}
        </Badge>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-black/[.025] p-3 dark:bg-white/[.035]">
          <span className="text-[11px] text-black/45 dark:text-white/45">離目標尚差</span>
          <strong className="mt-1 block text-sm tabular-nums">{money(row.missingValueTwd)}</strong>
        </div>
        <div className="rounded-xl bg-black/[.025] p-3 dark:bg-white/[.035]">
          <span className="text-[11px] text-black/45 dark:text-white/45">本次預計分配</span>
          <strong className="mt-1 block text-sm tabular-nums">{money(row.plannedTwd)}</strong>
        </div>
      </div>
      {row.status === "buy" ? (
        <p className="mt-2 text-xs leading-5">
          參考可買 <strong className="tabular-nums">{row.buyUnits.toLocaleString("zh-TW")} 股</strong>
          {row.estimatedUnitPriceTwd !== null ? ` · 本機參考每股 ${money(row.estimatedUnitPriceTwd)}` : ""}
        </p>
      ) : null}
      {row.status === "no_price" || row.status === "fx_required" || row.status === "below_unit" ? (
        <p className="mt-2 text-xs leading-5 text-black/45 dark:text-white/45">{statusMessage[row.status]}</p>
      ) : null}
    </div>
  );
}

export function ContributionPlanner({ state }: { state: AppState }) {
  const [budgetText, setBudgetText] = useState("10000");
  const budgetTwd = Number(budgetText);
  const targets = state.allocationTargets ?? [];
  const { plan, error } = useMemo(() => {
    if (!budgetText.trim() || !Number.isFinite(budgetTwd) || budgetTwd <= 0) {
      return { plan: null, error: "請輸入大於零的台幣投入金額。" };
    }
    if (!targets.length) return { plan: null, error: "請先設定配置目標，再進行每月投入試算。" };
    try {
      return {
        plan: simulateContributionOnlyPlan(targets, state.holdings, state.usdTwd, budgetTwd),
        error: ""
      };
    } catch (cause) {
      return { plan: null, error: cause instanceof Error ? cause.message : "投入試算資料不足。" };
    }
  }, [budgetText, budgetTwd, state.holdings, state.usdTwd, targets]);

  const needed = plan?.rows.filter((row) => row.missingValueTwd > 0) ?? [];
  const alreadyAtGoal = plan?.rows.filter((row) => row.missingValueTwd <= 0) ?? [];
  const limitations = needed.filter((row) => row.status === "no_price" || row.status === "fx_required");

  return (
    <Card>
      <CardContent>
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-[#e7f1e9] p-2 text-[#315f49] dark:bg-[#173426] dark:text-[#a9d7b7]">
            <Calculator size={20} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[.1em] text-black/45 dark:text-white/45">New-money allocation · 本機試算</p>
            <h3 className="mt-1 text-lg font-semibold">這個月投入多少？</h3>
            <p className="mt-1 text-xs leading-5 text-black/50 dark:text-white/50">
              依你的配置目標，優先計算比例不足的標的。只買不賣；僅供參考，不會建立交易或更改持股。
            </p>
          </div>
        </div>

        <label htmlFor="contribution-budget-twd" className="mt-4 block text-xs font-semibold">本月新增投入金額（TWD）</label>
        <div className="mt-2 flex items-center gap-2">
          <span className="shrink-0 text-sm text-black/50 dark:text-white/50">NT$</span>
          <input
            id="contribution-budget-twd"
            type="number"
            inputMode="decimal"
            min="1"
            max="1000000000000"
            step="100"
            value={budgetText}
            onChange={(event) => setBudgetText(event.target.value)}
            className="field min-h-11 min-w-0 w-full max-w-sm"
            placeholder="例如 10000"
          />
        </div>
        {error ? (
          <p role="status" className="mt-3 rounded-xl bg-black/[.025] p-3 text-xs text-black/55 dark:bg-white/[.035] dark:text-white/55">
            {error}
          </p>
        ) : null}

        {plan ? (
          <>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div className="rounded-xl bg-[#edf2ee] p-3 dark:bg-[#17201b]">
                <p className="text-[11px] text-black/50 dark:text-white/50">參考加碼合計</p>
                <strong className="mt-1 block text-base tabular-nums">{money(plan.plannedInvestmentTwd)}</strong>
              </div>
              <div className="rounded-xl border border-black/7 p-3 dark:border-white/8">
                <p className="text-[11px] text-black/50 dark:text-white/50">依目標留台幣現金</p>
                <strong className="mt-1 block text-base tabular-nums">{money(plan.reservedCashTwd)}</strong>
              </div>
              <div className="col-span-2 rounded-xl border border-black/7 p-3 dark:border-white/8 sm:col-span-1">
                <p className="text-[11px] text-black/50 dark:text-white/50">未配置、仍留台幣</p>
                <strong className="mt-1 block text-base tabular-nums">{money(plan.unallocatedTwd)}</strong>
              </div>
            </div>
            <p className="mt-3 text-xs leading-5 text-black/45 dark:text-white/45">
              投入預算分配為「加碼＋預留現金＋未配置」，不會重複計算。價格為本機紀錄，實際成交可能不同。
            </p>

            {limitations.length ? (
              <div role="status" className="mt-3 flex items-start gap-2 rounded-xl border border-[#b98b57]/25 bg-[#f8f1e8] p-3 text-xs leading-5 text-[#6f4c26] dark:bg-[#2a2117] dark:text-[#e0bd8c]">
                <Info size={15} className="mt-0.5 shrink-0" />
                <span>{limitations.length} 個目標因缺少本機價格或需要換匯，沒有憑空產生加碼股數。請先確認報價與幣別。</span>
              </div>
            ) : null}

            {needed.length ? (
              <div className="mt-4 space-y-2">
                <h4 className="text-sm font-semibold">低於目標的標的</h4>
                {needed.slice(0, 8).map((row) => <BudgetRow key={row.key} row={row} />)}
                {needed.length > 8 ? (
                  <details className="rounded-xl border border-black/7 p-3 dark:border-white/8">
                    <summary className="min-h-11 cursor-pointer text-xs font-semibold">展開其餘 {needed.length - 8} 個目標</summary>
                    <div className="mt-2 space-y-2">
                      {needed.slice(8).map((row) => <BudgetRow key={row.key} row={row} />)}
                    </div>
                  </details>
                ) : null}
              </div>
            ) : (
              <p className="mt-4 text-xs text-black/45 dark:text-white/45">
                目前各個有設定的目標都沒有需要補足的金額；本次新資金暫時保留現金。
              </p>
            )}

            {alreadyAtGoal.length ? (
              <InfoDisclosure summary={`查看 ${alreadyAtGoal.length} 項已達目標的標的`} className="mt-3">
                <div className="space-y-2">
                  {alreadyAtGoal.map((row) => <BudgetRow key={row.key} row={row} />)}
                </div>
              </InfoDisclosure>
            ) : null}

            <InfoDisclosure summary="試算與實際交易有哪些差異？" className="mt-3">
              <div className="flex items-start gap-2">
                <Wallet size={16} className="mt-0.5 shrink-0" />
                <p>
                  此功能只分配新增台幣預算，使用本機持股價格及手動參考匯率，保守採用整股試算；
                  不包含手續費、稅、即時報價、券商零股交易規則、實際換匯匯差，也不會自動下單。
                  未持有的目標若缺乏可靠價格，就明確標示不足，不使用猜測價格。
                </p>
              </div>
            </InfoDisclosure>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
