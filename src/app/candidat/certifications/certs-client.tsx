"use client";

import { CrudSection, type CrudItem } from "@/components/forms/crud-section";
import { CertificateFile, type CertificateDoc } from "./certificate-file";
import { deleteCertificationAction, saveCertificationAction } from "@/features/candidates/actions";
import { certificationSchema } from "@/features/candidates/schemas";

export function CertificationsList({ items, files, maxBytes }: { items: CrudItem[]; files: Record<string, CertificateDoc>; maxBytes: number }) {
  return (
    <CrudSection
      items={items}
      schema={certificationSchema}
      save={saveCertificationAction}
      remove={deleteCertificationAction}
      addLabel="Ajouter une certification"
      emptyTitle="Aucune certification renseignée"
      extra={(item) => <CertificateFile certificationId={item.id} doc={files[item.id]} maxBytes={maxBytes} />}
      fields={[
        { name: "name", label: "Certification", required: true },
        { name: "issuer", label: "Organisme", required: true },
        { name: "issue_date", label: "Date d'obtention", type: "date" },
        { name: "expiry_date", label: "Date d'expiration", type: "date" },
        { name: "credential_id", label: "Identifiant du certificat" },
        { name: "credential_url", label: "Lien de vérification", type: "url" },
      ]}
    />
  );
}
