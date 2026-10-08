"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ChevronDown, X } from "lucide-react";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[24px] border border-black/6 bg-white/88 shadow-[0_14px_40px_rgba(31,51,42,0.06)] backdrop-blur dark:border-white/8 dark:bg-[#151a18]/92", className)} {...props} />;
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 pt-5 md:px-6 md:pt-6", className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 md:p-6", className)} {...props} />;
}

export function Button({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={cn("inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition active:scale-[.98] disabled:pointer-events-none disabled:opacity-40 bg-[#1f332a] text-white hover:bg-[#2a4438] dark:bg-[#dce9e2] dark:text-[#122018] dark:hover:bg-white", className)} {...props} />;
}

export function GhostButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={cn("inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-black/7 bg-white px-4 text-sm font-semibold text-[#26332d] transition hover:bg-[#f3f5f2] active:scale-[.98] dark:border-white/9 dark:bg-white/4 dark:text-[#e8eee9] dark:hover:bg-white/8", className)} {...props} />;
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" }) {
  const toneClass = tone === "good" ? "bg-[#e6f1e9] text-[#27563b] dark:bg-[#173426] dark:text-[#a8dab8]" : tone === "warn" ? "bg-[#f5ece1] text-[#7d5729] dark:bg-[#382817] dark:text-[#e5bd86]" : "bg-black/5 text-black/60 dark:bg-white/8 dark:text-white/60";
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold", toneClass)}>{children}</span>;
}

export function Metric({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return <div><p className="text-xs font-medium tracking-wide text-black/45 dark:text-white/45">{label}</p><p className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">{value}</p>{helper ? <p className="mt-1 text-xs text-black/45 dark:text-white/45">{helper}</p> : null}</div>;
}


export function InfoDisclosure({
  summary,
  children,
  className
}: {
  summary: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <details className={cn("group rounded-xl border border-black/6 bg-black/[.018] dark:border-white/7 dark:bg-white/[.025]", className)}>
      <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 px-3 text-xs font-semibold text-black/55 marker:hidden dark:text-white/55">
        <span>{summary}</span>
        <ChevronDown size={15} className="shrink-0 transition group-open:rotate-180" />
      </summary>
      <div className="border-t border-black/5 px-3 py-3 text-xs leading-5 text-black/48 dark:border-white/6 dark:text-white/48">
        {children}
      </div>
    </details>
  );
}

export function Modal({
  trigger,
  title,
  children,
  open,
  onOpenChange
}: {
  trigger: ReactNode;
  title: string;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/35 backdrop-blur-sm" />
        <Dialog.Content className="app-modal-sheet fixed bottom-0 left-0 right-0 z-50 max-h-[calc(100dvh-.75rem)] overflow-y-auto overscroll-contain rounded-t-[28px] border border-black/10 bg-[#f8f7f3] p-0 shadow-2xl outline-none dark:border-white/10 dark:bg-[#111614] md:bottom-auto md:left-1/2 md:right-auto md:top-1/2 md:max-h-[88vh] md:w-[560px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[28px]">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-black/5 bg-[#f8f7f3]/96 px-5 py-4 backdrop-blur dark:border-white/6 dark:bg-[#111614]/96 md:px-6">
            <Dialog.Title className="min-w-0 break-words pr-3 text-xl font-semibold">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/8" aria-label="關閉"><X size={20} /></button>
            </Dialog.Close>
          </div>
          <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 md:px-6 md:pb-6">
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
