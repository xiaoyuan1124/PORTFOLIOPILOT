"use client";

import { CircleHelp, Coins, Landmark, TrendingUp, WalletCards } from "lucide-react";
import type { AppState } from "@/lib/types";
import { localDateKey, portfolioSummary } from "@/lib/calc";
import { incomeAfterFees, modifiedDietzReturn, netExternalContributions, portfolioXirr } from "@/lib/performance";
import { money, percent } from "@/lib/utils";
import { Card, CardContent, CardHeader, Metric } from "./ui";

export function Performance({ state }: { state: AppState }) {
  const summary = portfolioSummary(state.holdings, state.usdTwd);
  const contributions = netExternalContributions(state.activities);
  const income = incomeAfterFees(state.activities);
  const xirr = portfolioXirr(state, localDateKey());
  const dietz = modifiedDietzReturn(state);
  const externalCount = state.activities.filter((activity) => activity.type === "deposit" || activity.type === "withdrawal").length;

  return (
    <div className="space-y-4">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardContent><Metric label="目前淨值" value={money(summary.total)} helper="目前持股＋現金估值" /></CardContent></Card>
        <Card><CardContent><Metric label="累計淨投入" value={money(contributions)} helper={`${externalCount} 筆入出金`} /></CardContent></Card>
        <Card><CardContent><Metric label="XIRR" value={xirr === null ? "資料不足" : percent(xirr * 100, 2)} helper="年化資金加權報酬" /></CardContent></Card>
        <Card><CardContent><Metric label="TWR Proxy" value={dietz === null ? "資料不足" : percent(dietz * 100, 2)} helper="每日快照 Modified Dietz" /></CardContent></Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingUp size={18} />
              <h3 className="font-semibold">報酬怎麼算</h3>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 pt-4 text-sm leading-6 text-black/55 dark:text-white/55">
            <p><strong className="text-black/80 dark:text-white/80">XIRR</strong> 使用你記錄的入金、出金日期與目前投資組合淨值，計算年化資金加權報酬。入金視為投資人的現金流出，出金與目前淨值視為現金流入。</p>
            <p><strong className="text-black/80 dark:text-white/80">TWR Proxy</strong> 目前使用每日淨值快照與 Modified Dietz 做現金流調整。因為我們沒有每筆入出金前後的即時估值，所以它是透明的近似值，不冒充精確 TWR。</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Coins size={18} />
              <h3 className="font-semibold">紀錄完整度</h3>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 pt-4 sm:grid-cols-2">
            <div className="mini-metric"><span>每日快照</span><strong>{state.snapshots.length.toLocaleString()} 筆</strong></div>
            <div className="mini-metric"><span>交易／現金流</span><strong>{state.activities.length.toLocaleString()} 筆</strong></div>
            <div className="mini-metric"><span>股息－費用</span><strong>{money(income)}</strong></div>
            <div className="mini-metric"><span>未實現損益</span><strong>{money(summary.gain)}</strong></div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardContent className="flex gap-3">
          <CircleHelp size={18} className="mt-0.5 shrink-0 text-[#7a6549]" />
          <div className="text-sm leading-6 text-black/50 dark:text-white/50">
            <p className="font-semibold text-black/75 dark:text-white/75">要讓績效更可信，先把入金／出金補齊。</p>
            <p className="mt-1">買進、賣出、股息與費用可以做完整日誌；但只有「入金／出金」屬於外部現金流，會影響 XIRR 與現金流調整報酬。不要把買股票誤記成入金。</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-2xl border border-black/6 bg-white/55 p-4 text-sm dark:border-white/7 dark:bg-white/3"><WalletCards size={17} />持股仍是目前估值的來源</div>
        <div className="flex items-center gap-3 rounded-2xl border border-black/6 bg-white/55 p-4 text-sm dark:border-white/7 dark:bg-white/3"><Landmark size={17} />匯率使用你記錄的當日 FX</div>
        <div className="flex items-center gap-3 rounded-2xl border border-black/6 bg-white/55 p-4 text-sm dark:border-white/7 dark:bg-white/3"><Coins size={17} />所有資料仍只存在本機</div>
      </div>
    </div>
  );
}
