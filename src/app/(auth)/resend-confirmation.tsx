"use client";

import { useState, useTransition } from "react";
import { Loader2, MailPlus } from "lucide-react";
import { resendConfirmationAction } from "@/features/auth/actions";

/** Bouton « renvoyer l'e-mail de confirmation » (inscription en attente de confirmation). */
export function ResendConfirmation({ email }: { email: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="mt-3">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await resendConfirmationAction({ email });
            setMsg({ ok: r.ok, text: r.ok ? (r.message ?? "E-mail renvoyé.") : r.error });
          })
        }
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-electric-700 transition hover:bg-electric-50 disabled:opacity-60"
      >
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <MailPlus className="size-4" aria-hidden />}
        Renvoyer l&apos;e-mail de confirmation
      </button>
      {msg && (
        <p role="status" className={msg.ok ? "mt-1 animate-slide-down text-xs text-emerald-700" : "mt-1 animate-slide-down text-xs text-red-600"}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
