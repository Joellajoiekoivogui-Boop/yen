"use client";

import { useState, type ReactNode } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import type { z } from "zod";
import { Badge, Button, EmptyState } from "@/components/ui";
import { ActionButton } from "./action-button";
import { EntityForm, type ActionResultLike, type FieldConfig } from "./entity-form";

export interface CrudItem {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  badges?: { label: string; tone?: "neutral" | "blue" | "gold" | "green" | "amber" | "red" | "purple" }[];
  values: Record<string, unknown>;
}

/** Liste éditable (ajout, modification, suppression) reposant sur EntityForm. */
export function CrudSection({
  items, fields, schema, save, remove, addLabel = "Ajouter", emptyTitle, emptyDescription, defaults, extra,
}: {
  items: CrudItem[];
  fields: FieldConfig[];
  schema: z.ZodType;
  save: (values: Record<string, unknown>) => Promise<ActionResultLike>;
  remove?: (id: string) => Promise<ActionResultLike>;
  addLabel?: string;
  emptyTitle: string;
  emptyDescription?: ReactNode;
  defaults?: Record<string, unknown>;
  extra?: (item: CrudItem) => ReactNode;
}) {
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {items.length === 0 && editing !== "new" && <EmptyState title={emptyTitle} description={emptyDescription} />}
      {items.map((item) =>
        editing === item.id ? (
          <div key={item.id} className="rounded-lg border border-electric-200 bg-electric-50/30 p-4">
            <div className="mb-3 flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => setEditing(null)}><X className="size-4" aria-hidden /> Annuler</Button>
            </div>
            <EntityForm schema={schema} fields={fields} defaultValues={item.values} action={(v) => save({ ...v, id: item.id })} onSuccess={() => setEditing(null)} />
          </div>
        ) : (
          <div key={item.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border p-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-navy-900">{item.title}</p>
                {item.badges?.map((b) => <Badge key={b.label} tone={b.tone}>{b.label}</Badge>)}
              </div>
              {item.subtitle && <p className="text-sm text-muted">{item.subtitle}</p>}
              {item.description && <p className="mt-1 text-sm whitespace-pre-line text-slate-600">{item.description}</p>}
              {extra?.(item)}
            </div>
            <div className="flex items-start gap-1">
              <Button variant="ghost" size="sm" onClick={() => setEditing(item.id)} aria-label={`Modifier ${item.title}`}><Pencil className="size-4" aria-hidden /></Button>
              {remove && (
                <ActionButton variant="ghost" size="sm" confirm="Supprimer cet élément ?" action={() => remove(item.id)}>
                  <Trash2 className="size-4 text-red-600" aria-label={`Supprimer ${item.title}`} />
                </ActionButton>
              )}
            </div>
          </div>
        ),
      )}
      {editing === "new" ? (
        <div className="rounded-lg border border-electric-200 bg-electric-50/30 p-4">
          <div className="mb-3 flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)}><X className="size-4" aria-hidden /> Annuler</Button>
          </div>
          <EntityForm schema={schema} fields={fields} defaultValues={defaults} action={save} onSuccess={() => setEditing(null)} submitLabel={addLabel} />
        </div>
      ) : (
        <Button variant="outline" onClick={() => setEditing("new")}><Plus className="size-4" aria-hidden /> {addLabel}</Button>
      )}
    </div>
  );
}
