"use client";

import Link from "next/link";
import { useId, useRef, useState, useSyncExternalStore, useTransition, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { PasswordInput } from "@/components/forms/password-input";
import { Alert, Button, ButtonLink } from "@/components/ui";
import { requestLoginLinkAction, signInAction } from "@/features/auth/actions";
import { EMAIL_NOT_CONFIRMED_MESSAGE } from "@/features/auth/errors";
import { emailLinkRequestSchema, signInSchema } from "@/features/auth/schemas";

type Method = "lien" | "mot-de-passe";
type Field = "email" | "password";
/** Préférence de cet appareil (simple confort d'affichage, aucune donnée de session). */
const METHOD_KEY = "yen-connexion-methode";
const onStorage = (cb: () => void) => {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
};
function storedMethod(): Method | null {
  try {
    return window.localStorage.getItem(METHOD_KEY) === "mot-de-passe" ? "mot-de-passe" : null;
  } catch {
    // stockage indisponible (navigation privée) : méthode par défaut
    return null;
  }
}

/**
 * Connexion : par défaut un lien et un code envoyés par e-mail (sans mot de passe à retenir) ;
 * le mot de passe reste disponible, et l'appareil se souvient de la méthode choisie
 * (pratique pour l'équipe YEN, qui se connecte avec son mot de passe).
 */
export function SignInForm({ next }: { next?: string }) {
  const id = useId();
  // méthode retenue sur cet appareil (lue après l'affichage initial), sinon le lien par e-mail
  const stored = useSyncExternalStore(onStorage, storedMethod, () => null);
  const [chosen, setMethod] = useState<Method | null>(null);
  const method = chosen ?? stored ?? "lien";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [error, setError] = useState<string | null>(null);
  // adresse pas encore vérifiée : mener à la saisie du code (l'adresse est retenue côté serveur)
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [pending, start] = useTransition();
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const switchTo = (m: Method) => {
    setMethod(m);
    setErrors({});
    setError(null);
    setUnconfirmed(false);
    try {
      window.localStorage.setItem(METHOD_KEY, m);
    } catch {
      // sans importance
    }
    window.setTimeout(() => (m === "mot-de-passe" && email ? passwordRef : emailRef).current?.focus(), 0);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setUnconfirmed(false);
    const parsed = method === "lien" ? emailLinkRequestSchema.safeParse({ email }) : signInSchema.safeParse({ email, password });
    if (!parsed.success) {
      const found: Partial<Record<Field, string>> = {};
      for (const issue of parsed.error.issues) found[issue.path[0] as Field] ??= issue.message;
      setErrors(found);
      (found.email ? emailRef : passwordRef).current?.focus();
      return;
    }
    setErrors({});
    start(async () => {
      const r = method === "lien" ? await requestLoginLinkAction({ email, next }) : await signInAction({ email, password, next });
      if (r.ok) {
        window.location.assign(r.data?.redirectTo ?? "/");
        return;
      }
      setErrors({ email: r.fieldErrors?.email?.[0], password: r.fieldErrors?.password?.[0] });
      setError(r.error === "Certaines informations sont invalides." && r.fieldErrors ? null : r.error);
      setUnconfirmed(r.error === EMAIL_NOT_CONFIRMED_MESSAGE);
    });
  };

  const field = (name: Field) => ({
    id: `${id}-${name}`,
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `${id}-${name}-err` : undefined,
  });
  const fieldError = (name: Field) =>
    errors[name] && (
      <p id={`${id}-${name}-err`} className="mt-1 animate-slide-down text-xs text-red-600">
        {errors[name]}
      </p>
    );

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div>
        <label htmlFor={`${id}-email`} className="mb-1 block text-sm font-medium text-navy-900">
          Adresse e-mail
        </label>
        <input
          {...field("email")}
          ref={emailRef}
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="field-input"
        />
        {fieldError("email")}
      </div>

      {method === "mot-de-passe" && (
        <div className="animate-slide-down">
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <label htmlFor={`${id}-password`} className="block text-sm font-medium text-navy-900">
              Mot de passe
            </label>
            <Link href="/mot-de-passe-oublie" className="text-xs font-medium text-electric-700 hover:underline">
              Mot de passe oublié ?
            </Link>
          </div>
          <PasswordInput
            {...field("password")}
            ref={passwordRef}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            showStrength={false}
          />
          {fieldError("password")}
        </div>
      )}

      {error && <Alert tone="error">{error}</Alert>}
      {unconfirmed && (
        <ButtonLink href="/verification" variant="outline" className="w-full animate-slide-down">
          Saisir mon code de vérification
        </ButtonLink>
      )}

      <Button type="submit" variant="secondary" size="lg" className="w-full" disabled={pending} aria-busy={pending || undefined}>
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {method === "lien" ? "Recevoir un lien de connexion" : "Se connecter"}
      </Button>

      <p className="text-center text-sm">
        {method === "lien" ? (
          <button type="button" onClick={() => switchTo("mot-de-passe")} className="font-medium text-electric-700 hover:underline">
            Se connecter avec un mot de passe
          </button>
        ) : (
          <button type="button" onClick={() => switchTo("lien")} className="font-medium text-electric-700 hover:underline">
            Recevoir plutôt un lien par e-mail
          </button>
        )}
      </p>
    </form>
  );
}
