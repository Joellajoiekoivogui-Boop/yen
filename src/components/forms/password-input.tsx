"use client";

import { useState, type ComponentProps } from "react";
import { AlertTriangle, Check, Eye, EyeOff } from "lucide-react";
import { isCommonPassword, MIN_PASSWORD_LENGTH, passwordStrength } from "@/features/auth/password-rules";
import { cn } from "@/lib/utils";

const LEVELS = [
  { label: "Trop court", bar: "bg-red-500" },
  { label: "Trop faible", bar: "bg-red-500" },
  { label: "Correct", bar: "bg-amber-500" },
  { label: "Bon", bar: "bg-emerald-400" },
  { label: "Excellent", bar: "bg-emerald-500" },
];

/**
 * Champ mot de passe : bouton afficher / masquer, alerte majuscules verrouillées et,
 * pour un nouveau mot de passe, indicateur de solidité avec la liste des règles.
 */
export function PasswordInput({ value, showStrength, className, ...inputProps }: ComponentProps<"input"> & { value: string; showStrength: boolean }) {
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const strength = passwordStrength(value);
  const level = LEVELS[strength];
  const longEnough = value.length >= MIN_PASSWORD_LENGTH;
  const common = longEnough && isCommonPassword(value);

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
            {[1, 2, 3, 4].map((i) => (
              <span key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                <span className={cn("block h-full rounded-full transition-all duration-500 ease-out-expo", i <= strength ? cn("w-full", level.bar) : "w-0")} />
              </span>
            ))}
          </div>
          <p className={cn("mt-1 flex items-center gap-1.5 text-xs transition-colors duration-300", longEnough && !common ? "text-emerald-700" : "text-slate-600")}>
            <span className={cn("grid size-3.5 place-items-center rounded-full transition-all duration-300", longEnough && !common ? "scale-100 bg-emerald-500 text-white" : "scale-90 bg-slate-200")}>
              {longEnough && !common && <Check className="size-2.5" strokeWidth={3} aria-hidden />}
            </span>
            {common ? "Mot de passe trop courant : choisissez-en un autre" : `${MIN_PASSWORD_LENGTH} caractères minimum`}
            <span className="ml-auto font-medium text-navy-900">{level.label}</span>
          </p>
        </div>
      )}
    </div>
  );
}
