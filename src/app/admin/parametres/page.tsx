import type { Metadata } from "next";
import { Alert, Badge, Card, CardBody, CardHeader, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";
import { isAIConfigured } from "@/features/ai/provider";
import { SettingsForm } from "./form";

export const metadata: Metadata = { title: "Paramètres" };

export default async function SettingsPage() {
  await requireStaff("settings.manage");
  const supabase = await createClient();
  const { data } = await supabase.from("platform_settings").select("key, value");
  const s = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
  const w = (s["matching.default_weights"] ?? {}) as Record<string, number>;
  const env = serverEnv();
  const integ = [
    { name: "Fournisseur d'IA", ok: isAIConfigured(), detail: isAIConfigured() ? `${env.aiProvider} · ${env.aiModel}` : "Non configuré (AI_PROVIDER, ANTHROPIC_API_KEY)" },
    { name: "Clé de service Supabase (serveur)", ok: Boolean(env.supabaseServiceKey), detail: env.supabaseServiceKey ? "Configurée" : "Manquante (SUPABASE_SECRET_KEY)" },
    { name: "Antivirus (ClamAV)", ok: Boolean(env.clamavScanUrl), detail: env.clamavScanUrl ? "Configuré" : "Non configuré : contrôle structurel des PDF uniquement" },
    { name: "Notifications e-mail", ok: env.emailProvider !== "none", detail: env.emailProvider === "none" ? "Non configuré (notifications internes uniquement)" : env.emailProvider },
    { name: "Notifications SMS", ok: env.smsProvider !== "none", detail: env.smsProvider === "none" ? "Non configuré" : env.smsProvider },
    { name: "Notifications WhatsApp", ok: env.whatsappProvider !== "none", detail: env.whatsappProvider === "none" ? "Non configuré" : env.whatsappProvider },
  ];
  return (
    <div className="space-y-6">
      <PageHeader title="Paramètres de la plateforme" />
      <Card>
        <CardHeader title="Règles métier" />
        <CardBody>
          <SettingsForm defaults={{
            w_demonstrated_skills: w.demonstrated_skills ?? 40, w_assessments: w.assessments ?? 25, w_projects: w.projects ?? 15, w_education: w.education ?? 10, w_experience: w.experience ?? 10,
            max_cv_size_mb: Number(s["documents.max_cv_size_mb"] ?? 5), phone_required: s["registration.phone_required"] === true, partner_requires_validation: s["offers.partner_requires_validation"] !== false,
            auto_max_level: s["assessments.auto_max_level"] ?? "avance", insertion_window_months: Number(s["reports.insertion_window_months"] ?? 6),
          }} />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="État des intégrations externes" description="Lecture seule : ces valeurs se configurent par variables d'environnement côté serveur (aucun secret n'est affiché)." />
        <CardBody className="space-y-2">
          {integ.map((i) => <div key={i.name} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"><span className="font-medium text-navy-900">{i.name}</span><span className="flex items-center gap-2 text-xs text-muted">{i.detail} <Badge tone={i.ok ? "green" : "amber"}>{i.ok ? "Actif" : "À configurer"}</Badge></span></div>)}
          <Alert tone="info">Voir docs/INTEGRATIONS.md pour la procédure de configuration de chaque service.</Alert>
        </CardBody>
      </Card>
    </div>
  );
}
