import type { Metadata } from "next";
import { Briefcase, GraduationCap, Languages, User } from "lucide-react";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui";
import { requireCandidate } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { loadCandidateBundle } from "@/features/candidates/queries";
import { catalogOptions } from "@/features/catalog/queries";
import { EducationList, ExperienceList, LanguageList, ProfileForm } from "./profile-client";
import { experienceTypeLabel } from "@/lib/labels";

export const metadata: Metadata = { title: "Mon profil" };

const sourceBadge = (source: string) => (source === "extraction_cv_validee" ? [{ label: "Issu du CV (validé)", tone: "purple" as const }] : []);

export default async function ProfilePage() {
  const ctx = await requireCandidate();
  const supabase = await createClient();
  const [b, { domains }] = await Promise.all([loadCandidateBundle(supabase, ctx.candidateId), catalogOptions()]);
  if (!b) return null;
  const c = b.candidate;

  return (
    <div className="space-y-6">
      <PageHeader title="Mon profil" description="Vos informations professionnelles. Seuls vous et l'équipe YEN habilitée y avez accès ; un partenaire n'y accède qu'avec votre consentement ou votre candidature." />
      <Card>
        <CardHeader icon={User} title="Informations générales" />
        <CardBody>
          <ProfileForm
            domains={domains}
            defaults={{
              first_name: b.person?.first_name ?? "", last_name: b.person?.last_name ?? "", phone: b.person?.phone ?? "", city: b.person?.city ?? "", country: b.person?.country ?? "Guinée",
              status: c.status, institution: c.institution ?? "", yen_program: c.yen_program ?? "", education_level: c.education_level ?? "", graduation_year: c.graduation_year,
              primary_domain_id: c.primary_domain_id ?? "", availability: c.availability, interest_area: c.interest_area ?? "", opportunity_types: c.opportunity_types,
              headline: c.headline ?? "", summary: c.summary ?? "", linkedin_url: c.linkedin_url ?? "", github_url: c.github_url ?? "", portfolio_url: c.portfolio_url ?? "",
            }}
          />
        </CardBody>
      </Card>

      <Card id="formations">
        <CardHeader icon={GraduationCap} title="Formations et diplômes" />
        <CardBody>
          <EducationList
            items={b.education.map((e) => ({
              id: e.id, title: e.degree, subtitle: [e.institution, e.field_of_study, [e.start_year, e.end_year].filter(Boolean).join(" – ")].filter(Boolean).join(" · "),
              description: e.description ?? undefined,
              badges: [...(e.is_yen_program ? [{ label: "Formation YEN", tone: "teal" as const }] : []), ...sourceBadge(e.source)],
              values: { ...e, field_of_study: e.field_of_study ?? "", description: e.description ?? "" },
            }))}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader icon={Briefcase} title="Expériences, stages et réalisations" />
        <CardBody>
          <ExperienceList
            domains={domains}
            items={b.experiences.map((e) => ({
              id: e.id, title: `${e.title} — ${e.organization}`,
              subtitle: `${experienceTypeLabel[e.experience_type as keyof typeof experienceTypeLabel] ?? e.experience_type} · ${formatDate(e.start_date)} → ${e.is_current ? "aujourd'hui" : formatDate(e.end_date)}`,
              description: [e.description, e.achievements && `Réalisations : ${e.achievements}`].filter(Boolean).join("\n") || undefined,
              badges: sourceBadge(e.source),
              values: { ...e, city: e.city ?? "", end_date: e.end_date ?? "", description: e.description ?? "", achievements: e.achievements ?? "", domain_id: e.domain_id ?? "" },
            }))}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader icon={Languages} title="Langues" />
        <CardBody>
          <LanguageList items={b.languages.map((l) => ({ id: l.id, title: l.language, subtitle: l.proficiency, values: l }))} />
        </CardBody>
      </Card>
    </div>
  );
}
