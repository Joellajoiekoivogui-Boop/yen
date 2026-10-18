"use client";

import { useId, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useForm, type FieldValues, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Loader2 } from "lucide-react";
import { Alert, Button } from "@/components/ui";
import { cn } from "@/lib/utils";

export type FieldType = "text" | "email" | "tel" | "url" | "number" | "date" | "month" | "datetime-local" | "textarea" | "select" | "checkbox" | "checkboxes" | "password";

export interface FieldConfig {
  name: string;
  label: ReactNode;
  type?: FieldType;
  placeholder?: string;
  help?: ReactNode;
  required?: boolean;
  options?: { value: string; label: string }[];
  rows?: number;
  colSpan?: 1 | 2;
  autoComplete?: string;
  min?: number;
  max?: number;
  step?: number;
}

export type ActionResultLike = { ok: true; message?: string; data?: unknown } | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

interface EntityFormProps {
  schema: z.ZodType;
  fields: FieldConfig[];
  defaultValues?: Record<string, unknown>;
  action: (values: Record<string, unknown>) => Promise<ActionResultLike>;
  submitLabel?: string;
  resetOnSuccess?: boolean;
  onSuccess?: (result: ActionResultLike) => void;
  redirectTo?: string;
  footer?: ReactNode;
  className?: string;
}

/**
 * Formulaire générique : validation côté client (React Hook Form + Zod) puis
 * appel d'une action serveur qui revalide avec le MÊME schéma.
 */
export function EntityForm({ schema, fields, defaultValues, action, submitLabel = "Enregistrer", resetOnSuccess, onSuccess, redirectTo, footer, className }: EntityFormProps) {
  const router = useRouter();
  const formId = useId();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const form = useForm<FieldValues>({
    resolver: zodResolver(schema as never) as unknown as Resolver<FieldValues>,
    defaultValues: defaultValues ?? {},
    mode: "onBlur",
  });
  const { register, handleSubmit, formState, setError, reset } = form;

  const onSubmit = handleSubmit(
    (values) => {
    setStatus(null);
    startTransition(async () => {
      const res = await action(values);
      if (res.ok) {
        setStatus({ tone: "success", text: res.message ?? "Enregistré." });
        if (resetOnSuccess) reset(defaultValues ?? {});
        onSuccess?.(res);
        if (redirectTo) router.push(redirectTo);
        else router.refresh();
      } else {
        setStatus({ tone: "error", text: res.error });
        for (const [name, msgs] of Object.entries(res.fieldErrors ?? {})) {
          setError(name, { type: "server", message: msgs[0] });
        }
      }
    });
    },
    () => setStatus({ tone: "error", text: "Certains champs sont invalides : vérifiez les messages sous les champs concernés." }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className={cn("space-y-4", className)}>
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((f) => {
          const id = `${formId}-${f.name}`;
          const err = formState.errors[f.name]?.message as string | undefined;
          const describedBy = [f.help ? `${id}-help` : null, err ? `${id}-err` : null].filter(Boolean).join(" ") || undefined;
          const common = { id, "aria-invalid": err ? true : undefined, "aria-describedby": describedBy };
          const type = f.type ?? "text";
          return (
            <div key={f.name} className={cn(f.colSpan === 2 || type === "textarea" || type === "checkboxes" ? "sm:col-span-2" : "")}>
              {type === "checkbox" ? (
                <label htmlFor={id} className="flex items-start gap-2 text-sm text-navy-900">
                  <input type="checkbox" className="mt-0.5 size-4 rounded border-border accent-electric-600" {...common} {...register(f.name)} />
                  <span>
                    {f.label}
                    {f.required && <span className="text-red-600"> *</span>}
                  </span>
                </label>
              ) : (
                <>
                  <label htmlFor={id} className="mb-1 block text-sm font-medium text-navy-900">
                    {f.label}
                    {f.required && <span className="text-red-600" aria-hidden> *</span>}
                  </label>
                  {type === "textarea" ? (
                    <textarea rows={f.rows ?? 4} placeholder={f.placeholder} className="field-input" {...common} {...register(f.name)} />
                  ) : type === "select" ? (
                    <select className="field-input" {...common} {...register(f.name, { setValueAs: (v) => (v === "" ? null : v) })}>
                      <option value="">— Sélectionner —</option>
                      {f.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : type === "checkboxes" ? (
                    <fieldset className="flex flex-wrap gap-x-4 gap-y-2" {...common}>
                      <legend className="sr-only">{f.label}</legend>
                      {f.options?.map((o) => (
                        <label key={o.value} className="flex items-center gap-2 text-sm text-slate-700">
                          <input type="checkbox" value={o.value} className="size-4 rounded border-border accent-electric-600" {...register(f.name)} />
                          {o.label}
                        </label>
                      ))}
                    </fieldset>
                  ) : (
                    <input
                      type={type}
                      placeholder={f.placeholder}
                      autoComplete={f.autoComplete}
                      min={f.min}
                      max={f.max}
                      step={f.step}
                      className="field-input"
                      {...common}
                      {...register(f.name, type === "number" ? { setValueAs: (v) => (v === "" || v == null ? null : Number(v)) } : undefined)}
                    />
                  )}
                </>
              )}
              {f.help && (
                <p id={`${id}-help`} className="mt-1 text-xs text-muted">
                  {f.help}
                </p>
              )}
              {err && (
                <p id={`${id}-err`} className="mt-1 text-xs text-red-600">
                  {err}
                </p>
              )}
            </div>
          );
        })}
      </div>
      {status && <Alert tone={status.tone}>{status.text}</Alert>}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {submitLabel}
        </Button>
        {footer}
      </div>
    </form>
  );
}
