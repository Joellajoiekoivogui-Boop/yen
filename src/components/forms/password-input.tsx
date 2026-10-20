"use client";

import { useState, type ComponentProps } from "react";
import { AlertTriangle, Check, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

/** Règles identiques à passwordSchema (features/auth/schemas.ts). */
const RULES = [
  { label: "10 caractères minimum", test: (v: string) => v.length >= 10 },
  { label: "Une minuscule", test: (v: string) => /[a-z]/.test(v) },
  { label: "Une majuscule", test: (v: string) => /[A-Z]/.test(v) },
  { label: "Un chiffre", test: (v: string) => /[0-9]/.test(v) },
];
const LEVELS = [
  { label: "Trop faible", bar: "bg-red-500" },
  { label: "Faible", bar: "bg-red-500" },
  { label: "Moyen", bar: "bg-amber-500" },
  { label: "Presque", bar: "bg-amber-400" },
  { label: "Solide", bar: "bg-emerald-500" },
];

/**
 * Champ mot de passe : bouton afficher / masquer, alerte majuscules verrouillées et,
 * pour un nouveau mot de passe, indicateur de solidité avec la liste des règles.
 */
export function PasswordInput({ value, showStrength, className, ...inputProps }: ComponentProps<"input"> & { value: string; showStrength: boolean }) {
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const passed = RULES.filter((r) => r.test(value)).length;
  const level = LEVELS[value ? passed : 0];

  return (
    <div>
      <div className="relative">
        <input
          {...inputProps}
          type={visible ? "text" : "password"}
          className={cn("field-input pr-11", className)}
          onKeyUp={(e) => setCapsLock(e.getModifierState("CapsLock"))}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-xl text-slate-400 transition hover:text-navy-800"
          aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          aria-pressed={visible}
        >
          {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        </button>
      </div>
      {capsLock && (
        <p className="mt-1 flex animate-slide-down items-center gap-1.5 text-xs text-amber-700">
          <AlertTriangle className="size-3.5" aria-hidden /> Majuscules verrouillées
        </p>
      )}
      {showStrength && value.length > 0 && (
        <div className="mt-2 animate-slide-down" aria-live="polite">
          <div className="flex gap-1" aria-hidden>
            {RULES.map((_, i) => (
              <span key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                <span className={cn("block h-full rounded-full transition-all duration-500 ease-out-expo", i < passed ? cn("w-full", level.bar) : "w-0")} />
              </span>
            ))}
          </div>
          <p className="mt-1 text-xs font-medium text-navy-900">Solidité : {level.label}</p>
          <ul className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5">
            {RULES.map((r) => {
              const ok = r.test(value);
              return (
                <li key={r.label} className={cn("flex items-center gap-1.5 text-xs transition-colors duration-300", ok ? "text-emerald-700" : "text-slate-500")}>
                  <span className={cn("grid size-3.5 place-items-center rounded-full transition-all duration-300", ok ? "scale-100 bg-emerald-500 text-white" : "scale-90 bg-slate-200")}>
                    {ok && <Check className="size-2.5" strokeWidth={3} aria-hidden />}
                  </span>
                  {r.label}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
