"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui";
import { toast } from "@/components/feedback/toast";
import type { ActionResultLike } from "./entity-form";

/** Bouton déclenchant une action serveur, avec confirmation optionnelle et retour visible. */
export function ActionButton({
  action,
  children,
  confirm,
  variant = "outline",
  size = "sm",
  redirectTo,
  onDone,
  className,
}: {
  action: () => Promise<ActionResultLike>;
  children: ReactNode;
  confirm?: string;
  variant?: "primary" | "secondary" | "accent" | "ghost" | "danger" | "outline";
  size?: "sm" | "md" | "lg";
  redirectTo?: string;
  onDone?: (r: ActionResultLike) => void;
  className?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        variant={variant}
        size={size}
        disabled={pending}
        className={className}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          setMsg(null);
          start(async () => {
            const r = await action();
            // succès : notification éphémère ; erreur : message à côté du bouton
            if (r.ok) toast.success(r.message ?? "Effectué.");
            else setMsg({ ok: false, text: r.error });
            onDone?.(r);
            // pas de router.refresh() : l'action appelle revalidatePath et sa réponse contient déjà la page à jour
            if (r.ok && redirectTo) router.push(redirectTo);
          });
        }}
      >
        {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
        {children}
      </Button>
      {msg && (
        <span role="status" className={msg.ok ? "text-xs text-emerald-700" : "text-xs text-red-600"}>
          {msg.text}
        </span>
      )}
    </span>
  );
}
