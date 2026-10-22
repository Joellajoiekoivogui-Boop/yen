/**
 * Non-régression de l'audit de sécurité de l'IA (migration 15).
 * Chaque test reproduit l'attaque constatée et vérifie qu'elle échoue.
 * Nécessite TEST_DATABASE_URL (PostgreSQL local).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, candidateId, createAuthUser, createTestDatabase, grantRole, type Db } from "./helpers";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

const U = {
  alice: "00000000-0000-4000-8000-0000000003a1",
  evaluator: "00000000-0000-4000-8000-0000000003e1",
  manager: "00000000-0000-4000-8000-0000000003e2",
  recruiter: "00000000-0000-4000-8000-0000000003f1",
};

d("Audit IA : non-régression", () => {
  let db: Db;
  let drop: () => Promise<void>;
  let alice: string, attemptId: string, answerId: string, gradingId: string, profileAnalysisId: string;

  beforeAll(async () => {
    ({ client: db, drop } = await createTestDatabase(url!));
    await createAuthUser(db, U.alice, "alice-ia@example.test", { first_name: "Alice", last_name: "Test", accepted_terms: "true" });
    for (const [id, email] of [[U.evaluator, "evaluateur@yen.test"], [U.manager, "responsable@yen.test"]]) {
      await createAuthUser(db, id, email, { account_type: "partner" });
      await db.query("update public.profiles set account_type = 'staff' where id = $1", [id]);
    }
    await createAuthUser(db, U.recruiter, "rh-ia@entreprise.test", { account_type: "partner" });
    await grantRole(db, U.evaluator, "evaluator");
    await grantRole(db, U.manager, "insertion_manager");
    await grantRole(db, U.recruiter, "partner");
    alice = await candidateId(db, U.alice);

    // Tentative d'Alice avec une réponse libre, et la proposition de note de l'IA (avant validation)
    const domain = (await db.query("select id from public.engineering_domains order by position limit 1")).rows[0].id;
    const skill = (await db.query("select id from public.skills order by name limit 1")).rows[0].id;
    const assessment = (await db.query(
      "insert into public.assessments (title, domain_id, level, passing_score, status, max_attempts, cooldown_hours, duration_minutes) values ('Étude de cas IA', $1, 'intermediaire', 60, 'publie', 2, 0, 30) returning id",
      [domain])).rows[0].id;
    const question = (await db.query(
      "insert into public.assessment_questions (assessment_id, position, question_type, prompt, points, skill_id, explanation) values ($1, 1, 'reponse_longue', 'Expliquez', 5, $2, 'x') returning id",
      [assessment, skill])).rows[0].id;
    attemptId = (await db.query(
      "insert into public.assessment_attempts (assessment_id, assessment_version, candidate_id, deadline_at) values ($1, 1, $2, now() + interval '1 hour') returning id",
      [assessment, alice])).rows[0].id;
    answerId = (await db.query(
      "insert into public.assessment_answers (attempt_id, question_id, text_answer, ai_suggested_points, ai_feedback) values ($1, $2, 'Ma réponse', 4.5, 'Bonne démarche') returning id",
      [attemptId, question])).rows[0].id;
    gradingId = (await db.query(
      "insert into public.ai_analyses (candidate_id, kind, provider, model, prompt_version, status, output, attempt_id) values ($1, 'correction_reponse', 'anthropic', 'm', 'v', 'reussi', '{\"total_points\": 4.5}', $2) returning id",
      [alice, attemptId])).rows[0].id;
    profileAnalysisId = (await db.query(
      "insert into public.ai_analyses (candidate_id, kind, provider, model, prompt_version, status, output) values ($1, 'analyse_profil', 'anthropic', 'm', 'v', 'reussi', '{\"confidence\": \"faible\"}') returning id",
      [alice])).rows[0].id;
  }, 60_000);

  afterAll(async () => { await drop?.(); });

  const as = <T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = [], opts: { commit?: boolean } = {}) =>
    asUser(db, user, async () => (await db.query(sql, params)).rows as T[], opts);

  it("le candidat ne lit pas la proposition de note de l'IA avant la validation de l'évaluateur", async () => {
    await expect(as(U.alice, "select ai_suggested_points from public.assessment_answers where id = $1", [answerId])).rejects.toThrow(/permission/);
    await expect(as(U.alice, "select ai_feedback from public.assessment_answers where id = $1", [answerId])).rejects.toThrow(/permission/);
    await expect(as(U.alice, "select * from public.assessment_answers where id = $1", [answerId])).rejects.toThrow(/permission/);
    // ses propres réponses restent lisibles (colonnes ordinaires)
    const own = await as<{ text_answer: string }>(U.alice, "select text_answer, final_points, reviewer_comment from public.assessment_answers where id = $1", [answerId]);
    expect(own[0].text_answer).toBe("Ma réponse");
    // ni l'analyse d'aide à la correction ; son analyse de profil reste visible
    const analyses = await as<{ kind: string }>(U.alice, "select kind from public.ai_analyses where candidate_id = $1", [alice]);
    expect(analyses.map((a) => a.kind)).toEqual(["analyse_profil"]);
    await expect(as(U.alice, "select * from public.ai_grading_suggestions($1)", [attemptId])).rejects.toThrow(/refusé|permission/);
  });

  it("l'évaluateur lit les propositions de l'IA par la fonction réservée aux correcteurs", async () => {
    const rows = await as<{ answer_id: string; suggested_points: string; feedback: string }>(U.evaluator, "select * from public.ai_grading_suggestions($1)", [attemptId]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ answer_id: answerId, feedback: "Bonne démarche" });
    expect(Number(rows[0].suggested_points)).toBe(4.5);
    const analyses = await as(U.evaluator, "select id from public.ai_analyses where id = $1", [gradingId]);
    expect(analyses).toHaveLength(1);
    await expect(as(U.recruiter, "select * from public.ai_grading_suggestions($1)", [attemptId])).rejects.toThrow(/refusé|permission/);
  });

  it("le résultat d'une analyse IA ne peut pas être réécrit ; seule la revue humaine évolue, signée par son auteur", async () => {
    await expect(as(U.manager, "update public.ai_analyses set output = '{\"confidence\": \"elevee\"}' where id = $1", [profileAnalysisId])).rejects.toThrow(/ne peut pas être modifié/);
    await expect(as(U.manager, "update public.ai_analyses set model = 'autre', created_by = $2 where id = $1", [profileAnalysisId, U.evaluator])).rejects.toThrow(/ne peut pas être modifié/);
    await expect(as(U.manager, "update public.ai_analyses set superseded_by = $2 where id = $1", [profileAnalysisId, gradingId])).rejects.toThrow(/ne peut pas être modifié/);
    const reviewed = await as<{ validation_status: string; validated_by: string }>(
      U.manager,
      "update public.ai_analyses set validation_status = 'corrige', correction_note = 'Niveau surestimé', validated_by = $2 where id = $1 returning validation_status, validated_by",
      [profileAnalysisId, U.evaluator],
    );
    expect(reviewed[0]).toEqual({ validation_status: "corrige", validated_by: U.manager });
    // le candidat ne peut toujours rien modifier
    const none = await asUser(db, U.alice, () => db.query("update public.ai_analyses set validation_status = 'valide' where id = $1", [profileAnalysisId]));
    expect(none.rowCount).toBe(0);
  });

  it("les analyses lancées par le personnel ont un plafond horaire, propre à chaque compte", async () => {
    const hit = async () => (await as<{ ok: boolean }>(U.manager, `select public.rate_limit_hit('ai:staff:${U.manager}') ok`, [], { commit: true }))[0].ok;
    const results: boolean[] = [];
    for (let i = 0; i < 61; i++) results.push(await hit());
    expect(results.slice(0, 60).every(Boolean)).toBe(true);
    expect(results[60]).toBe(false);
    await expect(as(U.evaluator, `select public.rate_limit_hit('ai:staff:${U.manager}')`)).rejects.toThrow(/invalide/);
  });

  it("la base annonce une version de schéma comprenant la migration 15", async () => {
    expect((await as<{ v: number }>(U.alice, "select public.app_schema_version() v"))[0].v).toBeGreaterThanOrEqual(15);
  });
});
