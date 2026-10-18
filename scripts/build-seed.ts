/**
 * Génère supabase/seed.sql à partir de supabase/seed-data/catalog.ts.
 * Le SQL produit est idempotent (identifiants déterministes + upsert) :
 * il peut être rejoué sans dupliquer ni supprimer de données.
 *
 * Usage : npm run seed:build
 */
import { writeFileSync } from "node:fs";
import { domains, transversalSkills, type SkillSeed } from "../supabase/seed-data/catalog";

const q = (s: string | null | undefined) => (s == null ? "null" : `'${s.replace(/'/g, "''")}'`);
const arr = (a: string[]) => `array[${a.map(q).join(", ")}]::text[]`;
// UUID v4 déterministe (bits de version et de variante conformes à la RFC 9562)
const id = (key: string) => `overlay(overlay(md5(${q(key)}) placing '4' from 13) placing '8' from 17)::uuid`;

const lines: string[] = [
  "-- =============================================================================",
  "-- FICHIER GÉNÉRÉ par scripts/build-seed.ts — ne pas modifier à la main.",
  "-- Catalogue de référence : 15 domaines, compétences, métiers, questionnaires.",
  "-- Aucune donnée personnelle ; idempotent.",
  "-- =============================================================================",
  "begin;",
];

const skillSlugs = new Set<string>();
const skillKeyCheck = (slug: string, ctx: string) => {
  if (!skillSlugs.has(slug)) throw new Error(`Compétence inconnue "${slug}" référencée dans ${ctx}`);
};

function skillInsert(s: SkillSeed, domainSlug: string | null) {
  if (skillSlugs.has(s.slug)) throw new Error(`Compétence en double : ${s.slug}`);
  skillSlugs.add(s.slug);
  const criteria = JSON.stringify({
    debutant: s.criteria[0],
    intermediaire: s.criteria[1],
    avance: s.criteria[2],
    expert: s.criteria[3],
  });
  lines.push(
    `insert into public.skills (id, domain_id, slug, name, category, tier, level_criteria, aliases) values (` +
      `${id("skill:" + s.slug)}, ${domainSlug ? `(select id from public.engineering_domains where slug = ${q(domainSlug)})` : "null"}, ` +
      `${q(s.slug)}, ${q(s.name)}, ${q(s.category ?? "technique")}, ${q(s.tier)}, ${q(criteria)}::jsonb, ${arr(s.aliases ?? [])})` +
      ` on conflict (slug) do update set name = excluded.name, category = excluded.category, tier = excluded.tier,` +
      ` level_criteria = excluded.level_criteria, aliases = excluded.aliases, domain_id = excluded.domain_id;`,
  );
}

// 1. Domaines
domains.forEach((d, i) => {
  lines.push(
    `insert into public.engineering_domains (id, slug, name, short_description, description, tools, certifications, project_types, progression_criteria, icon, position) values (` +
      `${id("domain:" + d.slug)}, ${q(d.slug)}, ${q(d.name)}, ${q(d.short)}, ${q(d.description)}, ${arr(d.tools)}, ${arr(d.certifications)}, ` +
      `${arr(d.projectTypes)}, ${q(d.progression)}, ${q(d.icon)}, ${i + 1})` +
      ` on conflict (slug) do update set name = excluded.name, short_description = excluded.short_description,` +
      ` description = excluded.description, tools = excluded.tools, certifications = excluded.certifications,` +
      ` project_types = excluded.project_types, progression_criteria = excluded.progression_criteria, icon = excluded.icon, position = excluded.position;`,
  );
});

// 2. Compétences (transversales puis par domaine)
transversalSkills.forEach((s) => skillInsert(s, null));
domains.forEach((d) => d.skills.forEach((s) => skillInsert(s, d.slug)));

// 3. Métiers et compétences attendues
for (const d of domains) {
  for (const o of d.occupations) {
    lines.push(
      `insert into public.occupations (id, domain_id, slug, title, description, typical_education) values (` +
        `${id("occupation:" + o.slug)}, (select id from public.engineering_domains where slug = ${q(d.slug)}), ${q(o.slug)}, ` +
        `${q(o.title)}, ${q(o.description)}, ${q(o.education)})` +
        ` on conflict (slug) do update set title = excluded.title, description = excluded.description, typical_education = excluded.typical_education;`,
    );
    for (const [skill, level, importance] of o.skills) {
      skillKeyCheck(skill, `métier ${o.slug}`);
      lines.push(
        `insert into public.occupation_skills (occupation_id, skill_id, required_level, importance) values (` +
          `(select id from public.occupations where slug = ${q(o.slug)}), (select id from public.skills where slug = ${q(skill)}), ` +
          `${q(level)}, ${q(importance)}) on conflict (occupation_id, skill_id) do update set required_level = excluded.required_level, importance = excluded.importance;`,
      );
    }
  }
}

// 4. Évaluations publiées (banque de questions initiale)
let assessmentCount = 0;
let questionCount = 0;
for (const d of domains) {
  for (const a of d.assessments) {
    assessmentCount++;
    const aid = id("assessment:" + a.slug);
    const totalPoints = a.questions.reduce((sum, qq) => sum + (qq.points ?? 1), 0);
    const hasOpen = a.questions.some((qq) => qq.type === "etude_de_cas");
    const rules =
      `Total : ${totalPoints} point(s). Choix unique et réponses courtes : tout ou rien. ` +
      `Choix multiples : points proportionnels aux bonnes réponses, une mauvaise réponse cochée annule la question. ` +
      (hasOpen ? "Études de cas : grille de critères, proposition de note assistée par IA puis validation par un évaluateur YEN. " : "") +
      `Seuil de réussite : 60 %. Un questionnaire ne peut jamais attribuer le niveau expert.`;
    lines.push(
      `insert into public.assessments (id, title, description, domain_id, level, assessment_type, duration_minutes, passing_score, scoring_rules, status, version, cooldown_hours, published_at) values (` +
        `${aid}, ${q(a.title)}, ${q(a.description)}, (select id from public.engineering_domains where slug = ${q(d.slug)}), ${q(a.level)}, ` +
        `${q(hasOpen && a.questions.length === 1 ? "etude_de_cas" : "questionnaire")}, ${a.duration}, 60, ${q(rules)}, 'publie', 1, 24, now())` +
        ` on conflict (id) do update set title = excluded.title, description = excluded.description, scoring_rules = excluded.scoring_rules,` +
        ` duration_minutes = excluded.duration_minutes;`,
    );
    const targeted = [...new Set(a.questions.map((qq) => qq.skill))];
    for (const s of targeted) {
      skillKeyCheck(s, `évaluation ${a.slug}`);
      lines.push(
        `insert into public.assessment_skills (assessment_id, skill_id) values (${aid}, (select id from public.skills where slug = ${q(s)})) on conflict do nothing;`,
      );
    }
    a.questions.forEach((qq, qi) => {
      questionCount++;
      const qid = id(`question:${a.slug}:${qi}`);
      if ((qq.type === "choix_unique" || qq.type === "choix_multiple") && !qq.options?.some((o) => o[1])) {
        throw new Error(`Question sans bonne réponse : ${a.slug} #${qi}`);
      }
      if (qq.type === "choix_unique" && qq.options!.filter((o) => o[1]).length !== 1) {
        throw new Error(`Choix unique avec plusieurs bonnes réponses : ${a.slug} #${qi}`);
      }
      lines.push(
        `insert into public.assessment_questions (id, assessment_id, position, question_type, prompt, points, skill_id, accepted_answers, rubric, explanation) values (` +
          `${qid}, ${aid}, ${qi + 1}, ${q(qq.type)}, ${q(qq.prompt)}, ${qq.points ?? 1}, (select id from public.skills where slug = ${q(qq.skill)}), ` +
          `${arr(qq.accepted ?? [])}, ${q(JSON.stringify(qq.rubric ?? []))}::jsonb, ${q(qq.explanation)})` +
          ` on conflict (id) do update set prompt = excluded.prompt, points = excluded.points, accepted_answers = excluded.accepted_answers,` +
          ` rubric = excluded.rubric, explanation = excluded.explanation, skill_id = excluded.skill_id;`,
      );
      (qq.options ?? []).forEach(([label, correct], oi) => {
        lines.push(
          `insert into public.assessment_options (id, question_id, position, label, is_correct) values (` +
            `${id(`option:${a.slug}:${qi}:${oi}`)}, ${qid}, ${oi + 1}, ${q(label)}, ${correct})` +
            ` on conflict (id) do update set label = excluded.label, is_correct = excluded.is_correct;`,
        );
      });
    });
  }
}

lines.push("commit;", "");
writeFileSync("supabase/seed.sql", lines.join("\n"));
console.log(
  `seed.sql généré : ${domains.length} domaines, ${skillSlugs.size} compétences, ` +
    `${domains.reduce((n, d) => n + d.occupations.length, 0)} métiers, ${assessmentCount} évaluations, ${questionCount} questions.`,
);
