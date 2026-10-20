import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Award, Brain, Download, Eye, FileText, Flag, GraduationCap, Mail, MapPin, MessageCircle, Phone, ShieldCheck, ShieldX, Sparkles, Target } from "lucide-react";
import { ProfileAnalysisView, type AnalysisRow } from "@/components/ai-analysis-view";
import { ActionButton } from "@/components/forms/action-button";
import { MatchDetails } from "@/components/match-details";
import { Alert, Badge, ButtonLink, Card, CardBody, CardHeader, DefinitionList, DemoBadge, EmptyState, PageHeader, ProgressBar, TabLinks, Table, Td, Th } from "@/components/ui";
import { requireStaff } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  applicationStatusLabel, attemptStatusLabel, availabilityLabel, candidateStatusLabel, confidenceLabel, consentLabel, experienceTypeLabel, levelLabel, opportunityLabel, pipelineLabel,
  skillSourceLabel, type ApplicationStatus, type Availability, type OpportunityType, type PipelineStatus,
} from "@/lib/labels";
import { cn, formatDate, formatDateTime, fullName, isUuid, param } from "@/lib/utils";
import { completionOf, loadCandidateBundle } from "@/features/candidates/queries";
import { aggregateDemonstrated } from "@/features/candidates/skills";
import { recomputeAnalysisAction, staffAnalyzeProfileAction, staffManagerSummaryAction } from "@/features/ai/actions";
import { isAIConfigured } from "@/features/ai/provider";
import { setCertificationStatusAction, setEvidenceStatusAction } from "@/features/assessments/actions";
import { deleteInternalNoteAction } from "@/features/admin/actions";
import { revokeShareAction } from "@/features/applications/actions";
import { computeMatch, rankMatches } from "@/features/matching/engine";
import { loadEvidence, loadOccupationTargets } from "@/features/matching/loader";
import {
  AnalysisReviewForm, ApplicationStatusForm, AssociateForm, EvidenceForm, FollowUpForm, InfoRequestForm, InterviewForm, NoteForm, ShareForm, VerifyProjectForm,
} from "./staff-actions";

const TABS = [
  ["apercu", "Dossier complet"], ["cv", "CV"], ["formation", "Formation et certificats"], ["experiences", "Expériences"], ["declarees", "Compétences déclarées"],
  ["demontrees", "Compétences démontrées"], ["tests", "Résultats des tests"], ["projets", "Projets"], ["analyse", "Analyse IA"], ["metiers", "Métiers compatibles"],
  ["candidatures", "Candidatures"], ["suivi", "Suivi professionnel"],
] as const;

export default async function TalentDetailPage(props: PageProps<"/admin/talents/[id]">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  if (!isUuid(id)) notFound();
  const ctx = await requireStaff("candidates.read");
  const can = (p: Parameters<typeof ctx.permissions.has>[0]) => ctx.permissions.has(p);
  const tab = (TABS.find(([k]) => k === param(sp.onglet))?.[0] ?? "apercu") as (typeof TABS)[number][0];
  const supabase = await createClient();
  const b = await loadCandidateBundle(supabase, id);
  if (!b) notFound();
  const c = b.candidate;
  const demonstrated = aggregateDemonstrated(b.skillAssessments);
  const completion = completionOf(b);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={<span className="font-mono">{c.public_code}</span>}
        title={<span className="inline-flex flex-wrap items-center gap-2">{fullName(b.person)} {c.is_demo && <DemoBadge />} {c.review_flag && <Badge tone="amber"><Flag className="size-3" aria-hidden /> À vérifier</Badge>}</span>}
        description={[c.headline, c.engineering_domains?.name, b.person?.city].filter(Boolean).join(" · ")}
        actions={<Badge tone="blue" className="text-sm">{pipelineLabel[c.pipeline_status as PipelineStatus]}</Badge>}
      />
      {c.review_flag && c.review_flag_reason && <Alert tone="warning" title="Profil à vérifier">{c.review_flag_reason}</Alert>}
      <TabLinks active={tab} tabs={TABS.map(([key, label]) => ({ key, label, href: `/admin/talents/${id}?onglet=${key}` }))} />

      {tab === "apercu" && <Overview />}
      {tab === "cv" && <CvTab />}
      {tab === "formation" && <EducationTab />}
      {tab === "experiences" && <ExperienceTab />}
      {tab === "declarees" && <DeclaredTab />}
      {tab === "demontrees" && <DemonstratedTab />}
      {tab === "tests" && <TestsTab />}
      {tab === "projets" && <ProjectsTab />}
      {tab === "analyse" && <AnalysisTab />}
      {tab === "metiers" && <OccupationsTab />}
      {tab === "candidatures" && <ApplicationsTab />}
      {tab === "suivi" && <FollowUpTab />}
    </div>
  );

  /* ------------------------------------------------------------------------ */
  async function Overview() {
    const [notes, infoReqs, files] = await Promise.all([
      can("notes.manage") ? supabase.from("internal_notes").select("id, note_type, body, created_at, author_id, profiles!internal_notes_author_id_fkey(first_name, last_name)").eq("candidate_id", id).order("created_at", { ascending: false }).limit(50) : Promise.resolve({ data: [] }),
      supabase.from("info_requests").select("id, message, response, status, created_at").eq("candidate_id", id).order("created_at", { ascending: false }),
      certificateFiles(),
    ]);
    const links = [["LinkedIn", c.linkedin_url], ["Portfolio", c.portfolio_url], ["GitHub", c.github_url]].filter(([, url]) => url) as [string, string][];
    return (
      <div className="space-y-6">
        <Contact />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="min-w-0 space-y-6 lg:col-span-2">
            <Card>
              <CardHeader title="Profil" />
              <CardBody className="space-y-4">
                <DefinitionList items={[
                  { label: "Statut", value: candidateStatusLabel[c.status] },
                  { label: "Domaine principal", value: c.engineering_domains?.name ?? "—" },
                  { label: "Disponibilité", value: availabilityLabel[c.availability as Availability] },
                  { label: "Opportunités recherchées", value: c.opportunity_types.map((o) => opportunityLabel[o as OpportunityType]).join(", ") || "—" },
                  { label: "Projet professionnel", value: c.interest_area ?? "—" },
                  { label: "Inscription", value: formatDate(c.created_at) },
                  { label: "Dernière activité", value: formatDateTime(c.last_activity_at) },
                ]} />
                {c.summary && <p className="text-sm whitespace-pre-line text-slate-700">{c.summary}</p>}
                {links.length > 0 && (
                  <p className="flex flex-wrap gap-3 text-sm">
                    {links.map(([label, url]) => <a key={label} href={url} target="_blank" rel="noopener noreferrer nofollow" className="font-medium text-electric-700 hover:underline">{label}</a>)}
                  </p>
                )}
                <div>
                  <p className="text-xs text-muted">Complétion du profil : {completion.percent} % (n&apos;est pas une mesure de compétence)</p>
                  <ProgressBar value={completion.percent} className="mt-1 max-w-sm" label="Complétion" />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(consentLabel).map(([k, v]) => <Badge key={k} tone={b!.consents[k] ? "green" : "neutral"}>{b!.consents[k] ? "✓" : "✗"} {v.title}</Badge>)}
                </div>
              </CardBody>
            </Card>
            <Card>
              <CardHeader title={<span className="inline-flex items-center gap-2"><GraduationCap className="size-5 text-gold-600" aria-hidden /> Formations suivies</span>} />
              <CardBody><Education /></CardBody>
            </Card>
            <Card>
              <CardHeader title={<span className="inline-flex items-center gap-2"><Award className="size-5 text-gold-600" aria-hidden /> Certificats</span>} description="Justificatifs en PDF ou en image : cliquez sur une miniature pour l'ouvrir." />
              <CardBody><Certifications files={files} /></CardBody>
            </Card>
            <Card>
              <CardHeader title={<span className="inline-flex items-center gap-2"><Target className="size-5 text-gold-600" aria-hidden /> Compétences</span>} description="« Déclaré » : saisi par le candidat. « Démontré » : confirmé par une évaluation, un projet vérifié ou un évaluateur." />
              <CardBody><Skills /></CardBody>
            </Card>
            {can("notes.manage") && (
              <Card>
                <CardHeader title="Notes internes" description="Visibles uniquement par le personnel YEN habilité." />
                <CardBody className="space-y-4">
                  <NoteForm candidateId={id} />
                  <ul className="space-y-2">
                    {(notes.data ?? []).map((n) => (
                      <li key={n.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                        <div className="flex justify-between gap-2 text-xs text-muted">
                          <span><Badge>{n.note_type}</Badge> {fullName(n.profiles as unknown as { first_name: string; last_name: string })} · {formatDateTime(n.created_at)}</span>
                          {n.author_id === ctx.userId && <ActionButton variant="ghost" confirm="Supprimer cette note ?" action={deleteInternalNoteAction.bind(null, n.id, id)}>Supprimer</ActionButton>}
                        </div>
                        <p className="mt-1 whitespace-pre-line text-slate-800">{n.body}</p>
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            )}
          </div>
          <div className="min-w-0 space-y-6">
            <Card>
              <CardHeader title={<span className="inline-flex items-center gap-2"><FileText className="size-5 text-gold-600" aria-hidden /> CV</span>} />
              <CardBody><CurrentCv /></CardBody>
            </Card>
            <Card>
              <CardHeader title="Synthèse des preuves" />
              <CardBody className="space-y-2 text-sm">
                <p><strong className="tabular-nums">{Object.keys(demonstrated).length}</strong> compétence(s) démontrée(s)</p>
                <p><strong className="tabular-nums">{b!.declaredSkills.filter((d) => !demonstrated[d.skill_id]).length}</strong> compétence(s) déclarée(s) à confirmer</p>
                <p><strong className="tabular-nums">{b!.projects.length}</strong> projet(s), dont {b!.projects.filter((p) => p.verification_status === "verifie").length} vérifié(s)</p>
                <p><strong className="tabular-nums">{b!.certifications.length}</strong> certification(s), dont {b!.certifications.filter((ce) => ce.verification_status === "verifie").length} vérifiée(s)</p>
                <p><strong className="tabular-nums">{b!.experiences.length}</strong> expérience(s)</p>
              </CardBody>
            </Card>
            {can("candidates.manage") && (
              <Card>
                <CardHeader title="Demander des informations" />
                <CardBody className="space-y-3">
                  <InfoRequestForm candidateId={id} />
                  {(infoReqs.data ?? []).map((r) => (
                    <div key={r.id} className="rounded-md border border-border p-2 text-xs">
                      <p className="text-muted">{formatDate(r.created_at)} · {r.status}</p>
                      <p className="text-slate-700">{r.message}</p>
                      {r.response && <p className="mt-1 text-gold-800">Réponse : {r.response}</p>}
                    </div>
                  ))}
                </CardBody>
              </Card>
            )}
          </div>
        </div>
      </div>
    );
  }

  /** Coordonnées : visibles uniquement par le personnel YEN (jamais transmises aux partenaires). */
  function Contact() {
    const p = b!.person;
    return (
      <Card className="overflow-hidden">
        <div className="grid divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="p-4">
            <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted uppercase"><Phone className="size-3.5" aria-hidden /> Téléphone</p>
            {p?.phone ? (
              <>
                <a href={telHref(p.phone)} className="mt-1 block text-lg font-semibold text-navy-900 tabular-nums hover:underline">{p.phone}</a>
                <div className="mt-2 flex flex-wrap gap-2">
                  <ButtonLink href={telHref(p.phone)} size="sm" variant="secondary"><Phone className="size-3.5" aria-hidden /> Appeler</ButtonLink>
                  <ButtonLink href={whatsappHref(p.phone)} size="sm" variant="outline" target="_blank" rel="noopener noreferrer"><MessageCircle className="size-3.5" aria-hidden /> WhatsApp</ButtonLink>
                </div>
              </>
            ) : (
              <>
                <p className="mt-1 font-semibold text-red-700">Numéro manquant</p>
                <p className="text-xs text-muted">Le candidat est invité à l&apos;ajouter dans son espace ; il ne peut pas postuler sans numéro.</p>
              </>
            )}
          </div>
          <div className="min-w-0 p-4">
            <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted uppercase"><Mail className="size-3.5" aria-hidden /> E-mail</p>
            {p?.email ? (
              <>
                <a href={`mailto:${p.email}`} className="mt-1 block truncate text-sm font-semibold text-navy-900 hover:underline">{p.email}</a>
                <ButtonLink href={`mailto:${p.email}`} size="sm" variant="outline" className="mt-2"><Mail className="size-3.5" aria-hidden /> Écrire</ButtonLink>
              </>
            ) : <p className="mt-1 text-sm text-muted">—</p>}
          </div>
          <div className="p-4">
            <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted uppercase"><MapPin className="size-3.5" aria-hidden /> Localisation</p>
            <p className="mt-1 text-sm font-semibold text-navy-900">{[p?.city, p?.country].filter(Boolean).join(", ") || "—"}</p>
          </div>
        </div>
      </Card>
    );
  }

  function CurrentCv() {
    const cv = b!.currentCv;
    if (!cv) return <EmptyState icon={FileText} title="Aucun CV déposé" />;
    if (!can("documents.read")) return <Alert tone="warning">Votre rôle ne permet pas d&apos;accéder aux documents.</Alert>;
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="grid h-14 w-11 shrink-0 place-items-center rounded-lg bg-red-50 text-red-600 ring-1 ring-red-100"><FileText className="size-5" aria-hidden /></span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-navy-900">{cv.original_filename}</p>
            <p className="text-xs text-muted">v{cv.version} · {formatDate(cv.created_at)} · {(cv.size_bytes / 1024 / 1024).toFixed(2).replace(".", ",")} Mo{cv.page_count ? ` · ${cv.page_count} page(s)` : ""}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href={`/api/documents/${cv.id}?inline=1`} target="_blank" rel="noopener" size="sm" variant="secondary" prefetch={false}><Eye className="size-3.5" aria-hidden /> Voir</ButtonLink>
          <ButtonLink href={`/api/documents/${cv.id}`} size="sm" variant="outline" prefetch={false}><Download className="size-3.5" aria-hidden /> Télécharger</ButtonLink>
        </div>
        <Link href={`/admin/talents/${id}?onglet=cv`} className="block text-xs text-electric-700 hover:underline">Versions précédentes</Link>
      </div>
    );
  }

  function Education() {
    return (
      <div className="space-y-4">
        <DefinitionList items={[
          { label: "Formation suivie chez YEN", value: c.yen_program ?? "—" },
          { label: "Établissement", value: c.institution ?? "—" },
          { label: "Niveau d'études", value: c.education_level ?? "—" },
          { label: "Année de formation / diplomation", value: c.graduation_year ?? "—" },
        ]} />
        {b!.education.length > 0 ? (
          <ol className="space-y-3 border-l-2 border-navy-100 pl-4">
            {b!.education.map((e) => (
              <li key={e.id} className="relative text-sm">
                <span aria-hidden className={cn("absolute top-1.5 -left-[1.4rem] size-3 rounded-full ring-4 ring-white", e.is_yen_program ? "bg-gold-400" : "bg-navy-400")} />
                <p className="font-medium text-navy-900">{e.degree} {e.is_yen_program && <Badge tone="gold">YEN</Badge>} {e.source === "extraction_cv_validee" && <Badge tone="purple">Issu du CV</Badge>}</p>
                <p className="text-muted">{[e.institution, e.field_of_study, [e.start_year, e.end_year].filter(Boolean).join("–")].filter(Boolean).join(" · ")}</p>
                {e.description && <p className="mt-0.5 text-xs whitespace-pre-line text-slate-600">{e.description}</p>}
              </li>
            ))}
          </ol>
        ) : <p className="text-sm text-muted">Aucune autre formation renseignée.</p>}
      </div>
    );
  }

  /** Métadonnées des justificatifs (type, nom) pour afficher une miniature ou une icône PDF. */
  async function certificateFiles(): Promise<Map<string, { mime: string; filename: string }>> {
    const ids = b!.certifications.map((ce) => ce.document_id).filter(Boolean) as string[];
    if (!ids.length || !can("documents.read")) return new Map();
    const { data } = await supabase.from("candidate_documents").select("id, mime_type, original_filename").in("id", ids).is("deleted_at", null);
    return new Map((data ?? []).map((d) => [d.id, { mime: d.mime_type, filename: d.original_filename }]));
  }

  function Certifications({ files }: { files: Map<string, { mime: string; filename: string }> }) {
    if (b!.certifications.length === 0) return <EmptyState icon={Award} title="Aucune certification" description="Le candidat n'a pas encore ajouté de certificat." />;
    return (
      <ul className="space-y-3">
        {b!.certifications.map((ce) => {
          const file = ce.document_id ? files.get(ce.document_id) : undefined;
          const href = file ? `/api/documents/${ce.document_id}?inline=1` : null;
          const st = VERIFICATION[ce.verification_status] ?? VERIFICATION.non_verifie;
          return (
            <li key={ce.id} className="flex flex-wrap gap-3 rounded-xl border border-border p-3 sm:flex-nowrap">
              {file && href ? (
                <a href={href} target="_blank" rel="noopener" className="group block shrink-0 overflow-hidden rounded-lg ring-1 ring-border" title="Ouvrir le justificatif">
                  {file.mime.startsWith("image/") ? (
                    <Image src={href} alt={`Justificatif : ${file.filename}`} width={96} height={68} unoptimized className="h-[68px] w-24 object-cover transition duration-500 group-hover:scale-110" />
                  ) : (
                    <span className="grid h-[68px] w-24 place-items-center bg-red-50 text-red-600"><FileText className="size-6" aria-hidden /><span className="sr-only">Justificatif PDF : {file.filename}</span></span>
                  )}
                </a>
              ) : (
                <span className="grid h-[68px] w-24 shrink-0 place-items-center rounded-lg border border-dashed border-border px-1 text-center text-[11px] text-muted">{ce.document_id ? "Justificatif joint" : "Pas de justificatif"}</span>
              )}
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium text-navy-900">{ce.name} <Badge tone={st.tone}>{st.label}</Badge></p>
                <p className="text-muted">{[ce.issuer, ce.issue_date && `obtenue le ${formatDate(ce.issue_date)}`, ce.expiry_date && `expire le ${formatDate(ce.expiry_date)}`].filter(Boolean).join(" · ")}</p>
                {ce.credential_id && <p className="text-xs text-muted">Identifiant : <span className="font-mono">{ce.credential_id}</span></p>}
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  {href && <a className="font-medium text-electric-700 hover:underline" href={href} target="_blank" rel="noopener">Voir le justificatif</a>}
                  {ce.credential_url && <a className="font-medium text-electric-700 hover:underline" href={ce.credential_url} target="_blank" rel="noopener noreferrer nofollow">Lien de vérification</a>}
                </div>
              </div>
              {can("assessments.review") && (
                <div className="flex w-full flex-wrap justify-end gap-1 sm:w-auto sm:flex-col">
                  {ce.verification_status !== "verifie" && <ActionButton variant="ghost" action={setCertificationStatusAction.bind(null, { id: ce.id, status: "verifie" })}><ShieldCheck className="size-4" aria-hidden /> Vérifier</ActionButton>}
                  {ce.verification_status !== "rejete" && <ActionButton variant="ghost" confirm="Rejeter cette certification ?" action={setCertificationStatusAction.bind(null, { id: ce.id, status: "rejete" })}><ShieldX className="size-4" aria-hidden /> Rejeter</ActionButton>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    );
  }

  function Skills() {
    const declaredIds = new Set(b!.declaredSkills.map((d) => d.skill_id));
    const names = new Map(b!.skillAssessments.map((s) => [s.skill_id, s.skills?.name ?? "—"]));
    const demonstratedOnly = Object.entries(demonstrated).filter(([skillId]) => !declaredIds.has(skillId));
    if (!b!.declaredSkills.length && !demonstratedOnly.length) return <EmptyState icon={Target} title="Aucune compétence renseignée" />;
    return (
      <div className="space-y-3">
        <ul className="grid gap-2 sm:grid-cols-2">
          {b!.declaredSkills.map((d) => {
            const dem = demonstrated[d.skill_id];
            return (
              <li key={d.id} className="rounded-lg border border-border px-3 py-2 text-sm">
                <p className="font-medium text-navy-900">{d.skills?.name}{d.years_experience != null && <span className="text-xs font-normal text-muted"> · {d.years_experience} an(s)</span>}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  <Badge>Déclaré : {levelLabel[d.self_level]}</Badge>
                  {dem ? <Badge tone="gold">Démontré : {levelLabel[dem.level]}</Badge> : <Badge tone="amber">À confirmer</Badge>}
                </div>
              </li>
            );
          })}
          {demonstratedOnly.map(([skillId, dem]) => (
            <li key={skillId} className="rounded-lg border border-gold-200 bg-gold-50/40 px-3 py-2 text-sm">
              <p className="font-medium text-navy-900">{names.get(skillId)}</p>
              <div className="mt-1 flex flex-wrap gap-1"><Badge tone="gold">Démontré : {levelLabel[dem.level]}</Badge></div>
            </li>
          ))}
        </ul>
        {b!.languages.length > 0 && <p className="text-sm text-slate-700"><strong className="font-medium text-navy-900">Langues :</strong> {b!.languages.map((l) => `${l.language} (${l.proficiency})`).join(" · ")}</p>}
      </div>
    );
  }

  async function CvTab() {
    const { data: docs } = await supabase.from("candidate_documents").select("id, original_filename, version, is_current, created_at, deleted_at, scan_status, text_extraction_status, size_bytes").eq("candidate_id", id).eq("kind", "cv").order("version", { ascending: false });
    return (
      <Card>
        <CardHeader title="CV" description="Toutes les versions déposées. Lien temporaire ; chaque accès est journalisé. Les justificatifs de certification sont dans l'onglet « Formation et certificats »." />
        <CardBody>
          {!can("documents.read") ? <Alert tone="warning">Votre rôle ne permet pas d&apos;accéder aux documents.</Alert> : (
            <Table>
              <thead><tr><Th>Version</Th><Th>Fichier</Th><Th>Date</Th><Th>Contrôles</Th><Th /></tr></thead>
              <tbody>
                {(docs ?? []).map((d) => (
                  <tr key={d.id}>
                    <Td>v{d.version} {d.is_current && <Badge tone="gold">Actuel</Badge>}</Td>
                    <Td>{d.original_filename}</Td>
                    <Td>{formatDateTime(d.created_at)}</Td>
                    <Td className="text-xs">{d.scan_status} · {d.text_extraction_status}</Td>
                    <Td className="text-right">{d.deleted_at ? <Badge tone="red">Supprimé</Badge> : (
                      <div className="flex justify-end gap-1.5">
                        <ButtonLink href={`/api/documents/${d.id}?inline=1`} target="_blank" rel="noopener" size="sm" variant="ghost" prefetch={false}><Eye className="size-3.5" aria-hidden /> Voir</ButtonLink>
                        <ButtonLink href={`/api/documents/${d.id}`} size="sm" variant="outline" prefetch={false}><Download className="size-3.5" aria-hidden /> Télécharger</ButtonLink>
                      </div>
                    )}</Td>
                  </tr>
                ))}
                {(docs ?? []).length === 0 && <tr><Td colSpan={5} className="text-center text-muted">Aucun document.</Td></tr>}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>
    );
  }

  async function EducationTab() {
    const files = await certificateFiles();
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Formations suivies" />
          <CardBody><Education /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Certificats" description="Cliquez sur une miniature pour ouvrir le justificatif." />
          <CardBody className="space-y-4">
            <Certifications files={files} />
            {b!.languages.length > 0 && <p className="text-sm text-slate-700">Langues : {b!.languages.map((l) => `${l.language} (${l.proficiency})`).join(" · ")}</p>}
          </CardBody>
        </Card>
      </div>
    );
  }

  function ExperienceTab() {
    return (
      <Card>
        <CardHeader title="Expériences" />
        <CardBody className="space-y-3">
          {b!.experiences.length === 0 && <EmptyState title="Aucune expérience" />}
          {b!.experiences.map((e) => (
            <div key={e.id} className="rounded-lg border border-border p-3 text-sm">
              <p className="font-medium text-navy-900">{e.title} — {e.organization} <Badge>{experienceTypeLabel[e.experience_type as keyof typeof experienceTypeLabel]}</Badge></p>
              <p className="text-muted">{formatDate(e.start_date)} → {e.is_current ? "aujourd'hui" : formatDate(e.end_date)} {e.city && `· ${e.city}`}</p>
              {e.description && <p className="mt-1 whitespace-pre-line text-slate-700">{e.description}</p>}
              {e.achievements && <p className="mt-1 text-slate-700">Réalisations : {e.achievements}</p>}
            </div>
          ))}
        </CardBody>
      </Card>
    );
  }

  function DeclaredTab() {
    return (
      <Card>
        <CardHeader title="Compétences déclarées" description="Déclarations du candidat : elles ne constituent pas une preuve." />
        <CardBody>
          <Table>
            <thead><tr><Th>Compétence</Th><Th>Auto-évaluation</Th><Th>Années</Th><Th>Source</Th><Th>Démontrée ?</Th></tr></thead>
            <tbody>
              {b!.declaredSkills.map((d) => (
                <tr key={d.id}>
                  <Td className="font-medium text-navy-900">{d.skills?.name}<div className="text-xs text-muted">{d.evidence_note}</div></Td>
                  <Td>{levelLabel[d.self_level]}</Td>
                  <Td>{d.years_experience ?? "—"}</Td>
                  <Td>{d.source === "extraction_cv_validee" ? "CV (validé par le candidat)" : "Saisie"}</Td>
                  <Td>{demonstrated[d.skill_id] ? <Badge tone="gold">{levelLabel[demonstrated[d.skill_id].level]}</Badge> : <Badge tone="amber">À confirmer</Badge>}</Td>
                </tr>
              ))}
              {b!.declaredSkills.length === 0 && <tr><Td colSpan={5} className="text-center text-muted">Aucune compétence déclarée.</Td></tr>}
            </tbody>
          </Table>
        </CardBody>
      </Card>
    );
  }

  async function DemonstratedTab() {
    const { data: skills } = await supabase.from("skills").select("id, name").eq("is_active", true).order("name");
    return (
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Preuves de compétences" />
          <CardBody>
            <Table>
              <thead><tr><Th>Date</Th><Th>Compétence</Th><Th>Niveau</Th><Th>Source</Th><Th>Confiance</Th><Th>Statut</Th>{can("assessments.review") && <Th />}</tr></thead>
              <tbody>
                {b!.skillAssessments.map((s) => (
                  <tr key={s.id}>
                    <Td>{formatDate(s.assessed_at)}</Td>
                    <Td className="font-medium text-navy-900">{s.skills?.name}<div className="text-xs text-muted">{s.notes}</div></Td>
                    <Td>{levelLabel[s.level]}{s.score_percent != null && <span className="text-xs text-muted"> ({Math.round(Number(s.score_percent))} %)</span>}</Td>
                    <Td>{skillSourceLabel[s.source]}</Td>
                    <Td>{confidenceLabel[s.confidence as keyof typeof confidenceLabel]}</Td>
                    <Td><Badge tone={s.status === "valide" ? "green" : s.status === "en_attente" ? "amber" : "neutral"}>{s.status}</Badge></Td>
                    {can("assessments.review") && (
                      <Td className="text-right">
                        <div className="flex justify-end gap-1">
                          {s.status !== "valide" && <ActionButton variant="ghost" action={setEvidenceStatusAction.bind(null, { id: s.id, status: "valide" })}>Valider</ActionButton>}
                          {s.status === "valide" && <ActionButton variant="ghost" action={setEvidenceStatusAction.bind(null, { id: s.id, status: "conteste" })}>Contester</ActionButton>}
                          {s.status !== "invalide" && <ActionButton variant="ghost" confirm="Invalider cette preuve ?" action={setEvidenceStatusAction.bind(null, { id: s.id, status: "invalide" })}>Invalider</ActionButton>}
                        </div>
                      </Td>
                    )}
                  </tr>
                ))}
                {b!.skillAssessments.length === 0 && <tr><Td colSpan={7} className="text-center text-muted">Aucune preuve.</Td></tr>}
              </tbody>
            </Table>
          </CardBody>
        </Card>
        {can("assessments.review") && (
          <Card>
            <CardHeader title="Valider une compétence" description="Entretien technique, observation, portfolio, dépôt de code…" />
            <CardBody><EvidenceForm candidateId={id} skills={(skills ?? []).map((s) => ({ value: s.id, label: s.name }))} projects={b!.projects.map((p) => ({ value: p.id, label: p.title }))} /></CardBody>
          </Card>
        )}
      </div>
    );
  }

  async function TestsTab() {
    const { data } = await supabase.from("assessment_attempts").select("id, status, score_percent, passed, started_at, submitted_at, graded_at, reviewed_by, result_details, assessments(title, level)").eq("candidate_id", id).order("started_at", { ascending: false });
    return (
      <Card>
        <CardHeader title="Résultats des évaluations" />
        <CardBody>
          <Table>
            <thead><tr><Th>Évaluation</Th><Th>Date</Th><Th>Statut</Th><Th>Score</Th><Th>Détail par compétence</Th><Th>Correction</Th></tr></thead>
            <tbody>
              {(data ?? []).map((t) => {
                const a = t.assessments as unknown as { title: string; level: keyof typeof levelLabel };
                const bySkill = (t.result_details as { bySkill?: { name: string; percent: number }[] })?.bySkill ?? [];
                return (
                  <tr key={t.id}>
                    <Td className="font-medium text-navy-900">{a.title}<div className="text-xs text-muted">{levelLabel[a.level]}</div></Td>
                    <Td>{formatDateTime(t.submitted_at ?? t.started_at)}</Td>
                    <Td>{attemptStatusLabel[t.status as keyof typeof attemptStatusLabel]}</Td>
                    <Td className="tabular-nums">{t.score_percent != null ? `${Math.round(Number(t.score_percent))} %${t.passed ? " ✓" : ""}` : "—"}</Td>
                    <Td className="text-xs">{bySkill.map((s) => `${s.name} ${Math.round(s.percent)} %`).join(" · ") || "—"}</Td>
                    <Td className="text-xs">{t.status === "en_correction" && can("assessments.review") ? <Link className="text-electric-700 hover:underline" href={`/admin/corrections/${t.id}`}>Corriger</Link> : t.reviewed_by ? "Humaine" : t.status === "corrige" ? "Automatique" : "—"}</Td>
                  </tr>
                );
              })}
              {(data ?? []).length === 0 && <tr><Td colSpan={6} className="text-center text-muted">Aucune tentative.</Td></tr>}
            </tbody>
          </Table>
        </CardBody>
      </Card>
    );
  }

  function ProjectsTab() {
    return (
      <div className="space-y-4">
        {b!.projects.length === 0 && <EmptyState title="Aucun projet" />}
        {b!.projects.map((p) => (
          <Card key={p.id}>
            <CardHeader title={p.title} description={[p.role, p.technologies.join(", ")].filter(Boolean).join(" · ")} action={<Badge tone={p.verification_status === "verifie" ? "green" : p.verification_status === "rejete" ? "red" : "amber"}>{p.verification_status}</Badge>} />
            <CardBody className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2 text-sm">
                <p className="whitespace-pre-line text-slate-700">{p.description}</p>
                {p.outcomes && <p className="text-slate-700">Résultats : {p.outcomes}</p>}
                <div className="flex flex-wrap gap-1">{p.project_skills.map((s) => <Badge key={s.skill_id} tone="blue">{s.skills?.name}</Badge>)}</div>
                <p className="space-x-3 text-xs">
                  {p.project_url && <a className="text-electric-700 underline" href={p.project_url} target="_blank" rel="noopener noreferrer nofollow">Démonstration</a>}
                  {p.repository_url && <a className="text-electric-700 underline" href={p.repository_url} target="_blank" rel="noopener noreferrer nofollow">Dépôt / portfolio</a>}
                </p>
                {p.verification_note && <p className="text-xs text-muted">Note : {p.verification_note}</p>}
              </div>
              {can("assessments.review") && <VerifyProjectForm projectId={p.id} />}
            </CardBody>
          </Card>
        ))}
      </div>
    );
  }

  async function AnalysisTab() {
    const { data } = await supabase.from("ai_analyses").select("id, kind, status, output, error, created_at, model, provider, prompt_version, validation_status, correction_note, input_refs, superseded_by").eq("candidate_id", id).order("created_at", { ascending: false }).limit(30);
    const aiReady = isAIConfigured();
    const consent = Boolean(b!.consents.traitement_ia);
    const kindLabel: Record<string, string> = { analyse_profil: "Analyse de profil", synthese_responsable: "Synthèse responsable", resume_rapprochement: "Synthèse pour une offre", extraction_cv: "Extraction de CV", amelioration_cv: "Amélioration de CV", plan_progression: "Plan de progression", correction_reponse: "Aide à la correction" };
    return (
      <div className="space-y-4">
        {!aiReady && <Alert tone="info">Le service d&apos;IA n&apos;est pas configuré : aucune nouvelle analyse ne peut être lancée. Les analyses passées restent consultables.</Alert>}
        {aiReady && !consent && <Alert tone="warning">Le candidat n&apos;a pas autorisé l&apos;analyse IA de son profil.</Alert>}
        {aiReady && consent && can("ai.run") && (
          <div className="flex flex-wrap gap-2">
            <ActionButton variant="secondary" size="md" action={staffAnalyzeProfileAction.bind(null, id)}><Brain className="size-4" aria-hidden /> Analyser le profil</ActionButton>
            <ActionButton variant="outline" size="md" action={staffManagerSummaryAction.bind(null, id, undefined)}><Sparkles className="size-4" aria-hidden /> Synthèse pour présélection</ActionButton>
          </div>
        )}
        {(data ?? []).length === 0 && <EmptyState icon={Brain} title="Aucune analyse IA" />}
        {(data ?? []).map((row) => (
          <Card key={row.id}>
            <CardHeader
              title={<span className="inline-flex items-center gap-2">{kindLabel[row.kind] ?? row.kind} {row.superseded_by && <Badge>Remplacée</Badge>} <Badge tone={row.status === "reussi" ? "green" : row.status === "partiel" ? "amber" : "red"}>{row.status}</Badge></span>}
              action={can("ai.run") && aiReady && row.kind !== "correction_reponse" ? <ActionButton action={recomputeAnalysisAction.bind(null, row.id)}>Recalculer</ActionButton> : undefined}
            />
            <CardBody className="space-y-4">
              {row.kind === "analyse_profil" ? <ProfileAnalysisView row={row as AnalysisRow} /> : (
                <div className="space-y-2">
                  <p className="text-xs text-muted">{formatDateTime(row.created_at)} · {row.provider} / {row.model} · prompt {row.prompt_version} · revue : {row.validation_status}</p>
                  {row.error ? <p className="text-sm text-red-700">{row.error}</p> : <SummaryOutput output={row.output} />}
                </div>
              )}
              <details className="text-xs text-muted"><summary className="cursor-pointer">Sources utilisées ({Array.isArray(row.input_refs) ? row.input_refs.length : 0})</summary><pre className="mt-2 max-h-48 overflow-auto rounded bg-slate-50 p-2">{JSON.stringify(row.input_refs, null, 2)}</pre></details>
              {can("ai.review") && row.status !== "echoue" && <div className="border-t border-border pt-3"><AnalysisReviewForm analysisId={row.id} /></div>}
            </CardBody>
          </Card>
        ))}
      </div>
    );
  }

  async function OccupationsTab() {
    const evidence = await loadEvidence(supabase, id, c.primary_domain_id);
    const targets = await loadOccupationTargets(supabase, c.primary_domain_id && param(sp.tous) !== "1" ? { domainIds: [c.primary_domain_id] } : {});
    const ranked = evidence ? rankMatches(targets.map((t) => ({ target: t, match: computeMatch(t, evidence) }))).slice(0, 10) : [];
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted">{c.primary_domain_id && param(sp.tous) !== "1" ? <>Domaine principal uniquement. <Link className="text-electric-700 hover:underline" href={`/admin/talents/${id}?onglet=metiers&tous=1`}>Tous les domaines</Link></> : "Tous les domaines."}</p>
        <div className="grid gap-4 lg:grid-cols-2">
          {ranked.map(({ target, match }) => (
            <Card key={target.id}><CardHeader title={target.title} /><CardBody><MatchDetails match={match} /></CardBody></Card>
          ))}
        </div>
      </div>
    );
  }

  async function ApplicationsTab() {
    const [apps, offers, orgs, shares] = await Promise.all([
      supabase.from("applications").select("id, status, origin, submitted_at, visible_to_partner, decision_reason, match_snapshot, job_offers(id, title, organizations(name)), application_events(id, to_status, note, created_at, visible_to_candidate), interviews(id, scheduled_at, mode, status, outcome)").eq("candidate_id", id).order("updated_at", { ascending: false }),
      supabase.from("job_offers").select("id, title, organizations(name)").eq("status", "publiee").order("published_at", { ascending: false }).limit(200),
      supabase.from("organizations").select("id, name").eq("status", "actif").order("name"),
      supabase.from("profile_shares").select("id, reason, created_at, expires_at, revoked_at, include_cv, organizations(name)").eq("candidate_id", id).order("created_at", { ascending: false }),
    ]);
    const offerOpts = (offers.data ?? []).map((o) => ({ value: o.id, label: `${o.title} — ${(o.organizations as unknown as { name: string } | null)?.name ?? ""}` }));
    return (
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {(apps.data ?? []).length === 0 && <EmptyState title="Aucune candidature" />}
          {(apps.data ?? []).map((a) => {
            const o = a.job_offers as unknown as { id: string; title: string; organizations: { name: string } | null };
            const snap = a.match_snapshot as { score?: number; confidenceLabel?: string } | null;
            return (
              <Card key={a.id}>
                <CardHeader
                  title={<Link href={`/admin/offres/${o.id}`} className="hover:underline">{o.title}</Link>}
                  description={`${o.organizations?.name ?? ""} · ${a.origin === "yen" ? "Présélection YEN" : `Candidature du ${formatDate(a.submitted_at)}`} · ${a.visible_to_partner ? "visible du partenaire" : "non transmise au partenaire"}${snap?.score != null ? ` · compatibilité ${snap.score}/100` : ""}`}
                  action={<Badge tone="blue">{applicationStatusLabel[a.status as ApplicationStatus]}</Badge>}
                />
                <CardBody className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2 text-sm">
                    <ol className="space-y-1">
                      {((a.application_events ?? []) as { id: string; to_status: ApplicationStatus; note: string | null; created_at: string; visible_to_candidate: boolean }[]).sort((x, y) => x.created_at.localeCompare(y.created_at)).map((e) => (
                        <li key={e.id} className="text-xs"><strong>{applicationStatusLabel[e.to_status]}</strong> · {formatDateTime(e.created_at)}{e.note && ` — ${e.note}`}{!e.visible_to_candidate && " (interne)"}</li>
                      ))}
                    </ol>
                    {((a.interviews ?? []) as { id: string; scheduled_at: string; mode: string; status: string; outcome: string | null }[]).map((i) => (
                      <p key={i.id} className="text-xs text-gold-800">Entretien {formatDateTime(i.scheduled_at)} ({i.mode}) — {i.status}{i.outcome ? ` : ${i.outcome}` : ""}</p>
                    ))}
                  </div>
                  {can("applications.manage") && (
                    <div className="space-y-4">
                      <ApplicationStatusForm applicationId={a.id} current={a.status} />
                      <details><summary className="cursor-pointer text-sm font-medium text-electric-700">Programmer un entretien</summary><div className="mt-2"><InterviewForm applicationId={a.id} /></div></details>
                    </div>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
        <div className="space-y-6">
          {can("applications.manage") && <Card><CardHeader title="Associer à une offre" /><CardBody><AssociateForm candidateId={id} offers={offerOpts} /></CardBody></Card>}
          {can("shares.manage") && (
            <Card>
              <CardHeader title="Partager avec un partenaire" />
              <CardBody className="space-y-4">
                <ShareForm candidateId={id} consent={Boolean(b!.consents.partage_partenaires)} organizations={(orgs.data ?? []).map((o) => ({ value: o.id, label: o.name }))} offers={offerOpts} />
                {(shares.data ?? []).map((s) => (
                  <div key={s.id} className="rounded-md border border-border p-2 text-xs">
                    <p className="font-medium text-navy-900">{(s.organizations as unknown as { name: string } | null)?.name}</p>
                    <p className="text-muted">{s.reason} · expire le {formatDate(s.expires_at)} {s.revoked_at && "· révoqué"}</p>
                    {!s.revoked_at && <ActionButton variant="ghost" action={revokeShareAction.bind(null, s.id)}>Révoquer</ActionButton>}
                  </div>
                ))}
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    );
  }

  async function FollowUpTab() {
    const [placements, staff] = await Promise.all([
      supabase.from("placements").select("id, organization_name, position_title, placement_type, contract_type, start_date, end_date, confirmation_status, candidate_feedback, organization_feedback").eq("candidate_id", id).order("start_date", { ascending: false }),
      supabase.from("user_roles").select("user_id, role, profiles!user_roles_user_id_fkey(first_name, last_name)").in("role", ["insertion_manager", "super_admin"]),
    ]);
    const managers = [...new Map((staff.data ?? []).map((s) => [s.user_id, { value: s.user_id, label: fullName(s.profiles as unknown as { first_name: string; last_name: string }) }])).values()];
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        {can("candidates.manage") && (
          <Card>
            <CardHeader title="Suivi" />
            <CardBody>
              <FollowUpForm candidateId={id} managers={managers} defaults={{ pipeline_status: c.pipeline_status, assigned_manager_id: c.assigned_manager_id ?? "", review_flag: c.review_flag, review_flag_reason: c.review_flag_reason ?? "" }} />
            </CardBody>
          </Card>
        )}
        <Card>
          <CardHeader title="Placements" action={can("placements.manage") ? <Link href={`/admin/placements?candidat=${id}`} className="text-sm text-electric-700 hover:underline">Enregistrer un placement</Link> : undefined} />
          <CardBody className="space-y-3">
            {(placements.data ?? []).length === 0 && <p className="text-sm text-muted">Aucun placement enregistré.</p>}
            {(placements.data ?? []).map((p) => (
              <div key={p.id} className="rounded-lg border border-border p-3 text-sm">
                <p className="font-medium text-navy-900">{p.position_title} — {p.organization_name} <Badge tone={p.confirmation_status === "confirme" ? "green" : p.confirmation_status === "annule" ? "neutral" : "amber"}>{p.confirmation_status}</Badge></p>
                <p className="text-muted">{p.placement_type} · {p.contract_type} · {formatDate(p.start_date)}{p.end_date ? ` → ${formatDate(p.end_date)}` : ""}</p>
                {p.candidate_feedback && <p className="mt-1 text-xs">Retour candidat : {p.candidate_feedback}</p>}
                {p.organization_feedback && <p className="text-xs">Retour organisation : {p.organization_feedback}</p>}
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    );
  }
}

const VERIFICATION: Record<string, { label: string; tone: "green" | "red" | "neutral" }> = {
  verifie: { label: "Vérifiée", tone: "green" },
  rejete: { label: "Rejetée", tone: "red" },
  non_verifie: { label: "Non vérifiée", tone: "neutral" },
};

const telHref = (phone: string) => `tel:${phone.replace(/[^+\d]/g, "")}`;
/** Lien WhatsApp au format international ; un numéro guinéen local (9 chiffres) reçoit l'indicatif 224. */
const whatsappHref = (phone: string) => {
  const digits = phone.replace(/\D/g, "").replace(/^00/, "");
  return `https://wa.me/${digits.length === 9 ? `224${digits}` : digits}`;
};

function SummaryOutput({ output }: { output: unknown }) {
  const o = output as { summary?: string; key_evidence?: { text: string }[]; points_to_verify?: { text: string }[]; suggested_next_steps?: string[] } | null;
  if (!o) return null;
  if (o.summary) {
    return (
      <div className="space-y-2 text-sm text-slate-700">
        <p className="whitespace-pre-line">{o.summary}</p>
        {o.key_evidence?.length ? <ul className="list-disc pl-5">{o.key_evidence.map((k, i) => <li key={i}>{k.text}</li>)}</ul> : null}
        {o.points_to_verify?.length ? <p><strong>À vérifier :</strong> {o.points_to_verify.map((k) => k.text).join(" · ")}</p> : null}
        {o.suggested_next_steps?.length ? <p><strong>Prochaines étapes :</strong> {o.suggested_next_steps.join(" · ")}</p> : null}
      </div>
    );
  }
  return <pre className="max-h-64 overflow-auto rounded bg-slate-50 p-2 text-xs">{JSON.stringify(output, null, 2)}</pre>;
}
