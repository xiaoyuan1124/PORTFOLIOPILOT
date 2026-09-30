"use client";

import { CircleHelp, Coins, Landmark, TrendingUp, WalletCards } from "lucide-react";
import type { AppState } from "@/lib/types";
import { localDateKey, portfolioSummary } from "@/lib/calc";
import {
  exactTimeWeightedReturn,
  incomeAfterFees,
  modifiedDietzReturn,
  netExternalContributions,
  portfolioXirr
} from "@/lib/performance";
import { money, percent } from "@/lib/utils";
import { BenchmarkComparison } from "./benchmark-comparison";
import { Badge, Card, CardContent, CardHeader, Metric } from "./ui";

export function Performance({ state }: { state: AppState }) {
  const valuationDate = localDateKey();
  const summary = portfolioSummary(state.holdings, state.usdTwd);
  const contributions = netExternalContributions(state.activities, valuationDate);
  const income = incomeAfterFees(state.activities, valuationDate);
  const xirr = portfolioXirr(state, valuationDate);
  const exactTwr = exactTimeWeightedReturn(state, valuationDate);
  const currentSnapshots = state.snapshots.filter((snapshot) => snapshot.date <= valuationDate);
  const dietz = modifiedDietzReturn(state, valuationDate);
  const externalCount = state.activities.filter((activity) => (activity.type === "deposit" || activity.type === "withdrawal") && activity.date <= valuationDate).length;
  const futureActivityCount = state.activities.filter((activity) => activity.date > valuationDate).length;
  const futureSnapshotCount = state.snapshots.filter((snapshot) => snapshot.date > valuationDate).length;

  const exactHelper = exactTwr.status === "exact"
    ? `${exactTwr.startDate ?? "—"} → ${exactTwr.endDate} · ${exactTwr.periods} 子期間`
    : `${exactTwr.boundedFlowCount}/${exactTwr.externalFlowCount} 筆外部現金流有邊界`;

  return (
    <div className="space-y-4">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Card><CardContent><Metric label="目前淨值" value={money(summary.total)} helper="目前持股＋現金估值" /></CardContent></Card>
        <Card><CardContent><Metric label="累計淨投入" value={money(contributions)} helper={`${externalCount} 筆入出金`} /></CardContent></Card>
        <Card><CardContent><Metric label="XIRR" value={xirr === null ? "資料不足" : percent(xirr * 100, 2)} helper="年化資金加權報酬" /></CardContent></Card>
        <Card>
          <CardContent>
            <div className="flex items-start justify-between gap-2">
              <Metric
                label="Exact TWR"
                value={exactTwr.status === "exact" && exactTwr.value !== null ? percent(exactTwr.value * 100, 2) : "資料不足"}
                helper={exactHelper}
              />
              <Badge tone={exactTwr.status === "exact" ? "good" : "warn"}>{exactTwr.status === "exact" ? "Exact" : "Incomplete"}</Badge>
            </div>
          </CardContent>
        </Card>
        <Card><CardContent><Metric label="TWR Proxy" value={dietz === null ? "資料不足" : percent(dietz * 100, 2)} helper="每日快照 Modified Dietz · 近似" /></CardContent></Card>
      </section>

      {futureActivityCount || futureSnapshotCount ? (
        <div className="rounded-2xl border border-[#b98b57]/25 bg-[#f5ece1] px-4 py-3 text-sm text-[#6f4c26] dark:border-[#b98b57]/20 dark:bg-[#2a2117] dark:text-[#e0bd8c]">
          {futureActivityCount ? <p>有 {futureActivityCount} 筆未來日期的交易／現金流紀錄；今天的淨投入、股息／費用與績效計算已自動排除。</p> : null}
          {futureSnapshotCount ? <p className={futureActivityCount ? "mt-1" : ""}>有 {futureSnapshotCount} 筆未來日期的淨值快照；今天的 TWR Proxy 與 Benchmark 區間已自動排除。</p> : null}
        </div>
      ) : null}

      <BenchmarkComparison exactTwr={exactTwr} proxyReturn={dietz} snapshots={currentSnapshots} />

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
            <p><strong className="text-black/80 dark:text-white/80">Exact TWR</strong> 只在每筆入金／出金都有「現金流發生前的投資組合淨值」時，才把現金流切成子期間並幾何鏈結。今天實際發生的外部現金流可在寫入前由系統擷取目前 PortfolioPilot 淨值；歷史補登仍需使用當時可確認的手動邊界。缺任何必要邊界就顯示資料不足，不會用 Proxy 補洞冒充精確值。</p>
            <p><strong className="text-black/80 dark:text-white/80">TWR Proxy</strong> 使用每日淨值快照與 Modified Dietz 做現金流調整。它仍是透明的近似值，用來支援舊資料與缺少事件邊界的期間。</p>
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
            <div className="mini-metric"><span>目前可用快照</span><strong>{currentSnapshots.length.toLocaleString()} 筆</strong></div>
            <div className="mini-metric"><span>交易／現金流</span><strong>{state.activities.length.toLocaleString()} 筆</strong></div>
            <div className="mini-metric"><span>TWR 邊界</span><strong>{exactTwr.boundedFlowCount}/{exactTwr.externalFlowCount}</strong></div>
            <div className="mini-metric"><span>Exact 子期間</span><strong>{exactTwr.status === "exact" ? exactTwr.periods : "—"}</strong></div>
            <div className="mini-metric"><span>股息－費用</span><strong>{money(income)}</strong></div>
            <div className="mini-metric"><span>未實現損益</span><strong>{money(summary.gain)}</strong></div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardContent className="flex gap-3">
          <CircleHelp size={18} className="mt-0.5 shrink-0 text-[#7a6549]" />
          <div className="text-sm leading-6 text-black/50 dark:text-white/50">
            <p className="font-semibold text-black/75 dark:text-white/75">
              {exactTwr.status === "exact" ? "Exact TWR 已有可計算的事件邊界。" : "Exact TWR 目前資料不足。"}
            </p>
            <p className="mt-1">{exactTwr.reason}</p>
            {exactTwr.status === "exact" && exactTwr.coverageStartsAfterFirstFlow ? (
              <p className="mt-1">這個 Exact TWR 只代表第一筆有邊界的外部現金流完成後，到目前估值日的覆蓋區間；不是帳戶更早歷史的完整 TWR。</p>
            ) : null}
            {exactTwr.ambiguousDates.length ? <p className="mt-1">同日順序不明：{exactTwr.ambiguousDates.join("、")}</p> : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex gap-3">
          <CircleHelp size={18} className="mt-0.5 shrink-0 text-[#7a6549]" />
          <div className="text-sm leading-6 text-black/50 dark:text-white/50">
            <p className="font-semibold text-black/75 dark:text-white/75">入金／出金才是外部現金流。</p>
            <p className="mt-1">買進、賣出、股息與費用可以做完整日誌，但不會切斷 TWR 子期間。不要把買股票誤記成入金；記錄 TWR 邊界時，填的是現金流前的整體淨值，不是交易金額或持股成本。</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-2xl border border-black/6 bg-white/55 p-4 text-sm dark:border-white/7 dark:bg-white/3"><WalletCards size={17} />目前淨值仍來自本機持股估值</div>
        <div className="flex items-center gap-3 rounded-2xl border border-black/6 bg-white/55 p-4 text-sm dark:border-white/7 dark:bg-white/3"><Landmark size={17} />外幣現金流使用你記錄的當日 FX</div>
        <div className="flex items-center gap-3 rounded-2xl border border-black/6 bg-white/55 p-4 text-sm dark:border-white/7 dark:bg-white/3"><Coins size={17} />績效與邊界資料仍只存在本機</div>
      </div>
    </div>
  );
}
