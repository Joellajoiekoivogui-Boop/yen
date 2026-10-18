import type { Metadata } from "next";
import { Download, KeyRound, Share2, ShieldCheck } from "lucide-react";
import { ButtonLink, Card, CardBody, CardHeader, PageHeader, Table, Td, Th } from "@/components/ui";
import { requireCandidate } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { ConsentsForm, PasswordForm, SecurityActions } from "./settings-client";

export const metadata: Metadata = { title: "Paramètres et confidentialité" };

export default async function SettingsPage() {
  const ctx = await requireCandidate();
  const supabase = await createClient();
  const [consents, shares] = await Promise.all([
    supabase.from("candidate_consents").select("consent_type, granted, updated_at").eq("candidate_id", ctx.candidateId),
    supabase.from("profile_shares").select("id, reason, created_at, expires_at, revoked_at, include_cv, organizations(name)").eq("candidate_id", ctx.candidateId).order("created_at", { ascending: false }),
  ]);
  const c = Object.fromEntries((consents.data ?? []).map((x) => [x.consent_type, x.granted]));
  return (
    <div className="space-y-6">
      <PageHeader title="Paramètres et confidentialité" description="Vous gardez le contrôle de la visibilité de votre profil et de vos données." />
      <Card>
        <CardHeader icon={ShieldCheck} title="Consentements et visibilité" description="Vous pouvez modifier ces choix à tout moment ; le retrait prend effet immédiatement." />
        <CardBody>
          <ConsentsForm defaults={{ traitement_ia: Boolean(c.traitement_ia), visibilite_vivier: Boolean(c.visibilite_vivier), partage_partenaires: Boolean(c.partage_partenaires), notifications_externes: Boolean(c.notifications_externes) }} />
        </CardBody>
      </Card>
      <Card>
        <CardHeader icon={Share2} title="Partages de mon profil avec des partenaires" />
        <CardBody>
          <Table>
            <thead><tr><Th>Organisation</Th><Th>Motif</Th><Th>Date</Th><Th>Expiration</Th><Th>Statut</Th></tr></thead>
            <tbody>
              {(shares.data ?? []).map((s) => (
                <tr key={s.id}>
                  <Td>{(s.organizations as unknown as { name: string } | null)?.name}</Td>
                  <Td className="max-w-xs">{s.reason}</Td>
                  <Td>{formatDate(s.created_at)}</Td>
                  <Td>{formatDate(s.expires_at)}</Td>
                  <Td>{s.revoked_at ? "Révoqué" : new Date(s.expires_at) < new Date() ? "Expiré" : c.partage_partenaires ? "Actif" : "Suspendu (consentement retiré)"}</Td>
                </tr>
              ))}
              {(shares.data ?? []).length === 0 && <tr><Td colSpan={5} className="text-center text-muted">Votre profil n&apos;a été partagé avec aucun partenaire.</Td></tr>}
            </tbody>
          </Table>
        </CardBody>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader icon={Download} title="Mes données" />
          <CardBody className="space-y-3">
            <p className="text-sm text-slate-600">Téléchargez l&apos;ensemble de vos données (profil, documents référencés, évaluations, candidatures, analyses) au format JSON.</p>
            <div className="flex flex-wrap gap-2">
              <ButtonLink href="/api/candidat/export" variant="outline" prefetch={false}><Download className="size-4" aria-hidden /> Exporter mon profil</ButtonLink>
              <ButtonLink href="/api/candidat/cv-genere" variant="outline" prefetch={false}><Download className="size-4" aria-hidden /> Télécharger mon CV</ButtonLink>
            </div>
            <p className="text-xs text-muted">Pour rectifier une information, modifiez-la dans votre profil ou contactez l&apos;équipe YEN.</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader icon={KeyRound} title="Sécurité du compte" />
          <CardBody className="space-y-6">
            <PasswordForm />
            <SecurityActions />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
