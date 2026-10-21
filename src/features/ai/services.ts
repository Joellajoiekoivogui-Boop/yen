import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { levelLabel, skillSourceLabel } from "@/lib/labels";
import { loadCandidateBundle, type CandidateBundle } from "@/features/candidates/queries";
import { computeMatch, rankMatches } from "@/features/matching/engine";
import { loadEvidence, loadOccupationTargets } from "@/features/matching/loader";
import { AINotConfiguredError, AIProviderError, requireAIProvider, type ChatMessage } from "./provider";
import { buildSkillIndex, matchSkill, quoteAppearsIn } from "./normalize";
import {
  ANSWER_GRADING_SYSTEM, ASSISTANT_SYSTEM, CV_EXTRACTION_SYSTEM, CV_IMPROVEMENT_SYSTEM, MANAGER_SUMMARY_SYSTEM, PROFILE_ANALYSIS_SYSTEM,
  PROGRESS_PLAN_SYSTEM, PROMPT_VERSION,
} from "./prompts";
import {
  answerGradingSchema, cvExtractionSchema, cvImprovementSchema, managerSummarySchema, profileAnalysisSchema, progressPlanSchema,
  type CvExtraction,
} from "./schemas";
import { enforceTraceability, renderSources, type SourceDoc } from "./traceability";

/**
 * Services IA. Chaque appel :
 *  - doit avoir été AUTORISÉ par l'appelant (session + permission + consentement) ;
 *  - est enregistré dans ai_analyses (fournisseur, modèle, version du prompt,
 *    sources utilisées, résultat ou erreur, statut de validation) ;
 *  - ne simule jamais de résultat : sans fournisseur configuré, AINotConfiguredError.
 */

export type AnalysisKind =
  | "extraction_cv" | "analyse_profil" | "recommandation_metiers" | "amelioration_cv"
  | "plan_progression" | "synthese_responsable" | "correction_reponse" | "resume_rapprochement";

export interface AnalysisRecord {
  id: string;
  status: "reussi" | "partiel" | "echoue";
  output: unknown;
  error: string | null;
}

export class ConsentRequiredError extends Error {
  constructor() {
    super("Le candidat n'a pas autorisé l'analyse de son profil par l'IA (Paramètres et confidentialité).");
  }
}

async function assertAIConsent(admin: SupabaseClient, candidateId: string) {
  const { data } = await admin.from("candidate_consents").select("granted").eq("candidate_id", candidateId).eq("consent_type", "traitement_ia").maybeSingle();
  if (!data?.granted) throw new ConsentRequiredError();
}

async function record(
  admin: SupabaseClient,
  base: { candidateId: string | null; kind: AnalysisKind; createdBy: string | null; inputRefs: unknown[]; documentId?: string; attemptId?: string; offerId?: string },
  run: () => Promise<{ output: unknown; model: string; partial?: boolean; notes?: unknown }>,
): Promise<AnalysisRecord> {
  const provider = requireAIProvider(); // lève AINotConfiguredError sans rien enregistrer
  const started = Date.now();
  let status: AnalysisRecord["status"] = "reussi";
  let output: unknown = null;
  let error: string | null = null;
  let model: string = provider.model;
  try {
    const r = await run();
    output = r.output;
    model = r.model;
    if (r.partial) status = "partiel";
  } catch (e) {
    status = "echoue";
    error = e instanceof AIProviderError || e instanceof Error ? e.message : "Erreur inconnue";
  }
  const { data, error: dbErr } = await admin
    .from("ai_analyses")
    .insert({
      candidate_id: base.candidateId,
      kind: base.kind,
      provider: provider.name,
      model,
      prompt_version: PROMPT_VERSION,
      status,
      input_refs: base.inputRefs,
      output,
      error,
      document_id: base.documentId ?? null,
      attempt_id: base.attemptId ?? null,
      offer_id: base.offerId ?? null,
      duration_ms: Date.now() - started,
      created_by: base.createdBy,
    })
    .select("id")
    .single();
  if (dbErr || !data) throw new Error("L'analyse n'a pas pu être enregistrée.");
  return { id: data.id, status, output, error };
}

/* ----------------------------------------------------------------------------
 * Sources traçables
 * ------------------------------------------------------------------------- */
export function buildSources(b: CandidateBundle, cvText: string | null, opts: { includeDeclared?: boolean } = {}): SourceDoc[] {
  const sources: SourceDoc[] = [];
  const c = b.candidate;
  sources.push({
    id: "profil",
    type: "profil",
    label: "Profil saisi par le candidat",
    content: [
      c.headline && `Titre : ${c.headline}`,
      c.summary && `Résumé : ${c.summary}`,
      c.yen_program && `Formation suivie chez YEN : ${c.yen_program}`,
      c.institution && `Établissement : ${c.institution}`,
      c.education_level && `Niveau d'études : ${c.education_level}`,
      c.graduation_year && `Année de formation/diplomation : ${c.graduation_year}`,
      c.engineering_domains?.name && `Domaine principal : ${c.engineering_domains.name}`,
      c.interest_area && `Projet professionnel : ${c.interest_area}`,
      `Opportunités recherchées : ${c.opportunity_types.join(", ") || "non précisé"}`,
    ].filter(Boolean).join("\n"),
  });
  if (cvText) sources.push({ id: `cv:${b.currentCv?.id ?? "courant"}`, type: "cv", label: "Texte du CV", content: cvText.slice(0, 40_000) });
  if (opts.includeDeclared !== false) {
    for (const d of b.declaredSkills) {
      if (!d.skills) continue;
      sources.push({ id: `decl:${d.skill_id}`, type: "competence_declaree", label: `Compétence déclarée : ${d.skills.name}`, content: `Déclarée par le candidat, niveau auto-évalué ${levelLabel[d.self_level]}${d.years_experience ? `, ${d.years_experience} an(s)` : ""}.${d.evidence_note ? ` Note : ${d.evidence_note}` : ""}` });
    }
  }
  for (const s of b.skillAssessments) {
    if (s.status !== "valide" || !s.skills) continue;
    const type = s.source === "evaluateur" ? "evaluateur" : s.source === "retour_partenaire" ? "retour_partenaire" : s.source === "projet" ? "projet" : "evaluation";
    sources.push({
      id: `eval:${s.id}`,
      type,
      label: `${skillSourceLabel[s.source]} : ${s.skills.name}`,
      content: `Compétence démontrée : ${s.skills.name}, niveau ${levelLabel[s.level]}${s.score_percent != null ? `, score ${Math.round(Number(s.score_percent))} %` : ""}, confiance ${s.confidence}.${s.notes ? ` ${s.notes}` : ""}`,
    });
  }
  for (const p of b.projects) {
    sources.push({
      id: `projet:${p.id}`,
      type: "projet",
      label: `Projet : ${p.title}${p.verification_status === "verifie" ? " (vérifié par YEN)" : " (non vérifié)"}`,
      content: [p.description, p.role && `Rôle : ${p.role}`, p.technologies.length && `Technologies : ${p.technologies.join(", ")}`, p.outcomes && `Résultats : ${p.outcomes}`].filter(Boolean).join("\n"),
    });
  }
  for (const e of b.experiences) {
    sources.push({
      id: `exp:${e.id}`,
      type: "experience",
      label: `Expérience : ${e.title} — ${e.organization}`,
      content: [`Type : ${e.experience_type}`, `Du ${e.start_date} au ${e.is_current ? "présent" : e.end_date ?? "?"}`, e.description, e.achievements && `Réalisations : ${e.achievements}`].filter(Boolean).join("\n"),
    });
  }
  for (const e of b.education) {
    sources.push({ id: `form:${e.id}`, type: "formation", label: `Formation : ${e.degree}`, content: [e.institution, e.field_of_study, [e.start_year, e.end_year].filter(Boolean).join("–")].filter(Boolean).join(" · ") });
  }
  for (const ce of b.certifications) {
    sources.push({ id: `cert:${ce.id}`, type: "certification", label: `Certification : ${ce.name}`, content: `${ce.name} — ${ce.issuer}${ce.training_period ?? ce.issue_date ? ` (${ce.training_period ?? ce.issue_date})` : ""} — statut : ${ce.verification_status}` });
  }
  return sources;
}

async function loadCvText(admin: SupabaseClient, b: CandidateBundle): Promise<string | null> {
  if (!b.currentCv) return null;
  const { data } = await admin.from("candidate_document_texts").select("content").eq("document_id", b.currentCv.id).maybeSingle();
  return data?.content ?? null;
}

async function loadBundleOrThrow(admin: SupabaseClient, candidateId: string) {
  const b = await loadCandidateBundle(admin, candidateId);
  if (!b) throw new Error("Candidat introuvable.");
  return b;
}

/* ----------------------------------------------------------------------------
 * 1. Extraction de CV (avec OCR pour les PDF scannés)
 * ------------------------------------------------------------------------- */
export async function extractCv(candidateId: string, documentId: string, actorId: string): Promise<AnalysisRecord> {
  const admin = createAdminClient();
  await assertAIConsent(admin, candidateId);
  const { data: doc } = await admin.from("candidate_documents").select("id, storage_path, text_extraction_status").eq("id", documentId).eq("candidate_id", candidateId).is("deleted_at", null).maybeSingle();
  if (!doc) throw new Error("Document introuvable.");
  const { data: textRow } = await admin.from("candidate_document_texts").select("content").eq("document_id", doc.id).maybeSingle();
  const text = textRow?.content ?? null;

  return record(admin, { candidateId, kind: "extraction_cv", createdBy: actorId, inputRefs: [{ type: "cv", id: doc.id, method: text ? "pdf_text" : "ocr_ia" }], documentId: doc.id }, async () => {
    const provider = requireAIProvider();
    let res;
    if (text) {
      res = await provider.generateJson({ system: CV_EXTRACTION_SYSTEM, schema: cvExtractionSchema, prompt: `Voici le texte extrait du CV :\n<cv>\n${text.slice(0, 60_000)}\n</cv>\nExtrais les informations demandées.` });
    } else {
      // PDF scanné : le document est transmis au modèle qui le lit visuellement (OCR)
      const dl = await admin.storage.from("candidate-documents").download(doc.storage_path);
      if (dl.error || !dl.data) throw new Error("Impossible de lire le fichier du CV.");
      const b64 = Buffer.from(await dl.data.arrayBuffer()).toString("base64");
      res = await provider.generateJson({ system: CV_EXTRACTION_SYSTEM, schema: cvExtractionSchema, pdfBase64: b64, prompt: "Ce CV est un PDF probablement scanné. Lis-le et extrais les informations demandées." });
    }
    const data = res.data as CvExtraction;
    let partial = false;
    if (text) {
      // Vérification : chaque compétence doit être citée réellement dans le CV
      const before = data.skills.length;
      data.skills = data.skills.filter((s) => quoteAppearsIn(s.evidence_quote, text) || quoteAppearsIn(s.name, text));
      if (data.skills.length < before) {
        partial = true;
        data.warnings.push(`${before - data.skills.length} compétence(s) écartée(s) car leur mention n'a pas été retrouvée dans le texte du CV.`);
      }
    } else {
      data.warnings.push("Extraction réalisée par lecture visuelle (OCR) : vérifiez attentivement chaque information.");
    }
    return { output: data, model: res.model, partial };
  });
}

/* ----------------------------------------------------------------------------
 * 2. Analyse de profil + recommandations
 * ------------------------------------------------------------------------- */
export async function analyzeProfile(candidateId: string, actorId: string): Promise<AnalysisRecord> {
  const admin = createAdminClient();
  await assertAIConsent(admin, candidateId);
  const b = await loadBundleOrThrow(admin, candidateId);
  const cvText = await loadCvText(admin, b);
  const sources = buildSources(b, cvText);
  const known = new Set(sources.map((s) => s.id));
  const occupations = await admin.from("occupations").select("slug, title, engineering_domains(name)").eq("is_active", true);
  const occList = (occupations.data ?? []).map((o) => `${o.slug} — ${o.title} (${(o.engineering_domains as unknown as { name: string } | null)?.name ?? ""})`).join("\n");
  const validSlugs = new Set((occupations.data ?? []).map((o) => o.slug));

  const rec = await record(admin, { candidateId, kind: "analyse_profil", createdBy: actorId, inputRefs: sources.map((s) => ({ id: s.id, type: s.type })) }, async () => {
    const res = await requireAIProvider().generateJson({
      system: PROFILE_ANALYSIS_SYSTEM,
      schema: profileAnalysisSchema,
      effort: "high",
      prompt: `Sources du candidat :\n${renderSources(sources)}\n\nMétiers du catalogue (utilise uniquement ces identifiants dans occupation_slug) :\n${occList}\n\nProduis l'analyse structurée.`,
    });
    const filtered = { ...res.data, compatible_occupations: res.data.compatible_occupations.filter((o) => validSlugs.has(o.occupation_slug)) };
    const { output, report } = enforceTraceability(filtered, known);
    return { output: { ...output, traceability: report }, model: res.model, partial: report.dropped > 0 };
  });

  if (rec.status !== "echoue" && rec.output) {
    const out = rec.output as { training_recommendations: { title: string; detail: string; source_ids: string[] }[]; compatible_occupations: { occupation_slug: string; rationale: string; source_ids: string[] }[] };
    const { data: occ } = await admin.from("occupations").select("id, slug, title").in("slug", out.compatible_occupations.map((o) => o.occupation_slug));
    const rows = [
      ...out.training_recommendations.map((t) => ({ analysis_id: rec.id, candidate_id: candidateId, rec_type: "formation", title: t.title, body: t.detail, source_refs: t.source_ids, origin: "ia" })),
      ...out.compatible_occupations.map((o) => {
        const m = occ?.find((x) => x.slug === o.occupation_slug);
        return { analysis_id: rec.id, candidate_id: candidateId, rec_type: "metier", title: m?.title ?? o.occupation_slug, body: o.rationale, occupation_id: m?.id ?? null, source_refs: o.source_ids, origin: "ia" };
      }),
    ];
    if (rows.length) await admin.from("ai_recommendations").insert(rows);
  }
  return rec;
}

/* ----------------------------------------------------------------------------
 * 3. Amélioration du CV
 * ------------------------------------------------------------------------- */
export async function improveCv(candidateId: string, actorId: string): Promise<AnalysisRecord> {
  const admin = createAdminClient();
  await assertAIConsent(admin, candidateId);
  const b = await loadBundleOrThrow(admin, candidateId);
  const cvText = await loadCvText(admin, b);
  const sources = buildSources(b, cvText);
  const known = new Set(sources.map((s) => s.id));
  const expIds = new Set(b.experiences.map((e) => e.id));
  return record(admin, { candidateId, kind: "amelioration_cv", createdBy: actorId, inputRefs: sources.map((s) => ({ id: s.id, type: s.type })) }, async () => {
    const res = await requireAIProvider().generateJson({
      system: CV_IMPROVEMENT_SYSTEM,
      schema: cvImprovementSchema,
      prompt: `Sources :\n${renderSources(sources)}\n\nPour improved_experiences, utilise comme experience_id l'identifiant après « exp: » (ex. exp:abc → abc). Propose les améliorations.`,
    });
    const data = { ...res.data, improved_experiences: res.data.improved_experiences.map((e) => ({ ...e, experience_id: e.experience_id.replace(/^exp:/, "") })).filter((e) => expIds.has(e.experience_id)) };
    const { output, report } = enforceTraceability(data, known);
    return { output: { ...output, traceability: report }, model: res.model, partial: report.dropped > 0 };
  });
}

/* ----------------------------------------------------------------------------
 * 4. Plan de progression (écarts calculés de façon déterministe + IA)
 * ------------------------------------------------------------------------- */
export async function gapAnalysis(supabase: SupabaseClient, candidateId: string, primaryDomainId: string | null) {
  const evidence = await loadEvidence(supabase, candidateId, primaryDomainId);
  if (!evidence) return { matches: [], gaps: [] as { skillId: string; skillName: string; requiredLevel: string; occupation: string; status: string }[] };
  const targets = await loadOccupationTargets(supabase, primaryDomainId ? { domainIds: [primaryDomainId] } : {});
  const matches = rankMatches(targets.map((t) => ({ target: t, match: computeMatch(t, evidence) }))).slice(0, 3);
  const gaps = matches.flatMap((m) => m.match.requirements.filter((r) => r.status !== "satisfaite").map((r) => ({ skillId: r.skillId, skillName: r.skillName, requiredLevel: r.requiredLevel, occupation: m.target.title, status: r.status })));
  return { matches, gaps };
}

export async function progressPlan(candidateId: string, actorId: string): Promise<AnalysisRecord> {
  const admin = createAdminClient();
  await assertAIConsent(admin, candidateId);
  const b = await loadBundleOrThrow(admin, candidateId);
  const sources = buildSources(b, null);
  const { gaps, matches } = await gapAnalysis(admin, candidateId, b.candidate.primary_domain_id);
  const gapSources: SourceDoc[] = gaps.map((g, i) => ({ id: `ecart:${i}`, type: "profil", label: `Écart pour ${g.occupation}`, content: `${g.skillName} : ${levelLabel[g.requiredLevel as keyof typeof levelLabel]} attendu (${g.status.replaceAll("_", " ")}).` }));
  const all = [...sources, ...gapSources];
  const known = new Set(all.map((s) => s.id));
  const skills = await admin.from("skills").select("slug, name").in("id", [...new Set(gaps.map((g) => g.skillId))]);
  return record(admin, { candidateId, kind: "plan_progression", createdBy: actorId, inputRefs: all.map((s) => ({ id: s.id, type: s.type })) }, async () => {
    const res = await requireAIProvider().generateJson({
      system: PROGRESS_PLAN_SYSTEM,
      schema: progressPlanSchema,
      prompt: `Sources :\n${renderSources(all)}\n\nMétiers visés (calcul de compatibilité) : ${matches.map((m) => `${m.target.title} (${m.match.score}/100)`).join(", ") || "aucun"}.\nCompétences concernées (skill_slug autorisés) : ${(skills.data ?? []).map((s) => `${s.slug} (${s.name})`).join(", ") || "aucune"}.\nConstruis le plan.`,
    });
    const { output, report } = enforceTraceability(res.data, known);
    return { output: { ...output, traceability: report }, model: res.model, partial: report.dropped > 0 };
  });
}

/* ----------------------------------------------------------------------------
 * 5. Synthèse pour le responsable d'insertion (interne, invisible du candidat)
 * ------------------------------------------------------------------------- */
export async function managerSummary(candidateId: string, actorId: string, offerId?: string): Promise<AnalysisRecord> {
  const admin = createAdminClient();
  await assertAIConsent(admin, candidateId);
  const b = await loadBundleOrThrow(admin, candidateId);
  const cvText = await loadCvText(admin, b);
  const sources = buildSources(b, cvText);
  const known = new Set(sources.map((s) => s.id));
  let offerText = "";
  if (offerId) {
    const { data: o } = await admin.from("job_offers").select("title, description, job_required_skills(required_level, is_mandatory, skills(name))").eq("id", offerId).maybeSingle();
    if (o) offerText = `\n\nOffre visée : ${o.title}\n${o.description}\nCompétences : ${((o.job_required_skills ?? []) as unknown as { required_level: string; is_mandatory: boolean; skills: { name: string } | null }[]).map((r) => `${r.skills?.name} (${r.required_level}${r.is_mandatory ? ", obligatoire" : ""})`).join(", ")}`;
  }
  return record(admin, { candidateId, kind: offerId ? "resume_rapprochement" : "synthese_responsable", createdBy: actorId, inputRefs: sources.map((s) => ({ id: s.id, type: s.type })), offerId }, async () => {
    const res = await requireAIProvider().generateJson({ system: MANAGER_SUMMARY_SYSTEM, schema: managerSummarySchema, prompt: `Sources :\n${renderSources(sources)}${offerText}\n\nRédige la synthèse.` });
    const { output, report } = enforceTraceability(res.data, known);
    return { output: { ...output, traceability: report }, model: res.model, partial: report.dropped > 0 };
  });
}

/* ----------------------------------------------------------------------------
 * 6. Aide à la correction d'une réponse libre (validation humaine obligatoire)
 * ------------------------------------------------------------------------- */
export async function suggestAnswerGrade(answerId: string, actorId: string): Promise<AnalysisRecord> {
  const admin = createAdminClient();
  const { data: ans } = await admin
    .from("assessment_answers")
    .select("id, text_answer, attempt_id, assessment_attempts(candidate_id), assessment_questions(prompt, points, rubric)")
    .eq("id", answerId)
    .maybeSingle();
  if (!ans) throw new Error("Réponse introuvable.");
  const q = ans.assessment_questions as unknown as { prompt: string; points: number; rubric: { criterion: string; points: number }[] };
  const candidateId = (ans.assessment_attempts as unknown as { candidate_id: string }).candidate_id;
  await assertAIConsent(admin, candidateId);
  const rec = await record(admin, { candidateId, kind: "correction_reponse", createdBy: actorId, inputRefs: [{ type: "reponse", id: ans.id }], attemptId: ans.attempt_id }, async () => {
    const res = await requireAIProvider().generateJson({
      system: ANSWER_GRADING_SYSTEM,
      schema: answerGradingSchema,
      prompt: `Question (${q.points} points) :\n${q.prompt}\n\nGrille :\n${q.rubric.map((r) => `- ${r.criterion} : ${r.points} pt(s)`).join("\n") || "- Pertinence et exactitude globale"}\n\nRéponse du candidat :\n<reponse>\n${(ans.text_answer ?? "").slice(0, 10_000)}\n</reponse>`,
    });
    const total = Math.max(0, Math.min(Number(q.points), res.data.criteria.reduce((s, c) => s + Math.max(0, Math.min(c.max_points, c.points_awarded)), 0)));
    return { output: { ...res.data, total_points: total }, model: res.model };
  });
  if (rec.status !== "echoue") {
    const o = rec.output as { total_points: number; feedback: string };
    await admin.from("assessment_answers").update({ ai_suggested_points: o.total_points, ai_feedback: o.feedback }).eq("id", answerId);
  }
  return rec;
}

/* ----------------------------------------------------------------------------
 * 7. Assistant du candidat (conversation non persistée)
 * ------------------------------------------------------------------------- */
export async function assistantReply(candidateId: string, messages: ChatMessage[]): Promise<string> {
  const admin = createAdminClient();
  await assertAIConsent(admin, candidateId);
  const b = await loadBundleOrThrow(admin, candidateId);
  const sources = buildSources(b, null);
  const system = `${ASSISTANT_SYSTEM}\n\nProfil du candidat connecté :\n${renderSources(sources)}`;
  const res = await requireAIProvider().chat(system, messages.slice(-12), { maxTokens: 2000 });
  return res.text || "Je n'ai pas pu formuler de réponse. Reformulez votre question.";
}

/** Rattache les compétences extraites au catalogue (normalisation déterministe). */
export async function normalizeExtractedSkills(names: string[]) {
  const admin = createAdminClient();
  const { data } = await admin.from("skills").select("id, name, aliases").eq("is_active", true);
  const index = buildSkillIndex((data ?? []) as { id: string; name: string; aliases: string[] }[]);
  return names.map((n) => ({ label: n, skillId: matchSkill(n, index), skillName: data?.find((s) => s.id === matchSkill(n, index))?.name ?? null }));
}

export { AINotConfiguredError };
