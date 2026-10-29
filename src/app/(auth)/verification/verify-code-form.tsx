"use client";

import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from "react";
import { Loader2, MailPlus } from "lucide-react";
import { Alert, Button } from "@/components/ui";
import { resendConfirmationAction, verifySignupCodeAction } from "@/features/auth/actions";
import { verifySignupSchema } from "@/features/auth/schemas";

type Field = "email" | "code";

/**
 * Saisie du code de vérification (généré et vérifié par Supabase Auth) et renvoi d'un nouveau
 * code, possible après le délai minimal de Supabase entre deux e-mails.
 */
export function VerifyCodeForm({ email: initialEmail, resendIn, resendDelay }: { email: string; resendIn: number; resendDelay: number }) {
  const id = useId();
  const [email, setEmail] = useState(initialEmail);
  const [editingEmail, setEditingEmail] = useState(!initialEmail);
  const [code, setCode] = useState("");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  // code refusé par Supabase : champ signalé, le message détaillé est dans l'alerte
  const [rejected, setRejected] = useState(false);
  const [alert, setAlert] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [wait, setWait] = useState(resendIn);
  const [pending, startVerify] = useTransition();
  const [resending, startResend] = useTransition();
  const codeRef = useRef<HTMLInputElement>(null);

  // compte à rebours avant de pouvoir redemander un code
  useEffect(() => {
    if (wait <= 0) return;
    const t = window.setTimeout(() => setWait((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [wait]);

  const fieldProps = (field: Field) => ({
    id: `${id}-${field}`,
    "aria-invalid": errors[field] || (field === "code" && rejected) ? true : undefined,
    "aria-describedby": errors[field] ? `${id}-${field}-err` : field === "code" ? `${id}-code-help` : undefined,
  });

  const verify = (e: FormEvent) => {
    e.preventDefault();
    setAlert(null);
    setRejected(false);
    const parsed = verifySignupSchema.safeParse({ email, code });
    if (!parsed.success) {
      const next: Partial<Record<Field, string>> = {};
      for (const issue of parsed.error.issues) next[issue.path[0] as Field] ??= issue.message;
      setErrors(next);
      if (next.email) setEditingEmail(true);
      else codeRef.current?.focus();
      return;
    }
    setErrors({});
    startVerify(async () => {
      const r = await verifySignupCodeAction({ email, code });
      if (r.ok) {
        setAlert({ tone: "success", text: r.message ?? "Adresse vérifiée." });
        window.location.assign(r.data?.redirectTo ?? "/");
        return;
      }
      setErrors({ email: r.fieldErrors?.email?.[0], code: r.fieldErrors?.code?.[0] });
      setRejected(!r.fieldErrors);
      setAlert({ tone: "error", text: r.error });
      setCode("");
      codeRef.current?.focus();
    });
  };

  const resend = () => {
    setAlert(null);
    const parsed = verifySignupSchema.shape.email.safeParse(email);
    if (!parsed.success) {
      setErrors({ email: parsed.error.issues[0]?.message });
      setEditingEmail(true);
      return;
    }
    startResend(async () => {
      const r = await resendConfirmationAction({ email });
      setAlert(r.ok ? { tone: "success", text: r.message ?? "Nouveau code envoyé." } : { tone: "error", text: r.error });
      if (r.ok) {
        setWait(resendDelay);
        setCode("");
        codeRef.current?.focus();
      }
    });
  };

  return (
    <form onSubmit={verify} noValidate className="space-y-4">
      {editingEmail ? (
        <div>
          <label htmlFor={`${id}-email`} className="mb-1 block text-sm font-medium text-navy-900">
            Adresse e-mail<span className="text-red-600" aria-hidden> *</span>
          </label>
          <input
            {...fieldProps("email")}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field-input"
          />
          {errors.email && (
            <p id={`${id}-email-err`} className="mt-1 animate-slide-down text-xs text-red-600">
              {errors.email}
            </p>
          )}
        </div>
      ) : (
        <p className="rounded-lg bg-navy-50 px-3 py-2.5 text-sm text-navy-900">
          Code envoyé à <strong className="font-semibold break-all">{email}</strong>{" "}
          <button type="button" onClick={() => setEditingEmail(true)} className="font-medium text-electric-700 hover:underline">
            Modifier
          </button>
        </p>
      )}

      <div>
        <label htmlFor={`${id}-code`} className="mb-1 block text-sm font-medium text-navy-900">
          Code de vérification<span className="text-red-600" aria-hidden> *</span>
        </label>
        <input
          {...fieldProps("code")}
          ref={codeRef}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]*"
          maxLength={12}
          required
          autoFocus={!editingEmail}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="000000"
          className="field-input h-14 text-center font-mono text-2xl tracking-[0.35em] placeholder:tracking-[0.35em]"
        />
        <p id={`${id}-code-help`} className="mt-1 text-xs text-muted">
          Le code arrive en une à deux minutes. Pensez à regarder dans les courriers indésirables (spams). Si l&apos;e-mail
          contient un lien plutôt qu&apos;un code, cliquez simplement sur ce lien.
        </p>
        {errors.code && (
          <p id={`${id}-code-err`} className="mt-1 animate-slide-down text-xs text-red-600">
            {errors.code}
          </p>
        )}
      </div>

      {/* Alert s'annonce d'elle-même (erreur immédiatement, succès poliment) */}
      {alert && <Alert tone={alert.tone}>{alert.text}</Alert>}

      <div className="flex flex-col items-stretch gap-3 text-center">
        <Button type="submit" variant="secondary" size="lg" disabled={pending} aria-busy={pending || undefined}>
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Vérifier mon adresse
        </Button>
        <button
          type="button"
          onClick={resend}
          disabled={resending || wait > 0}
          className="mx-auto inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-electric-700 transition hover:bg-electric-50 disabled:cursor-not-allowed disabled:text-slate-500 disabled:hover:bg-transparent"
        >
          {resending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <MailPlus className="size-4" aria-hidden />}
          {wait > 0 ? `Renvoyer un code (dans ${wait} s)` : "Renvoyer un code"}
        </button>
      </div>
    </form>
  );
}
