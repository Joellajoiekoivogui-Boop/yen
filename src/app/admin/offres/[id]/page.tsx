import { notFound } from "next/navigation";
import Link from "next/link";
import { ActionButton } from "@/components/forms/action-button";
import { OfferForm } from "@/components/forms/offer-form";
import { MatchDetails } from "@/components/match-details";
import { Alert, Badge, Card, CardBody, CardHeader, PageHeader, ScorePill, TabLinks, Table, Td, Th } from "@/components/ui";
import { requireStaff } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { applicationStatusLabel, offerStatusLabel, type ApplicationStatus, type OfferStatus, type SkillLevel } from "@/lib/labels";
import { formatDate, isUuid, param } from "@/lib/utils";
import { rankCandidatesFor } from "@/features/admin/talents";
import { associateCandidateAction, updateApplicationStatusAction } from "@/features/applications/actions";
import { loadOfferTarget } from "@/features/matching/loader";
import { WEIGHT_LABELS } from "@/features/matching/engine";
import { saveOfferAction, setOfferStatusAction } from "@/features/offers/actions";
import { offerFormOptions } from "../options";

export default async function AdminOfferPage(props: PageProps<"/admin/offres/[id]">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  if (!isUuid(id)) notFound();
  const ctx = await requireStaff("offers.manage");
  const tab = ["classement", "candidatures", "modifier"].includes(param(sp.onglet) ?? "") ? param(sp.onglet)! : "classement";
  const supabase = await createClient();
  const { data: o } = await supabase
    .from("job_offers")
    .select("*, organizations(name), job_required_skills(skill_id, required_level, is_mandatory)")
    .eq("id", id)
    .maybeSingle();
  if (!o) notFound();
  const status = o.status as OfferStatus;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={(o.organizations as unknown as { name: string } | null)?.name}
        title={<span className="inline-flex items-center gap-2">{o.title} {o.is_demo && <Badge tone="purple">Démo</Badge>}</span>}
        description={`Date limite : ${formatDate(o.deadline)} · ${o.positions} place(s)`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={status === "publiee" ? "green" : status === "en_validation" ? "amber" : "neutral"}>{offerStatusLabel[status]}</Badge>
            {status !== "publiee" && <ActionButton variant="secondary" action={setOfferStatusAction.bind(null, id, "publiee")}>{status === "en_validation" ? "Valider et publier" : "Publier"}</ActionButton>}
            {status === "publiee" && <ActionButton action={setOfferStatusAction.bind(null, id, "pourvue")}>Marquer pourvue</ActionButton>}
            {status === "publiee" && <ActionButton action={setOfferStatusAction.bind(null, id, "fermee")}>Fermer</ActionButton>}
            {status === "en_validation" && <ActionButton action={setOfferStatusAction.bind(null, id, "brouillon")}>Renvoyer en brouillon</ActionButton>}
            {status !== "archivee" && <ActionButton variant="ghost" confirm="Archiver cette offre ?" action={setOfferStatusAction.bind(null, id, "archivee")}>Archiver</ActionButton>}
          </div>
        }
      />
      <TabLinks active={tab} tabs={[{ key: "classement", label: "Classement intelligent", href: `/admin/offres/${id}` }, { key: "candidatures", label: "Candidatures et présélection", href: `/admin/offres/${id}?onglet=candidatures` }, { key: "modifier", label: "Modifier l'offre", href: `/admin/offres/${id}?onglet=modifier` }]} />
      {tab === "classement" && <Ranking />}
      {tab === "candidatures" && <Applications />}
      {tab === "modifier" && <Edit />}
    </div>
  );

  async function Ranking() {
    const target = await loadOfferTarget(supabase, id);
    if (!target) return null;
    if (!target.requirements.length) return <Alert tone="warning">Définissez les compétences requises de l&apos;offre pour obtenir un classement pertinent.</Alert>;
    const onlyMandatory = param(sp.obligatoires) === "1";
    const onlyEvaluated = param(sp.evaluees) === "1";
    let ranked = await rankCandidatesFor(supabase, target, { offerId: id, includeDemo: param(sp.demo) === "1" });
    if (onlyMandatory) ranked = ranked.filter((r) => r.match.meetsMandatory);
    if (onlyEvaluated) ranked = ranked.filter((r) => r.match.requirements.some((q) => q.demonstratedLevel));
    const top = ranked.slice(0, 50);
    return (
      <div className="space-y-4">
        <Alert tone="info">
          Vivier : candidats ayant consenti à la visibilité dans le vivier YEN, et candidats ayant postulé. Le classement est explicable et révisable ; il ne constitue jamais une décision de recrutement.
          Pondération appliquée : {Object.entries(target.weights).map(([k, v]) => `${WEIGHT_LABELS[k as keyof typeof WEIGHT_LABELS]} ${v}`).join(" · ")}.
        </Alert>
        <form className="flex flex-wrap gap-4 text-sm" method="get">
          <label className="flex items-center gap-1.5"><input type="checkbox" name="obligatoires" value="1" defaultChecked={onlyMandatory} className="accent-electric-600" /> Exigences obligatoires satisfaites</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" name="evaluees" value="1" defaultChecked={onlyEvaluated} className="accent-electric-600" /> Au moins une compétence requise évaluée</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" name="demo" value="1" defaultChecked={param(sp.demo) === "1"} className="accent-electric-600" /> Inclure la démo</label>
          <button className="rounded-md border border-border bg-white px-3 py-1 font-medium">Appliquer</button>
        </form>
        {top.length === 0 && <Alert tone="warning">Aucun candidat du vivier ne correspond pour l&apos;instant.</Alert>}
        <div className="space-y-3">
          {top.map((r, i) => (
            <Card key={r.candidateId}>
              <details>
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <span className="flex items-center gap-3">
                    <span className="w-6 text-right text-sm font-bold text-muted tabular-nums">{i + 1}</span>
                    <ScorePill score={r.match.score} confidence={r.match.confidenceLabel} />
                    <span>
                      <Link href={`/admin/talents/${r.candidateId}`} className="font-medium text-navy-900 hover:underline">{r.name}</Link>
                      <span className="ml-2 font-mono text-xs text-muted">{r.publicCode}</span>
                      {r.isDemo && <Badge tone="purple" className="ml-1">Démo</Badge>}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    {!r.match.meetsMandatory && <Badge tone="amber">Obligatoire manquant</Badge>}
                    {r.applied && <Badge tone="teal">A postulé</Badge>}
                    {r.applicationStatus && <Badge tone="blue">{applicationStatusLabel[r.applicationStatus as ApplicationStatus]}</Badge>}
                    {!r.consentShare && <Badge>Partage non consenti</Badge>}
                  </span>
                </summary>
                <div className="grid gap-4 border-t border-border px-5 py-4 lg:grid-cols-[1fr_260px]">
                  <MatchDetails match={r.match} />
                  <div className="space-y-2">
                    {!r.applicationStatus && ctx.permissions.has("applications.manage") && (
                      <ActionButton variant="secondary" action={associateCandidateAction.bind(null, { offerId: id, candidateId: r.candidateId, note: `Classement : ${r.match.score}/100 (confiance ${r.match.confidenceLabel})` })}>Présélectionner</ActionButton>
                    )}
                    <p className="text-xs text-muted">Raisons : {r.match.strengths.slice(0, 3).join(" ; ") || "aucune preuve sur les compétences requises"}</p>
                    {r.match.gaps.length > 0 && <p className="text-xs text-muted">Éléments manquants : {r.match.gaps.slice(0, 3).join(" ; ")}</p>}
                  </div>
                </div>
              </details>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  async function Applications() {
    const { data } = await supabase
      .from("applications")
      .select("id, status, origin, submitted_at, visible_to_partner, partner_shortlisted, match_snapshot, candidate_profiles(id, public_code, is_demo, profiles!candidate_profiles_user_id_fkey(first_name, last_name))")
      .eq("offer_id", id)
      .order("submitted_at", { ascending: false });
    return (
      <Card>
        <CardHeader title="Candidatures et présélections" description="« Proposer au partenaire » rend le profil visible de l'organisation (consentement requis pour une présélection YEN)." />
        <CardBody>
          <Table>
            <thead><tr><Th>Candidat</Th><Th>Origine</Th><Th>Compatibilité</Th><Th>Statut</Th><Th>Partenaire</Th><Th>Actions</Th></tr></thead>
            <tbody>
              {(data ?? []).map((a) => {
                const c = a.candidate_profiles as unknown as { id: string; public_code: string; is_demo: boolean; profiles: { first_name: string; last_name: string } };
                const snap = a.match_snapshot as { score?: number } | null;
                const st = a.status as ApplicationStatus;
                return (
                  <tr key={a.id}>
                    <Td><Link href={`/admin/talents/${c.id}?onglet=candidatures`} className="font-medium text-navy-900 hover:underline">{c.profiles.first_name} {c.profiles.last_name}</Link><div className="font-mono text-xs text-muted">{c.public_code}</div></Td>
                    <Td>{a.origin === "yen" ? "YEN" : `Candidature ${formatDate(a.submitted_at)}`}</Td>
                    <Td>{snap?.score != null ? <ScorePill score={snap.score} /> : "—"}</Td>
                    <Td><Badge tone="blue">{applicationStatusLabel[st]}</Badge></Td>
                    <Td className="text-xs">{a.visible_to_partner ? "Visible" : "Non transmis"}{a.partner_shortlisted && <Badge tone="teal" className="ml-1">Retenu</Badge>}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {["soumise", "en_revue", "preselectionnee"].includes(st) && <ActionButton action={updateApplicationStatusAction.bind(null, { applicationId: a.id, status: "proposee_partenaire" })}>Proposer au partenaire</ActionButton>}
                        {st === "soumise" && <ActionButton variant="ghost" action={updateApplicationStatusAction.bind(null, { applicationId: a.id, status: "preselectionnee" })}>Présélectionner</ActionButton>}
                        <Link href={`/admin/talents/${c.id}?onglet=candidatures`} className="px-2 text-xs text-electric-700 hover:underline">Décision / entretien</Link>
                      </div>
                    </Td>
                  </tr>
                );
              })}
              {(data ?? []).length === 0 && <tr><Td colSpan={6} className="text-center text-muted">Aucune candidature pour l&apos;instant. Utilisez le classement intelligent pour présélectionner des candidats.</Td></tr>}
            </tbody>
          </Table>
        </CardBody>
      </Card>
    );
  }

  async function Edit() {
    const opts = await offerFormOptions();
    const w = o.scoring_weights as Record<string, number> | null;
    return (
      <Card>
        <CardBody>
          <OfferForm
            {...opts}
            action={saveOfferAction}
            showWeights
            redirectBase="/admin/offres"
            defaults={{
              id: o.id, organization_id: o.organization_id, title: o.title, description: o.description, offer_type: o.offer_type, domain_id: o.domain_id, occupation_id: o.occupation_id,
              education_level: o.education_level, min_experience_months: o.min_experience_months, location: o.location, remote_policy: o.remote_policy, deadline: o.deadline,
              positions: o.positions, special_conditions: o.special_conditions,
              skills: ((o.job_required_skills ?? []) as { skill_id: string; required_level: SkillLevel; is_mandatory: boolean }[]),
              w_demonstrated_skills: w?.demonstrated_skills ?? null, w_assessments: w?.assessments ?? null, w_projects: w?.projects ?? null, w_education: w?.education ?? null, w_experience: w?.experience ?? null,
            }}
          />
        </CardBody>
      </Card>
    );
  }
}
