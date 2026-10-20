/**
 * Non-régression des constats de l'audit de sécurité (migration 12).
 * Chaque test reproduit l'attaque constatée et vérifie qu'elle échoue.
 * Nécessite TEST_DATABASE_URL (PostgreSQL local).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, candidateId, createAuthUser, createTestDatabase, grantRole, type Db } from "./helpers";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

const U = {
  alice: "00000000-0000-4000-8000-0000000002a1",
  bob: "00000000-0000-4000-8000-0000000002b0",
  admin: "00000000-0000-4000-8000-0000000002ad",
  manager: "00000000-0000-4000-8000-0000000002e1",
  recruiter: "00000000-0000-4000-8000-0000000002f1",
};

d("Audit de sécurité : non-régression", () => {
  let db: Db;
  let drop: () => Promise<void>;
  let alice: string, bob: string, orgId: string, offerId: string, draftId: string;

  beforeAll(async () => {
    ({ client: db, drop } = await createTestDatabase(url!));
    await createAuthUser(db, U.alice, "alice@example.test", { first_name: "Alice", last_name: "Test", accepted_terms: "true" });
    await createAuthUser(db, U.bob, "bob@example.test", { first_name: "Bob", last_name: "Test", accepted_terms: "true" });
    for (const [id, email] of [[U.admin, "admin@yen.test"], [U.manager, "manager@yen.test"]]) {
      await createAuthUser(db, id, email, { account_type: "partner" });
      await db.query("update public.profiles set account_type = 'staff' where id = $1", [id]);
    }
    await createAuthUser(db, U.recruiter, "rh@entreprise.test", { account_type: "partner" });
    await grantRole(db, U.admin, "super_admin");
    await grantRole(db, U.manager, "insertion_manager");
    await grantRole(db, U.recruiter, "partner");
    alice = await candidateId(db, U.alice);
    bob = await candidateId(db, U.bob);
    orgId = (await db.query(
      "insert into public.organizations (name, status, portal_enabled, is_public, contact_email, contact_phone) values ('Entreprise', 'actif', true, true, 'rh-interne@entreprise.test', '+224 600 00 00 00') returning id")).rows[0].id;
    await db.query("insert into public.partner_memberships (organization_id, user_id, status) values ($1, $2, 'actif')", [orgId, U.recruiter]);
    offerId = (await db.query(
      "insert into public.job_offers (organization_id, title, description, offer_type, status, deadline) values ($1, 'Stage dev', 'Stage', 'stage', 'publiee', current_date + 30) returning id", [orgId])).rows[0].id;
    draftId = (await db.query(
      "insert into public.job_offers (organization_id, title, description, offer_type, status) values ($1, 'Brouillon', 'x', 'emploi', 'brouillon') returning id", [orgId])).rows[0].id;
    // Bob a postulé : sa candidature est visible du partenaire
    await asUser(db, U.bob, () => db.query("insert into public.applications (offer_id, candidate_id) values ($1, $2)", [offerId, bob]), { commit: true });
  }, 60_000);

  afterAll(async () => { await drop?.(); });

  const as = <T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = [], opts: { commit?: boolean } = {}) =>
    asUser(db, user, async () => (await db.query(sql, params)).rows as T[], opts);

  it("un compte désactivé perd tout accès candidat, et le partenaire ne le voit plus", async () => {
    expect((await as(U.recruiter, "select public.partner_candidate_data($1) is not null as ok", [bob]))[0].ok).toBe(true);
    await db.query("update public.profiles set is_active = false where id = $1", [U.bob]);
    try {
      expect((await as(U.bob, "select public.auth_candidate_id() id"))[0].id).toBeNull();
      const upd = await asUser(db, U.bob, () => db.query("update public.candidate_profiles set headline = 'pirate' where user_id = $1", [U.bob]));
      expect(upd.rowCount).toBe(0);
      await expect(as(U.bob, "insert into public.applications (offer_id, candidate_id) values ($1, $2)", [draftId, bob])).rejects.toThrow();
      await expect(as(U.bob, "insert into storage.objects (bucket_id, name) values ('candidate-documents', $1)", [`${U.bob}/cv.pdf`])).rejects.toThrow();
      await expect(as(U.bob, "select public.start_assessment_attempt((select id from public.assessments where status = 'publie' limit 1))")).rejects.toThrow(/réservée aux candidats/);
      expect((await as(U.recruiter, "select public.partner_candidate_data($1) is not null as ok", [bob]))[0].ok).toBe(false);
      expect((await as(U.recruiter, "select public.partner_candidate_data($1) d", [bob]))[0].d).toBeNull();
    } finally {
      await db.query("update public.profiles set is_active = true where id = $1", [U.bob]);
    }
  });

  it("seul un administrateur ferme les sessions d'un compte", async () => {
    await expect(as(U.alice, "select public.revoke_user_sessions($1)", [U.bob])).rejects.toThrow(/users.manage/);
    const [r] = await as<{ ok: boolean }>(U.admin, "select public.revoke_user_sessions($1) ok", [U.bob]);
    expect(typeof r.ok).toBe("boolean");
  });

  it("un lien de notification contenant un caractère de contrôle est neutralisé", async () => {
    // les candidats ne rédigent plus de notification ; même un membre du personnel ne peut pas glisser un lien externe
    await expect(as(U.alice, "select public.notify_staff('users.manage', 'systeme', 'Piège', '', '/')")).rejects.toThrow(/non autorisée/);
    await as(U.manager, "select public.notify_staff('users.manage', 'systeme', 'Piège', '', '/' || chr(9) || '/evil.example')", [], { commit: true });
    await as(U.manager, "select public.notify_staff('users.manage', 'systeme', 'Normal', '', '/admin/utilisateurs?page=2')", [], { commit: true });
    const rows = await db.query("select title, link from public.notifications where user_id = $1 and title in ('Piège', 'Normal') order by title", [U.admin]);
    expect(rows.rows).toEqual([{ title: "Normal", link: "/admin/utilisateurs?page=2" }, { title: "Piège", link: null }]);
  });

  it("une tentative abandonnée compte pour le délai entre deux tentatives", async () => {
    const assessment = (await db.query("select id from public.assessments where status = 'publie' and cooldown_hours > 0 limit 1")).rows[0].id;
    const [{ id }] = await as<{ id: string }>(U.alice, "select public.start_assessment_attempt($1) id", [assessment], { commit: true });
    await as(U.alice, "select public.get_attempt_questions($1)", [id]);
    await db.query("update public.assessment_attempts set deadline_at = now() - interval '1 hour' where id = $1", [id]);
    await expect(as(U.alice, "select public.start_assessment_attempt($1)", [assessment])).rejects.toThrow(/Vous pourrez repasser/);
    // et ses questions ne sont plus lisibles après le temps imparti
    await expect(as(U.alice, "select public.get_attempt_questions($1)", [id])).rejects.toThrow(/temps imparti/);
  });

  it("un partenaire ne modifie pas une offre publiée ni les pondérations, mais peut la clôturer", async () => {
    await expect(as(U.recruiter, "update public.job_offers set description = 'Arnaque' where id = $1", [offerId])).rejects.toThrow(/ne peut plus être modifiée/);
    await expect(as(U.recruiter, "update public.job_offers set scoring_weights = '{\"assessments\": 100}' where id = $1", [draftId])).rejects.toThrow(/non autorisée/);
    const ok = await asUser(db, U.recruiter, () => db.query("update public.job_offers set title = 'Brouillon modifié' where id = $1", [draftId]));
    expect(ok.rowCount).toBe(1);
    const closed = await asUser(db, U.recruiter, () => db.query("update public.job_offers set status = 'fermee' where id = $1", [offerId]));
    expect(closed.rowCount).toBe(1);
  });

  it("la limitation de débit n'est plus utilisable sans connexion ni sur la clé d'un autre", async () => {
    await expect(as(null, "select public.rate_limit_hit('login:email:admin@yen.test')")).rejects.toThrow(/permission/);
    await expect(as(U.alice, "select public.rate_limit_hit('login:email:admin@yen.test')")).rejects.toThrow(/inconnue|invalide/);
  });

  it("les coordonnées internes des organisations ne sont visibles ni des visiteurs ni des candidats", async () => {
    await expect(as(null, "select contact_email from public.organizations")).rejects.toThrow(/permission/);
    const pub = await as(null, "select name from public.organizations");
    expect(pub).toEqual([{ name: "Entreprise" }]);
    const cand = await as(U.alice, "select contact_email from public.organizations");
    expect(cand).toHaveLength(0);
    const member = await as(U.recruiter, "select contact_email from public.organizations");
    expect(member).toEqual([{ contact_email: "rh-interne@entreprise.test" }]);
  });

  it("une étape interne YEN et son motif restent invisibles du candidat et du partenaire", async () => {
    const app = (await db.query("select id from public.applications where candidate_id = $1", [bob])).rows[0].id;
    await asUser(db, U.manager, async () => {
      await db.query("update public.applications set status = 'en_revue', decision_reason = null where id = $1", [app]);
      await db.query("select public.hide_application_event($1, 'en_revue', 'Doute sur le diplôme')", [app]);
    }, { commit: true });
    const partner = await as(U.recruiter, "select note from public.application_events where application_id = $1 and to_status = 'en_revue'", [app]);
    expect(partner).toHaveLength(0);
    const cand = await as(U.bob, "select note from public.application_events where application_id = $1 and to_status = 'en_revue'", [app]);
    expect(cand).toHaveLength(0);
    const reason = await as<{ decision_reason: string | null }>(U.bob, "select decision_reason from public.applications where id = $1", [app]);
    expect(reason[0].decision_reason).toBeNull();
    const staff = await as(U.manager, "select note from public.application_events where application_id = $1 and to_status = 'en_revue'", [app]);
    expect(staff).toEqual([{ note: "Doute sur le diplôme" }]);
  });

  it("le candidat ne fait évoluer son pipeline que par ses propres actions", async () => {
    const app = (await db.query("select id from public.applications where candidate_id = $1", [bob])).rows[0].id;
    await db.query("update public.applications set status = 'preselectionnee' where id = $1", [app]);
    await expect(as(U.bob, "select public.sync_application_pipeline($1)", [app])).rejects.toThrow(/non autorisée/);
  });

  it("les liens web non http(s) sont refusés en base", async () => {
    await expect(as(U.alice, "update public.candidate_profiles set linkedin_url = 'javascript:alert(1)' where user_id = $1", [U.alice])).rejects.toThrow(/_http/);
    const ok = await asUser(db, U.alice, () => db.query("update public.candidate_profiles set linkedin_url = 'https://linkedin.com/in/alice' where user_id = $1", [U.alice]));
    expect(ok.rowCount).toBe(1);
  });

  it("aucune fonction n'est exécutable sans connexion, et les visiteurs ne lisent que le catalogue", async () => {
    const n = await db.query(`select count(*)::int n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
      where ns.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')`);
    expect(n.rows[0].n).toBe(0);
    for (const table of ["profiles", "candidate_profiles", "job_offers", "applications", "notifications", "audit_logs", "partner_memberships"]) {
      await expect(as(null, `select 1 from public.${table} limit 1`)).rejects.toThrow(/permission/);
    }
    expect((await as(null, "select count(*)::int n from public.engineering_domains"))[0].n).toBeGreaterThan(0);
  });

  it("les fonctions internes ne sont pas appelables par un compte connecté", async () => {
    for (const sql of [
      "select public._candidate_completion($1)", "select public.partner_can_view_candidate($1)", "select public.has_consent($1, 'partage_partenaires')",
      "select public._candidate_is_active($1)",
    ]) {
      await expect(as(U.recruiter, sql, [alice])).rejects.toThrow(/permission/);
    }
    await expect(as(U.alice, "select public._as_service($1)", [U.alice])).rejects.toThrow(/permission/);
    await expect(as(U.alice, "select public._notify($1, 'systeme', 'x', '', null)", [U.admin])).rejects.toThrow(/permission/);
  });

  it("le journal applicatif n'accepte que les actions connues", async () => {
    await expect(as(U.alice, "select public.log_audit('user_promoted', 'profiles', 'x')")).rejects.toThrow(/invalide/);
    await as(U.alice, "select public.log_audit('document_downloaded', 'candidate_documents', 'y')", [], { commit: true });
    expect((await db.query("select actor_id from public.audit_logs where entity_id = 'y'")).rows).toEqual([{ actor_id: U.alice }]);
  });

  it("les consentements ne sont pas consultables sans connexion", async () => {
    await expect(as(null, "select public.has_consent($1, 'partage_partenaires')", [alice])).rejects.toThrow(/permission/);
  });
});
