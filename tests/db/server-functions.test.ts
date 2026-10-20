/**
 * Fonctions SQL qui remplacent la clé de service (migration 11) : chaque
 * fonction vérifie elle-même les droits de l'appelant et calcule notes, niveaux
 * et statuts en base. Nécessite TEST_DATABASE_URL (PostgreSQL local).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, candidateId, createAuthUser, createTestDatabase, grantRole, type Db } from "./helpers";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

const U = {
  alice: "00000000-0000-4000-8000-0000000001a1",
  bob: "00000000-0000-4000-8000-0000000001b0",
  evaluator: "00000000-0000-4000-8000-0000000001e2",
  partnerMgr: "00000000-0000-4000-8000-0000000001e3",
  recruiter: "00000000-0000-4000-8000-0000000001f1",
  otherRecruiter: "00000000-0000-4000-8000-0000000001f2",
};

d("Fonctions serveur sans clé de service", () => {
  let db: Db;
  let drop: () => Promise<void>;
  let alice: string, bob: string, orgId: string, offerId: string;
  let skillA: string, skillB: string;
  let autoAssessment: string, reviewAssessment: string;
  const opt: Record<string, string> = {};
  const q: Record<string, string> = {};

  beforeAll(async () => {
    ({ client: db, drop } = await createTestDatabase(url!));
    await createAuthUser(db, U.alice, "alice@example.test", { first_name: "Alice", last_name: "Test", accepted_terms: "true" });
    await createAuthUser(db, U.bob, "bob@example.test", { first_name: "Bob", last_name: "Test" });
    for (const [id, email] of [[U.evaluator, "eval@yen.test"], [U.partnerMgr, "pm@yen.test"]]) {
      await createAuthUser(db, id, email, { account_type: "partner" });
      await db.query("update public.profiles set account_type = 'staff' where id = $1", [id]);
    }
    await createAuthUser(db, U.recruiter, "rh@entreprise.test", { account_type: "partner" });
    await createAuthUser(db, U.otherRecruiter, "rh@autre.test", { account_type: "partner" });
    await grantRole(db, U.evaluator, "evaluator");
    await grantRole(db, U.partnerMgr, "partner_manager");
    await grantRole(db, U.recruiter, "partner");
    await grantRole(db, U.otherRecruiter, "partner");
    alice = await candidateId(db, U.alice);
    bob = await candidateId(db, U.bob);
    await db.query("update public.profiles set phone = '+224 620 00 00 01' where id = $1", [U.alice]);

    orgId = (await db.query("insert into public.organizations (name, status, portal_enabled) values ('Entreprise', 'actif', true) returning id")).rows[0].id;
    const other = (await db.query("insert into public.organizations (name, status, portal_enabled) values ('Autre', 'actif', true) returning id")).rows[0].id;
    await db.query("insert into public.partner_memberships (organization_id, user_id, status) values ($1, $2, 'actif'), ($3, $4, 'actif')", [orgId, U.recruiter, other, U.otherRecruiter]);
    offerId = (await db.query(
      "insert into public.job_offers (organization_id, title, description, offer_type, status, deadline) values ($1, 'Stage dev', 'Stage', 'stage', 'publiee', current_date + 30) returning id",
      [orgId])).rows[0].id;

    // Évaluation à correction automatique : 2 compétences, 3 questions (5 points)
    const domain = (await db.query("select id from public.engineering_domains order by position limit 1")).rows[0].id;
    [skillA, skillB] = (await db.query("select id from public.skills order by name limit 2")).rows.map((r) => r.id);
    const mk = async (title: string) => (await db.query(
      "insert into public.assessments (title, domain_id, level, passing_score, status, max_attempts, cooldown_hours, duration_minutes) values ($1, $2, 'intermediaire', 60, 'publie', 2, 0, 30) returning id",
      [title, domain])).rows[0].id as string;
    autoAssessment = await mk("Test automatique");
    reviewAssessment = await mk("Test avec réponse libre");
    const addQ = async (assessment: string, key: string, type: string, points: number, skill: string, pos: number, accepted: string[] = []) => {
      q[key] = (await db.query(
        "insert into public.assessment_questions (assessment_id, position, question_type, prompt, points, skill_id, accepted_answers, explanation) values ($1, $2, $3, $4, $5, $6, $7, 'Explication') returning id",
        [assessment, pos, type, `Question ${key}`, points, skill, accepted])).rows[0].id;
    };
    const addO = async (question: string, key: string, correct: boolean, pos: number) => {
      opt[key] = (await db.query("insert into public.assessment_options (question_id, position, label, is_correct) values ($1, $2, $3, $4) returning id", [question, pos, `Option ${key}`, correct])).rows[0].id;
    };
    await addQ(autoAssessment, "unique", "choix_unique", 2, skillA, 1);
    await addO(q.unique, "u1", true, 1);
    await addO(q.unique, "u2", false, 2);
    await addQ(autoAssessment, "multiple", "choix_multiple", 2, skillA, 2);
    await addO(q.multiple, "m1", true, 1);
    await addO(q.multiple, "m2", true, 2);
    await addO(q.multiple, "m3", false, 3);
    await addQ(autoAssessment, "courte", "reponse_courte", 1, skillB, 3, ["Clé primaire"]);
    await addQ(reviewAssessment, "libre", "reponse_longue", 2, skillB, 1);
    await addQ(reviewAssessment, "unique2", "choix_unique", 2, skillB, 2);
    await addO(q.unique2, "v1", true, 1);
  }, 60_000);

  afterAll(async () => { await drop?.(); });

  const rpc = <T = unknown>(user: string | null, sql: string, params: unknown[] = [], opts: { commit?: boolean } = {}) =>
    asUser(db, user, async () => (await db.query(sql, params)).rows as T[], opts);

  describe("Évaluations", () => {
    it("distribue les questions sans les bonnes réponses ni les explications", async () => {
      const [{ id }] = await rpc<{ id: string }>(U.alice, "select public.start_assessment_attempt($1) id", [autoAssessment], { commit: true });
      const [{ qs }] = await rpc<{ qs: unknown[] }>(U.alice, "select public.get_attempt_questions($1) qs", [id]);
      expect(qs).toHaveLength(3);
      const text = JSON.stringify(qs);
      expect(text).not.toMatch(/is_correct|accepted|Clé primaire|Explication/);
      // une autre personne ne peut pas lire cette tentative
      await expect(rpc(U.bob, "select public.get_attempt_questions($1)", [id])).rejects.toThrow(/introuvable/);
      // reprise : la même tentative est renvoyée tant qu'elle est en cours
      const [again] = await rpc<{ id: string }>(U.alice, "select public.start_assessment_attempt($1) id", [autoAssessment]);
      expect(again.id).toBe(id);
    });

    it("corrige en base : points partiels, réponse courte normalisée, preuves et notification", async () => {
      const [{ id }] = await rpc<{ id: string }>(U.alice, "select public.start_assessment_attempt($1) id", [autoAssessment]);
      const answers = [
        { questionId: q.unique, selectedOptionIds: [opt.u1] },
        { questionId: q.multiple, selectedOptionIds: [opt.m1] },
        { questionId: q.courte, selectedOptionIds: [], textAnswer: "  cle PRIMAIRE. " },
        { questionId: "00000000-0000-4000-8000-000000000999", selectedOptionIds: [] },
      ];
      const [{ status }] = await rpc<{ status: string }>(U.alice, "select public.submit_assessment_attempt($1, $2) status", [id, JSON.stringify(answers)], { commit: true });
      expect(status).toBe("corrige");
      const t = (await db.query("select status, score_percent, passed, earned_points, max_points, result_details from public.assessment_attempts where id = $1", [id])).rows[0];
      expect(t).toMatchObject({ status: "corrige", passed: true });
      expect(Number(t.score_percent)).toBe(80);
      expect(Number(t.earned_points)).toBe(4);
      expect(Number(t.max_points)).toBe(5);
      const bySkill = t.result_details.bySkill as { skillId: string; percent: number; questionCount: number }[];
      expect(bySkill.find((s) => s.skillId === skillA)).toMatchObject({ percent: 75, questionCount: 2 });
      expect(bySkill.find((s) => s.skillId === skillB)).toMatchObject({ percent: 100, questionCount: 1 });
      const ev = (await db.query("select skill_id, level, source, confidence, status from public.skill_assessments where attempt_id = $1 order by skill_id", [id])).rows;
      expect(ev).toHaveLength(2);
      expect(ev.every((e) => e.level === "intermediaire" && e.source === "questionnaire" && e.confidence === "faible" && e.status === "valide")).toBe(true);
      const n = (await db.query("select title from public.notifications where user_id = $1 and title like 'Résultat disponible%'", [U.alice])).rows;
      expect(n).toHaveLength(1);
      // le corrigé est ensuite visible par le candidat, avec les explications
      const [{ review }] = await rpc<{ review: { explanation: string; points: number }[] }>(U.alice, "select public.get_attempt_review($1) review", [id]);
      expect(review).toHaveLength(3);
      expect(review[0].explanation).toBe("Explication");
      await expect(rpc(U.alice, "select public.submit_assessment_attempt($1, '[]')", [id])).rejects.toThrow(/déjà été soumise/);
    });

    it("une mauvaise option cochée annule la question et génère une recommandation", async () => {
      const [{ id }] = await rpc<{ id: string }>(U.bob, "select public.start_assessment_attempt($1) id", [autoAssessment], { commit: true });
      const answers = [{ questionId: q.unique, selectedOptionIds: [opt.u2] }, { questionId: q.multiple, selectedOptionIds: [opt.m1, opt.m3] }];
      await rpc(U.bob, "select public.submit_assessment_attempt($1, $2)", [id, JSON.stringify(answers)], { commit: true });
      const t = (await db.query("select score_percent, passed, recommendations from public.assessment_attempts where id = $1", [id])).rows[0];
      expect(Number(t.score_percent)).toBe(0);
      expect(t.passed).toBe(false);
      expect(t.recommendations.length).toBe(2);
      const ev = await db.query("select count(*)::int n from public.skill_assessments where attempt_id = $1", [id]);
      expect(ev.rows[0].n).toBe(0);
    });

    it("applique le nombre maximal de tentatives et l'expiration", async () => {
      // deuxième tentative d'Alice sur l'évaluation automatique (max 2), puis refus
      const [second] = await rpc<{ id: string }>(U.alice, "select public.start_assessment_attempt($1) id", [autoAssessment], { commit: true });
      await rpc(U.alice, "select public.submit_assessment_attempt($1, '[]')", [second.id], { commit: true });
      await expect(rpc(U.alice, "select public.start_assessment_attempt($1)", [autoAssessment])).rejects.toThrow(/Nombre maximal de tentatives atteint \(2\)/);
      const [{ id }] = await rpc<{ id: string }>(U.alice, "select public.start_assessment_attempt($1) id", [reviewAssessment], { commit: true });
      await db.query("update public.assessment_attempts set deadline_at = now() - interval '1 hour' where id = $1", [id]);
      const [{ status }] = await rpc<{ status: string }>(U.alice, "select public.submit_assessment_attempt($1, '[]') status", [id], { commit: true });
      expect(status).toBe("expire");
      const t = await db.query("select status from public.assessment_attempts where id = $1", [id]);
      expect(t.rows[0].status).toBe("expire");
    });

    it("une réponse libre part en correction humaine, finalisée par un évaluateur seulement", async () => {
      const [{ id }] = await rpc<{ id: string }>(U.bob, "select public.start_assessment_attempt($1) id", [reviewAssessment], { commit: true });
      const answers = [{ questionId: q.libre, textAnswer: "Une clé primaire identifie chaque ligne de façon unique." }, { questionId: q.unique2, selectedOptionIds: [opt.v1] }];
      const [{ status }] = await rpc<{ status: string }>(U.bob, "select public.submit_assessment_attempt($1, $2) status", [id, JSON.stringify(answers)], { commit: true });
      expect(status).toBe("en_correction");
      const notified = await db.query("select count(*)::int n from public.notifications where user_id = $1 and link = $2", [U.evaluator, `/admin/corrections/${id}`]);
      expect(notified.rows[0].n).toBe(1);
      await expect(rpc(U.bob, "select public.finalize_assessment_review($1)", [id])).rejects.toThrow(/assessments.review/);
      await expect(rpc(U.evaluator, "select public.finalize_assessment_review($1)", [id])).rejects.toThrow(/Correction incomplète/);
      await asUser(db, U.evaluator, async () => {
        await db.query("update public.assessment_answers set manual_points = 1.5 where attempt_id = $1 and question_id = $2", [id, q.libre]);
        await db.query("select public.finalize_assessment_review($1, 'Bonne réponse, à préciser')", [id]);
      }, { commit: true });
      const t = (await db.query("select status, score_percent, reviewed_by, reviewer_comment from public.assessment_attempts where id = $1", [id])).rows[0];
      expect(t).toMatchObject({ status: "corrige", reviewed_by: U.evaluator, reviewer_comment: "Bonne réponse, à préciser" });
      expect(Number(t.score_percent)).toBe(87.5);
      const ev = (await db.query("select level, confidence, assessed_by from public.skill_assessments where attempt_id = $1", [id])).rows;
      expect(ev).toEqual([{ level: "intermediaire", confidence: "elevee", assessed_by: U.evaluator }]);
    });
  });

  describe("Limitation de débit", () => {
    it("les plafonds sont fixés en base et les clés d'un autre utilisateur sont refusées", async () => {
      await expect(rpc(U.alice, "select public.rate_limit_hit($1)", [`cv-upload:${U.bob}`])).rejects.toThrow(/invalide/);
      await expect(rpc(U.alice, "select public.rate_limit_hit('inconnu:1')")).rejects.toThrow(/inconnue/);
      const hits = await asUser(db, U.alice, async () => {
        const out: boolean[] = [];
        for (let i = 0; i < 11; i++) out.push((await db.query("select public.rate_limit_hit($1) ok", [`cv-upload:${U.alice}`])).rows[0].ok);
        return out;
      });
      expect(hits.slice(0, 10).every(Boolean)).toBe(true);
      expect(hits[10]).toBe(false);
      // l'ancienne fonction (plafond libre) reste réservée au service
      await expect(rpc(U.alice, "select public.check_rate_limit('login:ip:x', 100000, 1)")).rejects.toThrow(/permission/);
    });
  });

  describe("Notifications", () => {
    it("un candidat prévient le personnel mais pas un utilisateur quelconque", async () => {
      await expect(rpc(U.alice, "select public.notify_user($1, 'systeme', 'Faux message', '', '/')", [U.bob])).rejects.toThrow(/non autorisée/);
      await rpc(U.alice, "select public.notify_staff('assessments.review', 'candidature', 'Nouvelle candidature', '', '/admin')", [], { commit: true });
      const r = await db.query("select count(*)::int n from public.notifications where user_id = $1 and title = 'Nouvelle candidature'", [U.evaluator]);
      expect(r.rows[0].n).toBe(1);
    });

    it("seule l'organisation qui suit la candidature peut prévenir le candidat", async () => {
      await asUser(db, U.alice, () => db.query("insert into public.applications (offer_id, candidate_id) values ($1, $2)", [offerId, alice]), { commit: true });
      await rpc(U.recruiter, "select public.notify_candidate($1, 'entretien', 'Entretien programmé', '', '/candidat/candidatures')", [alice], { commit: true });
      await expect(rpc(U.otherRecruiter, "select public.notify_candidate($1, 'entretien', 'Hameçonnage', '', '/')", [alice])).rejects.toThrow(/non autorisée/);
      const n = await db.query("select link from public.notifications where user_id = $1 and title = 'Entretien programmé'", [U.alice]);
      expect(n.rows).toEqual([{ link: "/candidat/candidatures" }]);
    });

    it("refuse les liens externes", async () => {
      await rpc(U.alice, "select public.notify_staff('assessments.review', 'systeme', 'Lien externe', '', '//evil.example')", [], { commit: true });
      const r = await db.query("select link from public.notifications where title = 'Lien externe'");
      expect(r.rows.every((x) => x.link === null)).toBe(true);
    });
  });

  describe("Candidatures et pipeline", () => {
    it("l'instantané de compatibilité fourni par le candidat est ignoré et le pipeline suit la candidature", async () => {
      const app = await asUser(db, U.bob, () => db.query(
        "insert into public.applications (offer_id, candidate_id, match_snapshot) values ($1, $2, '{\"score\": 100}') returning id", [offerId, bob]), { commit: true });
      const id = app.rows[0].id;
      expect((await db.query("select match_snapshot from public.applications where id = $1", [id])).rows[0].match_snapshot).toBeNull();
      await rpc(U.bob, "select public.sync_application_pipeline($1)", [id], { commit: true });
      expect((await db.query("select pipeline_status from public.candidate_profiles where id = $1", [bob])).rows[0].pipeline_status).toBe("candidature_transmise");
      await expect(rpc(U.alice, "select public.sync_application_pipeline($1)", [id])).rejects.toThrow(/non autorisée/);
      // un compte qui n'est pas candidat (auth_candidate_id() nul) est refusé lui aussi
      await expect(rpc(U.otherRecruiter, "select public.sync_application_pipeline($1)", [id])).rejects.toThrow(/non autorisée/);
    });

    it("le candidat ne peut régler que les étapes automatiques de son propre pipeline", async () => {
      await db.query("update public.candidate_profiles set pipeline_status = 'profil_incomplet' where id = $1", [alice]);
      await expect(rpc(U.alice, "select public.set_auto_pipeline_status($1, 'preselectionne')", [alice])).rejects.toThrow(/invalide/);
      await expect(rpc(U.bob, "select public.set_auto_pipeline_status($1, 'en_evaluation')", [alice])).rejects.toThrow(/non autorisée/);
      await expect(rpc(U.recruiter, "select public.set_auto_pipeline_status($1, 'en_evaluation')", [alice])).rejects.toThrow(/non autorisée/);
      await rpc(U.alice, "select public.set_auto_pipeline_status($1, 'en_evaluation')", [alice], { commit: true });
      expect((await db.query("select pipeline_status from public.candidate_profiles where id = $1", [alice])).rows[0].pipeline_status).toBe("en_evaluation");
    });

    it("le retour d'un partenaire crée des preuves en attente, uniquement sur ses candidatures", async () => {
      const app = (await db.query("select id from public.applications where candidate_id = $1 and offer_id = $2", [alice, offerId])).rows[0].id;
      const ratings = JSON.stringify([{ skill_id: skillA, level: "expert", comment: "Très bon" }]);
      await expect(rpc(U.otherRecruiter, "select public.add_partner_skill_feedback($1, 'entretien', $2)", [app, ratings])).rejects.toThrow(/non autorisée/);
      const [{ n }] = await rpc<{ n: number }>(U.recruiter, "select public.add_partner_skill_feedback($1, 'entretien', $2) n", [app, ratings], { commit: true });
      expect(n).toBe(1);
      const ev = (await db.query("select level, status, source from public.skill_assessments where candidate_id = $1 and source = 'retour_partenaire'", [alice])).rows;
      expect(ev).toEqual([{ level: "avance", status: "en_attente", source: "retour_partenaire" }]);
    });
  });

  describe("Documents", () => {
    it("un CV ne s'enregistre que dans le dossier du candidat, avec versions et suppression logique", async () => {
      const reg = (path: string) => rpc<{ id: string }>(U.alice, "select public.register_cv_document($1, 'cv.pdf', 1000, $2, 'controle_basique_ok', null, 1, 'extrait', 'Texte du CV') id", [path, "a".repeat(64)], { commit: true });
      await expect(reg(`${U.bob}/vol.pdf`)).rejects.toThrow(/Chemin de stockage invalide/);
      const [v1] = await reg(`${U.alice}/v1.pdf`);
      const [v2] = await reg(`${U.alice}/v2.pdf`);
      const rows = (await db.query("select id, version, is_current from public.candidate_documents where candidate_id = $1 and kind = 'cv' order by version", [alice])).rows;
      expect(rows.map((r) => [r.version, r.is_current])).toEqual([[1, false], [2, true]]);
      expect((await db.query("select content from public.candidate_document_texts where document_id = $1", [v2.id])).rows[0].content).toBe("Texte du CV");
      await expect(rpc(U.bob, "select public.retire_candidate_document($1)", [v2.id])).rejects.toThrow(/introuvable/);
      const [{ path }] = await rpc<{ path: string }>(U.alice, "select public.retire_candidate_document($1) path", [v2.id], { commit: true });
      expect(path).toBe(`${U.alice}/v2.pdf`);
      await rpc(U.alice, "select public.set_current_cv($1)", [v1.id], { commit: true });
      const after = (await db.query("select version, is_current, deleted_at is not null as deleted from public.candidate_documents where candidate_id = $1 and kind = 'cv' order by version", [alice])).rows;
      expect(after).toEqual([{ version: 1, is_current: true, deleted: false }, { version: 2, is_current: false, deleted: true }]);
    });
  });

  describe("Vue partenaire", () => {
    it("renvoie le profil professionnel sans coordonnées, uniquement à l'organisation concernée", async () => {
      const [{ data }] = await rpc<{ data: Record<string, unknown> }>(U.recruiter, "select public.partner_candidate_data($1) data", [alice]);
      expect(data.public_code).toMatch(/^YEN-CB-/);
      expect(data).not.toHaveProperty("email");
      expect(data).not.toHaveProperty("phone");
      expect(JSON.stringify(data)).not.toContain("620 00 00 01");
      expect(data.has_cv).toBe(true);
      const [other] = await rpc<{ data: unknown }>(U.otherRecruiter, "select public.partner_candidate_data($1) data", [alice]);
      expect(other.data).toBeNull();
      const codes = await rpc(U.otherRecruiter, "select * from public.partner_candidate_codes($1)", [[alice, bob]]);
      expect(codes).toHaveLength(0);
      const cv = await rpc<{ storage_path: string }>(U.recruiter, "select * from public.partner_cv_document($1)", [alice]);
      expect(cv[0].storage_path).toBe(`${U.alice}/v1.pdf`);
    });
  });

  describe("Administration et journal", () => {
    it("le journal est écrit au nom de l'utilisateur connecté", async () => {
      await rpc(U.alice, "select public.log_audit('document_downloaded', 'candidate_documents', 'x', '{}')", [], { commit: true });
      const r = await db.query("select actor_id from public.audit_logs where action = 'document_downloaded' and entity_id = 'x'");
      expect(r.rows).toEqual([{ actor_id: U.alice }]);
      await expect(rpc(U.alice, "select public.log_audit('DROP TABLE', 'x')")).rejects.toThrow(/invalide/);
    });

    it("seul le gestionnaire de partenaires aligne le rôle partenaire, et l'auteur reste tracé", async () => {
      const pending = "00000000-0000-4000-8000-0000000001f9";
      await createAuthUser(db, pending, "rh@nouveau.test", { account_type: "partner", organization_name: "Nouvelle SARL" });
      await db.query("update public.partner_memberships set status = 'actif' where user_id = $1", [pending]);
      await expect(rpc(U.alice, "select public.sync_partner_role($1)", [pending])).rejects.toThrow(/partners.manage/);
      await rpc(U.partnerMgr, "select public.sync_partner_role($1)", [pending], { commit: true });
      const role = await db.query("select granted_by from public.user_roles where user_id = $1 and role = 'partner'", [pending]);
      expect(role.rows).toEqual([{ granted_by: U.partnerMgr }]);
      const audit = await db.query("select actor_id from public.audit_logs where entity_type = 'user_roles' and action = 'insert' order by id desc limit 1");
      expect(audit.rows[0].actor_id).toBe(U.partnerMgr);
    });

    it("les paramètres sont lisibles par les comptes connectés, seuls les publics par les visiteurs", async () => {
      const auth = await rpc(U.alice, "select key from public.platform_settings");
      expect(auth.length).toBeGreaterThan(3);
      const anon = await rpc<{ key: string }>(null, "select key from public.platform_settings order by key");
      expect(anon.map((r) => r.key)).toEqual(["documents.max_cv_size_mb", "registration.phone_required"]);
    });
  });
});
