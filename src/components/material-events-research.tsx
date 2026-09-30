"use client";

import { useEffect, useMemo, useState } from "react";
import { BellRing, ExternalLink, RefreshCw } from "lucide-react";
import type { AppState } from "@/lib/types";
import {
  latestMaterialEventDate,
  loadBundledMaterialEvents,
  materialEventsForHoldings,
  materialEventSource,
  type MaterialEventCache
} from "@/lib/material-events-data";
import { Badge, Card, CardContent, GhostButton } from "./ui";

export function MaterialEventsResearch({ state }: { state: AppState }) {
  const [cache, setCache] = useState<MaterialEventCache | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function reload() {
    setLoading(true);
    setError("");
    try {
      setCache(await loadBundledMaterialEvents());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "無法載入官方重大訊息。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    void loadBundledMaterialEvents()
      .then((next) => {
        if (!active) return;
        setCache(next);
        setError("");
      })
      .catch((cause) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "無法載入官方重大訊息。");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, []);

  const visible = useMemo(
    () => cache ? materialEventsForHoldings(cache, state.holdings) : [],
    [cache, state.holdings]
  );

  const twHoldingCount = useMemo(
    () => state.holdings.filter((holding) => holding.market === "TW" && holding.type !== "cash").length,
    [state.holdings]
  );

  const latestDate = cache ? latestMaterialEventDate(cache) : null;
  const seededOnly = cache?.generatedAt.startsWith("1970-01-01") ?? false;

  return (
    <div className="space-y-4">
      <div className="rounded-[24px] border border-black/6 bg-[#e9eee9] p-5 dark:border-white/8 dark:bg-[#18211d]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#1f332a] text-white dark:bg-[#dce9e2] dark:text-[#122018]">
              <BellRing size={18} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.14em] text-black/40 dark:text-white/40">Official Material Events · TWSE + TPEx</p>
              <h3 className="mt-1 text-xl font-semibold">持股重大訊息</h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-black/55 dark:text-white/55">
                只整理你目前持有台灣標的可對應到的官方重大訊息。顯示公司原始主旨、發言時間、事實發生日與說明，不做情緒分類、利多利空標籤或買賣評分。
              </p>
            </div>
          </div>
          <div className="text-right text-sm text-black/45 dark:text-white/45">
            <p>台灣投資部位 {twHoldingCount}</p>
            <p>近期持股公告 {visible.length}</p>
            <p>{latestDate ? `cache 最新公告日 ${latestDate}` : "尚無公告日期"}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/6 p-4 dark:border-white/8">
        <p className="text-xs leading-5 text-black/42 dark:text-white/42">
          快取保留最近 {cache?.retentionDays ?? 45} 個日曆日；資料由 GitHub Actions 從官方 OpenAPI 更新，因此不是盤中逐秒推播。
        </p>
        <GhostButton disabled={loading} onClick={() => void reload()}>
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          {loading ? "讀取中" : "重新讀取"}
        </GhostButton>
      </div>

      {error ? (
        <div className="rounded-2xl border border-[#b98b57]/25 bg-[#f5ece1] p-4 text-sm text-[#6f4c26] dark:border-[#b98b57]/20 dark:bg-[#2a2117] dark:text-[#e0bd8c]">
          {error}
        </div>
      ) : null}

      {!loading && !error && seededOnly ? (
        <div className="rounded-2xl border border-black/6 p-5 text-sm leading-6 text-black/45 dark:border-white/8 dark:text-white/45">
          官方重大訊息 cache 尚未完成第一次 market-data 更新。這裡不會用 Demo 或一般新聞替代；等官方 OpenAPI refresh 成功後才顯示。
        </div>
      ) : null}

      <div className="grid gap-3">
        {visible.map((row) => {
          const source = cache ? materialEventSource(cache, row.market) : null;
          return (
            <Card key={`${row.market}:${row.code}:${row.publishedDate}:${row.publishedTime}:${row.subject}`}>
              <CardContent className="p-4 md:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{row.name || row.code}</p>
                      <span className="text-xs text-black/40 dark:text-white/40">{row.code}</span>
                      <Badge tone="good">持有</Badge>
                      <Badge>{row.market}</Badge>
                    </div>
                    <p className="mt-3 text-sm font-semibold leading-6">{row.subject}</p>
                  </div>
                  <Badge>{row.publishedDate} {row.publishedTime}</Badge>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 text-xs text-black/45 dark:text-white/45">
                  {row.factDate ? <span className="rounded-full border border-black/6 px-2.5 py-1 dark:border-white/8">事實發生日 {row.factDate}</span> : null}
                  {row.rule ? <span className="rounded-full border border-black/6 px-2.5 py-1 dark:border-white/8">{row.rule}</span> : null}
                </div>

                {row.detail ? (
                  <details className="mt-4 rounded-2xl border border-black/6 p-3.5 dark:border-white/8">
                    <summary className="cursor-pointer text-sm font-semibold">展開公司原始說明</summary>
                    <p className="mt-3 whitespace-pre-line text-sm leading-6 text-black/55 dark:text-white/55">{row.detail}</p>
                  </details>
                ) : null}

                <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-5 text-black/40 dark:text-white/40">
                  <span>公司發言時間 {row.publishedDate} {row.publishedTime}</span>
                  {source ? (
                    <a
                      className="inline-flex items-center gap-1 underline underline-offset-2"
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {source.market} 官方 OpenAPI
                      <ExternalLink size={10} />
                    </a>
                  ) : <span>來源 metadata 不完整</span>}
                  <a
                    className="inline-flex items-center gap-1 underline underline-offset-2"
                    href="https://mops.twse.com.tw/mops/web/t05sr01_1"
                    target="_blank"
                    rel="noreferrer"
                  >
                    公開資訊觀測站
                    <ExternalLink size={10} />
                  </a>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {!loading && !error && !seededOnly && visible.length === 0 ? (
        <div className="py-14 text-center">
          <p className="text-sm text-black/40 dark:text-white/40">
            {twHoldingCount === 0
              ? "目前沒有台灣股票／ETF 部位，因此沒有持股重大訊息可顯示。"
              : "目前快取期間內沒有可對應到你持股的官方重大訊息。"}
          </p>
        </div>
      ) : null}
    </div>
  );
}
