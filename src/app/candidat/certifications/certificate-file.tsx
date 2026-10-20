"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Eye, FileText, ImageUp, Loader2, RefreshCw, Trash2, UploadCloud } from "lucide-react";
import { toast } from "@/components/feedback/toast";
import { removeCertificateFileAction, uploadCertificateFileAction } from "@/features/candidates/certificate-files";
import { cn } from "@/lib/utils";

const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp";
const ACCEPTED_TYPES = ACCEPT.split(",");

export interface CertificateDoc {
  id: string;
  filename: string;
  mime: string;
  size: number;
}

/** Justificatif d'une certification : dépôt par glisser-déposer ou sélection, aperçu, remplacement. */
export function CertificateFile({ certificationId, doc, maxBytes }: { certificationId: string; doc?: CertificateDoc; maxBytes: number }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const maxMb = Math.round(maxBytes / 1024 / 1024);

  const upload = (file: File) => {
    setError(null);
    if (!ACCEPTED_TYPES.includes(file.type)) return setError("Format non accepté : PDF, JPEG, PNG ou WebP uniquement.");
    if (file.size > maxBytes) return setError(`Le fichier dépasse ${maxMb} Mo.`);
    if (file.type.startsWith("image/")) setLocalPreview(URL.createObjectURL(file));
    const fd = new FormData();
    fd.set("certificationId", certificationId);
    fd.set("file", file);
    startTransition(async () => {
      const res = await uploadCertificateFileAction(fd);
      if (res.ok) {
        toast.success(res.message ?? "Justificatif ajouté.");
        router.refresh();
      } else {
        setError(res.error);
      }
      setLocalPreview(null);
    });
  };

  const remove = () => {
    if (!window.confirm("Retirer ce justificatif ?")) return;
    setError(null);
    startTransition(async () => {
      const res = await removeCertificateFileAction(certificationId);
      if (res.ok) {
        toast.success(res.message ?? "Justificatif retiré.");
        router.refresh();
      } else setError(res.error);
    });
  };

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept={ACCEPT}
      className="sr-only"
      tabIndex={-1}
      aria-hidden
      onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (f) upload(f);
      }}
    />
  );

  const isImage = doc?.mime.startsWith("image/");

  return (
    <div className="mt-3">
      {input}
      {doc && !pending ? (
        <div className="flex animate-slide-down flex-wrap items-center gap-3 rounded-xl border border-border bg-slate-50/70 p-2.5">
          {isImage ? (
            <a href={`/api/documents/${doc.id}?inline=1`} target="_blank" rel="noopener" className="group relative block overflow-hidden rounded-lg ring-1 ring-border">
              <Image src={`/api/documents/${doc.id}?inline=1`} alt={`Justificatif : ${doc.filename}`} width={96} height={64} unoptimized className="h-16 w-24 object-cover transition duration-500 group-hover:scale-110" />
            </a>
          ) : (
            <span className="grid h-16 w-14 place-items-center rounded-lg bg-red-50 text-red-600 ring-1 ring-red-100">
              <FileText className="size-6" aria-hidden />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-navy-900">{doc.filename}</p>
            <p className="text-xs text-muted">
              {isImage ? "Image" : "PDF"} · {(doc.size / 1024 / 1024).toFixed(2).replace(".", ",")} Mo
            </p>
          </div>
          <div className="flex flex-wrap gap-1">
            <a href={`/api/documents/${doc.id}?inline=1`} target="_blank" rel="noopener" className="inline-flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium text-navy-700 transition hover:bg-navy-50">
              <Eye className="size-4" aria-hidden /> Voir
            </a>
            <button type="button" onClick={() => inputRef.current?.click()} className="inline-flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium text-navy-700 transition hover:bg-navy-50">
              <RefreshCw className="size-4" aria-hidden /> Remplacer
            </button>
            <button type="button" onClick={remove} className="inline-flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium text-red-600 transition hover:bg-red-50">
              <Trash2 className="size-4" aria-hidden /> Retirer
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f) upload(f);
          }}
          className={cn(
            "group flex w-full items-center gap-3 rounded-xl border-2 border-dashed px-4 py-3 text-left transition duration-300",
            dragging ? "scale-[1.01] border-gold-400 bg-gold-50" : "border-border hover:border-navy-300 hover:bg-navy-50/40",
            pending && "cursor-wait opacity-80",
          )}
        >
          {localPreview ? (
            // aperçu immédiat de l'image pendant l'envoi
            <Image src={localPreview} alt="" width={48} height={48} unoptimized className="size-12 rounded-lg object-cover ring-1 ring-border" />
          ) : (
            <span className={cn("grid size-12 shrink-0 place-items-center rounded-xl transition duration-300", dragging ? "bg-gold-400 text-navy-950" : "bg-navy-50 text-navy-700 group-hover:bg-gold-400 group-hover:text-navy-950")}>
              {pending ? <Loader2 className="size-5 animate-spin" aria-hidden /> : dragging ? <ImageUp className="size-5 animate-bounce-soft" aria-hidden /> : <UploadCloud className="size-5" aria-hidden />}
            </span>
          )}
          <span className="min-w-0">
            <span className="block text-sm font-medium text-navy-900">{pending ? "Envoi du justificatif…" : dragging ? "Déposez le fichier ici" : "Ajouter le certificat (PDF ou image)"}</span>
            <span className="block text-xs text-muted">Glissez-déposez ou cliquez · PDF, JPEG, PNG ou WebP · {maxMb} Mo maximum</span>
          </span>
        </button>
      )}
      {error && (
        <p role="alert" className="mt-1.5 animate-slide-down text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
