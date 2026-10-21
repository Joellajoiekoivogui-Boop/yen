"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastTone = "success" | "error" | "info";
interface ToastItem {
  id: number;
  tone: ToastTone;
  text: string;
}

const DURATION_MS = 5000;
const EMPTY: ToastItem[] = [];

// Petit magasin global : toast.success("…") peut être appelé depuis n'importe quel composant client.
let items: ToastItem[] = EMPTY;
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

function push(tone: ToastTone, text: string) {
  items = [...items, { id: nextId++, tone, text }].slice(-4);
  emit();
}

export function dismissToast(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

export const toast = {
  success: (text: string) => push("success", text),
  error: (text: string) => push("error", text),
  info: (text: string) => push("info", text),
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const TONES = {
  success: { Icon: CheckCircle2, icon: "text-emerald-500", bar: "bg-emerald-500" },
  error: { Icon: XCircle, icon: "text-red-500", bar: "bg-red-500" },
  info: { Icon: Info, icon: "text-electric-500", bar: "bg-electric-500" },
} as const;

/** Zone d'affichage des notifications éphémères (montée une fois dans la mise en page racine). */
export function Toaster() {
  const list = useSyncExternalStore(subscribe, () => items, () => EMPTY);
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 pb-24 sm:inset-x-auto sm:right-0 sm:items-end sm:pb-6 lg:pb-6"
    >
      {list.map((t) => (
        <ToastCard key={t.id} item={t} />
      ))}
    </div>
  );
}

function ToastCard({ item }: { item: ToastItem }) {
  const [paused, setPaused] = useState(false);
  const { Icon, icon, bar } = TONES[item.tone];

  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => dismissToast(item.id), DURATION_MS);
    return () => clearTimeout(timer);
  }, [paused, item.id]);

  return (
    <div
      className="toast-in pointer-events-auto relative flex w-full max-w-sm items-start gap-3 overflow-hidden rounded-2xl border border-border bg-white py-3 pr-10 pl-4 shadow-2xl shadow-navy-900/15"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Icon className={cn("mt-0.5 size-5 shrink-0", icon)} aria-hidden />
      <p className="text-sm text-navy-900">{item.text}</p>
      <button
        type="button"
        onClick={() => dismissToast(item.id)}
        className="absolute top-2.5 right-2.5 rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-navy-900"
        aria-label="Fermer la notification"
      >
        <X className="size-4" aria-hidden />
      </button>
      <span
        aria-hidden
        className={cn("toast-progress absolute inset-x-0 bottom-0 h-0.5 origin-left", bar)}
        style={{ animationDuration: `${DURATION_MS}ms`, animationPlayState: paused ? "paused" : "running" }}
      />
    </div>
  );
}
