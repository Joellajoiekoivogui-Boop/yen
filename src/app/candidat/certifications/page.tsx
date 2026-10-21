import type { Metadata } from "next";
import { Trophy } from "lucide-react";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui";
import { requireCandidate } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { loadCandidateBundle } from "@/features/candidates/queries";
import { getMaxCvBytes } from "@/features/admin/settings";
import { CertificatesManager, type CertificateItem } from "./certificates-manager";

export const metadata: Metadata = { title: "Mes certifications" };

export default async function CertificationsPage() {
  const ctx = await requireCandidate();
  const supabase = await createClient();
  const b = await loadCandidateBundle(supabase, ctx.candidateId);
  if (!b) return null;
  // justificatifs joints (PDF ou image)
  const docIds = b.certifications.map((c) => c.document_id).filter((id): id is string => Boolean(id));
  const { data: docs } = docIds.length
    ? await supabase.from("candidate_documents").select("id, original_filename, mime_type, size_bytes").in("id", docIds).is("deleted_at", null)
    : { data: [] };
  const items: CertificateItem[] = b.certifications.map((c) => {
    const d = docs?.find((x) => x.id === c.document_id);
    return {
      id: c.id,
      name: c.name,
      issuer: c.issuer,
      // anciens certificats : l'année d'obtention tient lieu de période
      period: c.training_period ?? (c.issue_date ? c.issue_date.slice(0, 4) : null),
      status: c.verification_status,
      doc: d ? { id: d.id, filename: d.original_filename, mime: d.mime_type, size: d.size_bytes } : undefined,
    };
  });
  const maxBytes = await getMaxCvBytes();
  return (
    <div className="space-y-6">
      <PageHeader title="Mes certifications" description="Pour chaque formation suivie : son nom, l'organisation, la période et le certificat en PDF ou en photo. L'équipe YEN vérifie ensuite le certificat." />
      <Card>
        <CardHeader icon={Trophy} title="Certificats" />
        <CardBody>
          <CertificatesManager items={items} maxBytes={maxBytes} />
        </CardBody>
      </Card>
    </div>
  );
}
