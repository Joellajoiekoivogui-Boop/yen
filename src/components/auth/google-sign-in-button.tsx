"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Logo « G » de Google (couleurs officielles), réservé au bouton de connexion. */
function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="size-5 shrink-0" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/**
 * Bouton « Continuer avec Google » : lien vers /auth/google (connexion démarrée côté serveur).
 * État de chargement pendant la redirection ; il redevient utilisable si l'utilisateur revient
 * en arrière (connexion annulée).
 */
export function GoogleSignInButton({ next, acceptTerms = false, label = "Continuer avec Google" }: { next?: string; acceptTerms?: boolean; label?: string }) {
  const [loading, setLoading] = useState(false);

  // retour arrière depuis Google (page restaurée depuis le cache du navigateur) : bouton réactivé
  useEffect(() => {
    const reset = (e: PageTransitionEvent) => e.persisted && setLoading(false);
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  const params = new URLSearchParams();
  if (next) params.set("suivant", next);
  if (acceptTerms) params.set("cgu", "1");
  const href = `/auth/google${params.size ? `?${params}` : ""}`;

  return (
    <a
      href={href}
      onClick={(e) => {
        if (loading) e.preventDefault();
        else setLoading(true);
      }}
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-border bg-white px-4 text-base font-medium text-navy-900 shadow-xs transition duration-200",
        "hover:-translate-y-px hover:border-navy-200 hover:shadow-md active:translate-y-0 active:scale-[0.98]",
        "focus-visible:ring-4 focus-visible:ring-electric-500/20 focus-visible:outline-none",
        loading && "pointer-events-none opacity-70",
      )}
    >
      {loading ? <Loader2 className="size-5 animate-spin text-navy-700" aria-hidden /> : <GoogleLogo />}
      {loading ? "Redirection vers Google…" : label}
    </a>
  );
}

/** Séparateur « ou » entre la connexion Google et le formulaire e-mail. */
export function AuthDivider() {
  return (
    <div className="flex items-center gap-3 text-xs font-medium tracking-wide text-muted uppercase" role="separator" aria-label="ou">
      <span className="h-px flex-1 bg-border" aria-hidden />
      ou
      <span className="h-px flex-1 bg-border" aria-hidden />
    </div>
  );
}
