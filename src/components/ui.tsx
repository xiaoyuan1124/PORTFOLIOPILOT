"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
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

export function Modal({ trigger, title, children }: { trigger: ReactNode; title: string; children: ReactNode }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/35 backdrop-blur-sm" />
        <Dialog.Content className="fixed bottom-0 left-0 right-0 z-50 max-h-[88vh] overflow-y-auto rounded-t-[28px] border border-black/10 bg-[#f8f7f3] p-5 shadow-2xl outline-none dark:border-white/10 dark:bg-[#111614] md:bottom-auto md:left-1/2 md:right-auto md:top-1/2 md:w-[560px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[28px] md:p-6">
          <div className="mb-5 flex items-center justify-between">
            <Dialog.Title className="text-xl font-semibold">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button className="grid h-11 w-11 place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/8" aria-label="關閉"><X size={20} /></button>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
