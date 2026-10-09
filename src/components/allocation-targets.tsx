"use client";

import { useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Crosshair, RotateCcw, Target } from "lucide-react";
import { toast } from "sonner";
import type { AllocationTarget, AppState } from "@/lib/types";
import {
  buildAllocationDrift,
  buildCurrentAllocationBuckets,
  targetsFromCurrentAllocation
} from "@/lib/allocation-targets";
import { money } from "@/lib/utils";
import { ContributionPlanner } from "./contribution-planner";
import { Badge, Button, Card, CardContent, CardHeader, GhostButton, Modal } from "./ui";

type DraftRow = {
  key: string;
  label: string;
  currentPct: number;
  targetPct: number;
};

function TargetEditor({
  state,
  onSave
}: {
  state: AppState;
  onSave: (targets: AllocationTarget[]) => boolean;
}) {
  const current = useMemo(
    () => buildCurrentAllocationBuckets(state.holdings, state.usdTwd),
    [state.holdings, state.usdTwd]
  );
  const existing = state.allocationTargets ?? [];
  const [rows, setRows] = useState<DraftRow[]>(() => {
    const targetSeed = existing.length
      ? existing
      : targetsFromCurrentAllocation(state.holdings, state.usdTwd);
    const currentByKey = new Map(current.map((row) => [row.key.toLowerCase(), row]));
    const targetByKey = new Map(targetSeed.map((row) => [row.key.toLowerCase(), row]));
    const keys = new Set([...currentByKey.keys(), ...targetByKey.keys()]);

    return [...keys].map((key) => {
      const bucket = currentByKey.get(key);
      const target = targetByKey.get(key);
      return {
        key: bucket?.key ?? target?.key ?? key,
        label: bucket?.label ?? target?.label ?? key,
        currentPct: bucket?.currentPct ?? 0,
        targetPct: target?.targetPct ?? 0
      };
    }).sort((a, b) => b.currentPct - a.currentPct || b.targetPct - a.targetPct);
  });
  const closeRef = useRef<HTMLButtonElement>(null);
  const total = rows.reduce((sum, row) => sum + row.targetPct, 0);
  const valid = rows.some((row) => row.targetPct > 0) && Math.abs(total - 100) <= 0.05;

  function updateTarget(key: string, value: number) {
    setRows((currentRows) => currentRows.map((row) =>
      row.key === key ? { ...row, targetPct: Number.isFinite(value) ? Math.max(0, value) : 0 } : row
    ));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid) return;
    const targets = rows
      .filter((row) => row.targetPct > 0)
      .map((row) => ({ key: row.key, label: row.label, targetPct: row.targetPct }));
    if (!onSave(targets)) return;
    closeRef.current?.click();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="rounded-2xl border border-black/6 bg-black/[.018] p-4 text-sm leading-6 dark:border-white/8 dark:bg-white/[.025]">
        目標以「資產」為單位，不分券商帳戶；同一檔標的跨帳戶會合併。現金則分成 TWD / USD。系統只顯示偏離，不會自動產生買賣建議。
      </div>

      {!rows.length ? (
        <p className="py-8 text-center text-sm text-black/40 dark:text-white/40">目前沒有持股可建立配置目標。</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.key} className="grid gap-2 rounded-2xl border border-black/6 p-3 dark:border-white/8 sm:grid-cols-[1fr_110px_130px] sm:items-center">
              <div className="min-w-0">
                <strong className="block truncate text-sm">{row.label}</strong>
                <span className="text-xs text-black/40 dark:text-white/40">目前 {row.currentPct.toFixed(1)}%</span>
              </div>
              <span className="text-xs text-black/42 dark:text-white/42">目前 {row.currentPct.toFixed(1)}%</span>
              <label className="flex items-center gap-2">
                <input
                  className="field min-w-0"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={Number.isFinite(row.targetPct) ? row.targetPct : 0}
                  onChange={(event) => updateTarget(row.key, Number(event.target.value))}
                  aria-label={`${row.label} 目標配置百分比`}
                />
                <span className="text-sm text-black/40 dark:text-white/40">%</span>
              </label>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between rounded-2xl bg-[#edf2ee] px-4 py-3 dark:bg-[#17201b]">
        <span className="text-sm font-semibold">目標合計</span>
        <strong className={`tabular-nums ${valid ? "" : "text-[#9a5e36] dark:text-[#e1ad80]"}`}>{total.toFixed(1)}%</strong>
      </div>
      {!valid && rows.length ? (
        <p className="text-xs leading-5 text-[#8b6538] dark:text-[#d4ad7c]">儲存前目標合計必須為 100%。設為 0% 的項目不會寫入目標清單。</p>
      ) : null}

      <Button type="submit" disabled={!valid} className="w-full">儲存配置目標</Button>
      <Dialog.Close asChild>
        <button ref={closeRef} type="button" className="hidden" aria-hidden="true" tabIndex={-1} />
      </Dialog.Close>
    </form>
  );
}

export function AllocationTargets({
  state,
  onChange
}: {
  state: AppState;
  onChange: (state: AppState) => boolean;
}) {
  const targets = useMemo(() => state.allocationTargets ?? [], [state.allocationTargets]);
  const rows = useMemo(
    () => buildAllocationDrift(targets, state.holdings, state.usdTwd),
    [targets, state.holdings, state.usdTwd]
  );
  const largest = rows[0] ?? null;

  function saveTargets(nextTargets: AllocationTarget[]) {
    if (!onChange({ ...state, allocationTargets: nextTargets })) return false;
    toast.success("配置目標已儲存");
    return true;
  }

  function clearTargets() {
    if (!window.confirm("清除目前所有配置目標？持股資料不會被刪除。")) return;
    if (!onChange({ ...state, allocationTargets: [] })) return;
    toast.success("配置目標已清除");
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.14em] text-black/40 dark:text-white/40">Target allocation</p>
              <h2 className="mt-1 text-lg font-semibold">目標配置 vs 現況偏離</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-black/48 dark:text-white/48">
                先定義自己的配置目標，再看目前資產與目標差多少。這裡只描述偏離，不把偏離轉成買進、賣出或再平衡指令。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {targets.length ? (
                <GhostButton onClick={clearTargets}><RotateCcw size={15} />清除目標</GhostButton>
              ) : null}
              <Modal
                title={targets.length ? "修改配置目標" : "設定配置目標"}
                trigger={<Button><Target size={16} />{targets.length ? "修改目標" : "設定目標"}</Button>}
              >
                <TargetEditor state={state} onSave={saveTargets} />
              </Modal>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-4">
          {!targets.length ? (
            <div className="rounded-2xl border border-dashed border-black/10 px-5 py-10 text-center dark:border-white/10">
              <Crosshair className="mx-auto text-black/25 dark:text-white/25" size={30} />
              <p className="mt-3 text-sm font-semibold">尚未設定配置目標</p>
              <p className="mt-1 text-xs leading-5 text-black/42 dark:text-white/42">第一次開啟編輯器時會先以目前配置當作起點，你再調成自己的長期目標。</p>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-[#edf2ee] p-4 dark:bg-[#17201b]">
                  <span className="text-xs text-black/45 dark:text-white/45">目標項目</span>
                  <strong className="mt-1 block text-xl">{targets.length}</strong>
                </div>
                <div className="rounded-2xl border border-black/6 p-4 dark:border-white/8">
                  <span className="text-xs text-black/45 dark:text-white/45">最大配置偏離</span>
                  <strong className="mt-1 block text-xl tabular-nums">{largest ? `${Math.abs(largest.driftPct).toFixed(1)} pp` : "—"}</strong>
                </div>
                <div className="rounded-2xl border border-black/6 p-4 dark:border-white/8">
                  <span className="text-xs text-black/45 dark:text-white/45">偏離最大項目</span>
                  <strong className="mt-1 block truncate text-sm">{largest?.label ?? "—"}</strong>
                  {largest ? <span className="mt-1 block text-[11px] text-black/38 dark:text-white/38">{largest.driftPct > 0 ? "目前高於目標" : largest.driftPct < 0 ? "目前低於目標" : "目前等於目標"}</span> : null}
                </div>
              </div>

              <div className="mt-4 grid gap-3">
                {rows.map((row) => (
                  <div key={row.key} className="rounded-2xl border border-black/6 p-4 dark:border-white/8">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <strong className="block truncate text-sm">{row.label}</strong>
                        <span className="mt-1 block text-xs text-black/40 dark:text-white/40">{money(row.valueTwd)}</span>
                      </div>
                      <div className="text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Badge>目前 {row.currentPct.toFixed(1)}%</Badge>
                          <Badge tone="good">目標 {row.targetPct.toFixed(1)}%</Badge>
                        </div>
                        <span className="mt-1 block text-xs tabular-nums text-black/45 dark:text-white/45">
                          偏離 {row.driftPct >= 0 ? "+" : ""}{row.driftPct.toFixed(1)} pp
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 space-y-2">
                      <div>
                        <div className="mb-1 flex justify-between text-[11px] text-black/38 dark:text-white/38"><span>目前</span><span>{row.currentPct.toFixed(1)}%</span></div>
                        <div className="h-2 overflow-hidden rounded-full bg-black/5 dark:bg-white/8">
                          <div className="h-full rounded-full bg-[#456b58]" style={{ width: `${Math.min(100, row.currentPct)}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="mb-1 flex justify-between text-[11px] text-black/38 dark:text-white/38"><span>目標</span><span>{row.targetPct.toFixed(1)}%</span></div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-black/5 dark:bg-white/8">
                          <div className="h-full rounded-full bg-black/25 dark:bg-white/25" style={{ width: `${Math.min(100, row.targetPct)}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <ContributionPlanner state={state} />
    </div>
  );
}
