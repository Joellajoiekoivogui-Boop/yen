"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Award, Eye, FileText, ImageUp, Loader2, Pencil, Plus, Trash2, UploadCloud } from "lucide-react";
import { toast } from "@/components/feedback/toast";
import { Badge, Button, EmptyState } from "@/components/ui";
import { deleteCertificateAction, saveCertificateAction } from "@/features/candidates/certificate-files";
import { uploadDirect } from "@/features/documents/upload-client";
import { cn } from "@/lib/utils";

const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp";
const isAccepted = (f: File) => /^(application\/pdf|image\/(jpeg|png|webp))$/.test(f.type) || /\.(pdf|jpe?g|png|webp)$/i.test(f.name);

export interface CertificateItem {
  id: string;
  name: string;
  issuer: string;
  period: string | null;
  status: "verifie" | "rejete" | "non_verifie";
  doc?: { id: string; filename: string; mime: string; size: number };
}

const STATUS = {
  verifie: { label: "Vérifié par YEN", tone: "green" },
  rejete: { label: "Non validé", tone: "red" },
  non_verifie: { label: "En attente de vérification", tone: "neutral" },
} as const;

/** Certificats du candidat : ajout en un seul formulaire (formation, organisation, période, fichier) et liste. */
export function CertificatesManager({ items, maxBytes }: { items: CertificateItem[]; maxBytes: number }) {
  const [editing, setEditing] = useState<string | null>(items.length === 0 ? "new" : null);

  return (
    <div className="space-y-4">
      {editing === "new" ? (
        <CertificateForm maxBytes={maxBytes} onDone={() => setEditing(null)} onCancel={items.length ? () => setEditing(null) : undefined} />
      ) : (
        <Button variant="secondary" onClick={() => setEditing("new")}>
          <Plus className="size-4" aria-hidden /> Ajouter un certificat
        </Button>
      )}
      {items.length === 0 && editing !== "new" && <EmptyState icon={Award} title="Aucun certificat pour l'instant" description="Ajoutez les certificats des formations que vous avez suivies." />}
      {items.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {items.map((item) =>
            editing === item.id ? (
              <li key={item.id} className="lg:col-span-2">
                <CertificateForm item={item} maxBytes={maxBytes} onDone={() => setEditing(null)} onCancel={() => setEditing(null)} />
              </li>
            ) : (
              <CertificateCard key={item.id} item={item} onEdit={() => setEditing(item.id)} />
            ),
          )}
        </ul>
      )}
    </div>
  );
}

function CertificateCard({ item, onEdit }: { item: CertificateItem; onEdit: () => void }) {
  const [pending, start] = useTransition();
  const href = item.doc ? `/api/documents/${item.doc.id}?inline=1` : null;
  const isImage = item.doc?.mime.startsWith("image/");
  const st = STATUS[item.status] ?? STATUS.non_verifie;

  return (
    <li className={cn("flex animate-slide-down gap-3 rounded-xl border border-border bg-white p-3 transition duration-300 hover:border-navy-200 hover:shadow-md", pending && "opacity-60")}>
      {href ? (
        <a href={href} target="_blank" rel="noopener" className="group block shrink-0 overflow-hidden rounded-lg ring-1 ring-border" title="Ouvrir le certificat">
          {isImage ? (
            <Image src={href} alt={`Certificat : ${item.doc!.filename}`} width={88} height={88} unoptimized className="size-[88px] object-cover transition duration-500 group-hover:scale-110" />
          ) : (
            <span className="grid size-[88px] place-items-center bg-red-50 text-red-600">
              <FileText className="size-8" aria-hidden />
              <span className="sr-only">Certificat PDF : {item.doc!.filename}</span>
            </span>
          )}
        </a>
      ) : (
        <span className="grid size-[88px] shrink-0 place-items-center rounded-lg border border-dashed border-border px-1 text-center text-[11px] text-muted">Sans fichier</span>
      )}
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-navy-900">{item.name}</p>
        <p className="text-sm text-slate-600">{item.issuer}</p>
        {item.period && <p className="text-sm text-muted">{item.period}</p>}
        <Badge tone={st.tone} className="mt-1.5">{st.label}</Badge>
        <div className="mt-2 flex flex-wrap gap-1">
          {href && (
            <a href={href} target="_blank" rel="noopener" className="inline-flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium text-navy-700 transition hover:bg-navy-50">
              <Eye className="size-4" aria-hidden /> Voir
            </a>
          )}
          <button type="button" onClick={onEdit} className="inline-flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium text-navy-700 transition hover:bg-navy-50">
            <Pencil className="size-4" aria-hidden /> Modifier
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!window.confirm(`Supprimer le certificat « ${item.name} » ?`)) return;
              start(async () => {
                const r = await deleteCertificateAction(item.id);
                if (r.ok) toast.success(r.message ?? "Certificat supprimé.");
                else toast.error(r.error);
              });
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium text-red-600 transition hover:bg-red-50"
          >
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />} Supprimer
          </button>
        </div>
      </div>
    </li>
  );
}

type Field = "name" | "issuer" | "training_period" | "file";

function CertificateForm({ item, maxBytes, onDone, onCancel }: { item?: CertificateItem; maxBytes: number; onDone: () => void; onCancel?: () => void }) {
  const formId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState({ name: item?.name ?? "", issuer: item?.issuer ?? "", training_period: item?.period ?? "" });
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, start] = useTransition();
  const maxMb = Math.round(maxBytes / 1024 / 1024);

  // libère l'aperçu local de l'image
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  /** Contrôles du fichier ; renvoie un message d'erreur ou null. */
  const fileError = (f: File) => (!isAccepted(f) ? "Format non accepté : PDF ou photo (JPEG, PNG, WebP)." : f.size > maxBytes ? `Le fichier dépasse ${maxMb} Mo.` : null);
  const choose = (f: File | undefined) => {
    if (!f) return;
    const err = fileError(f);
    setErrors((e) => ({ ...e, file: err ?? undefined }));
    if (err) return;
    setFile(f);
    setPreview(f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    // fichier choisi avant le chargement complet de la page (connexion lente) : lu directement dans le champ
    const pickedEarly = file ? null : fileInput.current?.files?.[0];
    const selected = file ?? (pickedEarly && !fileError(pickedEarly) ? pickedEarly : null);
    const next: Partial<Record<Field, string>> = {};
    if (pickedEarly && fileError(pickedEarly)) next.file = fileError(pickedEarly)!;
    if (!values.name.trim()) next.name = "Indiquez la formation suivie.";
    if (!values.issuer.trim()) next.issuer = "Indiquez l'organisation.";
    if (!values.training_period.trim()) next.training_period = "Indiquez quand vous avez suivi la formation.";
    if (!item && !selected && !next.file) next.file = "Ajoutez le certificat (PDF ou photo).";
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length) return;

    start(async () => {
      let upload_path: string | undefined;
      if (selected) {
        setProgress(0);
        const up = await uploadDirect(selected, "certificate", setProgress);
        if (!up.ok) {
          setProgress(null);
          return setFormError(up.error);
        }
        setProgress(100);
        upload_path = up.path;
      }
      let r;
      try {
        r = await saveCertificateAction({ ...values, id: item?.id, upload_path, filename: selected?.name });
      } catch {
        r = { ok: false as const, error: "L'enregistrement a été interrompu. Vérifiez votre connexion puis réessayez." };
      }
      setProgress(null);
      if (!r.ok) return setFormError(r.error);
      toast.success(r.message ?? "Certificat enregistré.");
      onDone();
    });
  };

  const field = (name: Exclude<Field, "file">, label: string, placeholder: string, autoFocus = false) => (
    <div>
      <label htmlFor={`${formId}-${name}`} className="mb-1 block text-sm font-medium text-navy-900">
        {label} <span className="text-red-600" aria-hidden>*</span>
      </label>
      <input
        id={`${formId}-${name}`}
        className="field-input"
        value={values[name]}
        placeholder={placeholder}
        maxLength={name === "training_period" ? 100 : 200}
        autoFocus={autoFocus}
        aria-invalid={errors[name] ? true : undefined}
        aria-describedby={errors[name] ? `${formId}-${name}-err` : undefined}
        onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
      />
      {errors[name] && (
        <p id={`${formId}-${name}-err`} className="mt-1 animate-slide-down text-xs text-red-600">
          {errors[name]}
        </p>
      )}
    </div>
  );

  return (
    <form onSubmit={submit} noValidate className="animate-slide-down space-y-4 rounded-xl border border-navy-100 bg-navy-50/40 p-4 sm:p-5">
      <p className="font-heading font-semibold text-navy-900">{item ? "Modifier le certificat" : "Nouveau certificat"}</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {field("name", "Formation suivie", "Ex. : Développement web, Électricité du bâtiment", !item)}
        {field("issuer", "Organisation", "Ex. : YEN, Orange Digital Center, Coursera")}
        <div className="sm:col-span-2 sm:max-w-sm">{field("training_period", "Quand avez-vous suivi la formation ?", "Ex. : 2024, ou janvier à mars 2024")}</div>
      </div>

      <div>
        <p id={`${formId}-file-label`} className="mb-1 block text-sm font-medium text-navy-900">
          Certificat (PDF ou photo) {!item && <span className="text-red-600" aria-hidden>*</span>}
        </p>
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          aria-labelledby={`${formId}-file-label`}
          onChange={(e) => choose(e.target.files?.[0])}
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => fileInput.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            choose(e.dataTransfer.files?.[0]);
          }}
          aria-describedby={errors.file ? `${formId}-file-err` : undefined}
          className={cn(
            "group flex w-full items-center gap-3 rounded-xl border-2 border-dashed bg-white px-4 py-3 text-left transition duration-300",
            dragging ? "scale-[1.01] border-gold-400 bg-gold-50" : errors.file ? "border-red-300" : "border-border hover:border-navy-300",
          )}
        >
          {preview ? (
            <Image src={preview} alt="" width={56} height={56} unoptimized className="size-14 rounded-lg object-cover ring-1 ring-border" />
          ) : (
            <span className={cn("grid size-14 shrink-0 place-items-center rounded-xl transition duration-300", file ? "bg-red-50 text-red-600" : "bg-navy-50 text-navy-700 group-hover:bg-gold-400 group-hover:text-navy-950")}>
              {file ? <FileText className="size-6" aria-hidden /> : dragging ? <ImageUp className="size-6 animate-bounce-soft" aria-hidden /> : <UploadCloud className="size-6" aria-hidden />}
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-navy-900">
              {file ? file.name : item?.doc ? `Fichier actuel : ${item.doc.filename}` : "Choisir le fichier ou le glisser ici"}
            </span>
            <span className="block text-xs text-muted">
              {file ? "Cliquez pour changer de fichier" : item?.doc ? "Cliquez pour le remplacer (facultatif)" : `PDF, JPEG, PNG ou WebP · ${maxMb} Mo maximum · une photo nette suffit`}
            </span>
          </span>
        </button>
        {errors.file && (
          <p id={`${formId}-file-err`} role="alert" className="mt-1 animate-slide-down text-xs text-red-600">
            {errors.file}
          </p>
        )}
      </div>

      {progress !== null && (
        <div role="progressbar" aria-label="Envoi du certificat" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} className="h-2 overflow-hidden rounded-full bg-white">
          <div className="h-full rounded-full bg-gradient-to-r from-electric-500 to-gold-400 transition-[width] duration-300" style={{ width: `${progress}%` }} />
        </div>
      )}
      {formError && (
        <p role="alert" className="animate-slide-down rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {formError}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {pending ? (progress !== null && progress < 100 ? `Envoi… ${progress} %` : "Enregistrement…") : "Enregistrer le certificat"}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" disabled={pending} onClick={onCancel}>
            Annuler
          </Button>
        )}
      </div>
    </form>
  );
}
