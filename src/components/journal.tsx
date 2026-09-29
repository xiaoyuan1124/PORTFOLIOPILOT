"use client";

import { useState } from "react";
import { BookOpen, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { AppState, JournalEntry } from "@/lib/types";
import { Button, Card, CardContent, GhostButton } from "./ui";

export function Journal({ state, onChange }: { state: AppState; onChange: (state: AppState) => void }) {
  const [symbol, setSymbol] = useState("");
  const [title, setTitle] = useState("");
  const [thesis, setThesis] = useState("");
  const [invalidation, setInvalidation] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !thesis.trim()) return;
    const entry: JournalEntry = {
      id: `j-${Date.now()}`,
      date: new Date().toISOString().slice(0, 10),
      symbol: symbol.trim().toUpperCase(),
      title: title.trim(),
      thesis: thesis.trim(),
      invalidation: invalidation.trim()
    };
    onChange({ ...state, journal: [entry, ...state.journal] });
    setSymbol(""); setTitle(""); setThesis(""); setInvalidation("");
    toast.success("投資筆記已儲存");
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[.82fr_1.18fr]">
      <Card>
        <CardContent>
          <div className="mb-5 flex items-center gap-2">
            <BookOpen size={18} />
            <h3 className="font-semibold">新增投資筆記</h3>
          </div>
          <form onSubmit={submit} className="space-y-3">
            <div className="grid grid-cols-[120px_1fr] gap-3">
              <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="代號" className="field" />
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="標題" className="field" />
            </div>
            <textarea value={thesis} onChange={(e) => setThesis(e.target.value)} placeholder="投資假設 / 為什麼持有？" rows={4} className="field resize-none" />
            <textarea value={invalidation} onChange={(e) => setInvalidation(e.target.value)} placeholder="什麼情況代表原本假設失效？" rows={3} className="field resize-none" />
            <Button type="submit" className="w-full"><Plus size={16} />儲存筆記</Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {state.journal.map((entry) => (
          <Card key={entry.id}>
            <CardContent className="p-4 md:p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{entry.title}</p>
                    {entry.symbol ? <span className="rounded-full bg-black/5 px-2 py-1 text-xs dark:bg-white/8">{entry.symbol}</span> : null}
                  </div>
                  <p className="mt-1 text-xs text-black/40 dark:text-white/40">{entry.date}</p>
                  <p className="mt-4 text-sm leading-6"><span className="font-semibold">假設：</span>{entry.thesis}</p>
                  {entry.invalidation ? <p className="mt-2 text-sm leading-6 text-black/55 dark:text-white/55"><span className="font-semibold text-[#8a6133] dark:text-[#d7b47f]">失效條件：</span>{entry.invalidation}</p> : null}
                </div>
                <GhostButton
                  type="button"
                  aria-label="刪除筆記"
                  className="h-10 min-h-10 w-10 shrink-0 px-0"
                  onClick={() => {
                    if (!window.confirm(`刪除「${entry.title}」這篇投資筆記？`)) return;
                    onChange({ ...state, journal: state.journal.filter((item) => item.id !== entry.id) });
                    toast.success("投資筆記已刪除");
                  }}
                >
                  <Trash2 size={16} />
                </GhostButton>
              </div>
            </CardContent>
          </Card>
        ))}
        {!state.journal.length ? <p className="py-12 text-center text-sm text-black/40 dark:text-white/40">還沒有投資筆記。</p> : null}
      </div>
    </div>
  );
}
