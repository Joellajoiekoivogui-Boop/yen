/**
 * Non-régression de l'audit de sécurité d'octobre 2026 (migration 16).
 * Chaque test reproduit l'attaque constatée et vérifie qu'elle échoue.
 * Nécessite TEST_DATABASE_URL (PostgreSQL local).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, candidateId, createAuthUser, createTestDatabase, grantRole, type Db } from "./helpers";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

const U = {
  alice: "00000000-0000-4000-8000-0000000006a1",
  recruiter: "00000000-0000-4000-8000-0000000006f1",
  partnerManager: "00000000-0000-4000-8000-0000000006e1",
};

d("Audit de sécurité d'octobre 2026 : non-régression", () => {
  let db: Db;
  let drop: () => Promise<void>;
  let alice: string, orgId: string, appId: string, projectId: string, certId: string, skillId: string;

  /** Prépare une ligne sans déclencher les triggers (mise en place des cas de test uniquement). */
  async function raw(sql: string, params: unknown[] = []) {
    await db.query("set session_replication_role = replica");
    try {
      await db.query(sql, params);
    } finally {
      await db.query("set session_replication_role = origin");
    }
  }

  beforeAll(async () => {
    ({ client: db, drop } = await createTestDatabase(url!));
    await createAuthUser(db, U.alice, "alice-audit16@example.test", { first_name: "Alice", last_name: "Audit", accepted_terms: "true" });
    await createAuthUser(db, U.recruiter, "rh-audit16@entreprise.test", { account_type: "partner" });
    await createAuthUser(db, U.partnerManager, "partenariats16@yen.test", { account_type: "partner" });
    await db.query("update public.profiles set account_type = 'staff' where id = $1", [U.partnerManager]);
    await grantRole(db, U.recruiter, "partner");
    await grantRole(db, U.partnerManager, "partner_manager");
    alice = await candidateId(db, U.alice);

    orgId = (await db.query("insert into public.organizations (name, description, status, portal_enabled) values ('Entreprise Audit', 'Description d''origine', 'actif', true) returning id")).rows[0].id;
    await db.query("insert into public.partner_memberships (organization_id, user_id, status) values ($1, $2, 'actif')", [orgId, U.recruiter]);
    const offerId = (await db.query(
      "insert into public.job_offers (organization_id, title, description, offer_type, status, deadline) values ($1, 'Stage audit', 'Stage', 'stage', 'publiee', current_date + 30) returning id",
      [orgId])).rows[0].id;
    appId = (await db.query(
      "insert into public.applications (offer_id, candidate_id, status, origin, visible_to_partner) values ($1, $2, 'soumise', 'candidat', true) returning id",
      [offerId, alice])).rows[0].id;
    skillId = (await db.query("select id from public.skills order by name limit 1")).rows[0].id;
    projectId = (await db.query(
      "insert into public.candidate_projects (candidate_id, title, description, technologies, verification_status) values ($1, 'Site associatif', 'Petit site', array['HTML'], 'verifie') returning id",
      [alice])).rows[0].id;
    certId = (await db.query(
      "insert into public.candidate_certifications (candidate_id, name, issuer, credential_url, verification_status) values ($1, 'PL-300', 'Microsoft', 'https://exemple.test/a', 'verifie') returning id",
      [alice])).rows[0].id;
  }, 60_000);

  afterAll(async () => { await drop?.(); });

  it("la vue des employeurs est en lecture seule : aucune modification ni suppression d'organisation", async () => {
    const seen = await asUser(db, U.alice, async () => (await db.query("select name from public.offer_organizations where id = $1", [orgId])).rows[0]?.name);
    expect(seen).toBe("Entreprise Audit");
    for (const sql of [
      "update public.offer_organizations set description = 'piratée' where id = $1",
      "delete from public.offer_organizations where id = $1",
    ]) {
      await expect(asUser(db, U.alice, () => db.query(sql, [orgId]))).rejects.toThrow(/permission denied/);
    }
    await expect(asUser(db, U.alice, () => db.query("insert into public.offer_organizations (name) values ('Fausse')"))).rejects.toThrow(/permission denied/);
    await expect(asUser(db, null, () => db.query("select 1 from public.offer_organizations"))).rejects.toThrow(/permission denied/);
    expect((await db.query("select description from public.organizations where id = $1", [orgId])).rows[0].description).toBe("Description d'origine");
  });

  it("un projet vérifié perd sa vérification si le candidat change son contenu ou ses compétences", async () => {
    const after = (sql: string, params: unknown[]) => asUser(db, U.alice, async () => {
      await db.query(sql, params);
      return (await db.query("select verification_status from public.candidate_projects where id = $1", [projectId])).rows[0].verification_status;
    });
    expect(await after("update public.candidate_projects set technologies = array['Kubernetes', 'Rust'] where id = $1", [projectId])).toBe("non_verifie");
    expect(await after("update public.candidate_projects set outcomes = 'A dirigé 50 ingénieurs' where id = $1", [projectId])).toBe("non_verifie");
    expect(await after("insert into public.project_skills (project_id, skill_id) values ($1, $2)", [projectId, skillId])).toBe("non_verifie");
    // et ne peut toujours pas se la redonner
    await raw("update public.candidate_projects set verification_status = 'non_verifie' where id = $1", [projectId]);
    try {
      await expect(asUser(db, U.alice, () => db.query("update public.candidate_projects set verification_status = 'verifie' where id = $1", [projectId]))).rejects.toThrow(/réservée à YEN/);
    } finally {
      await raw("update public.candidate_projects set verification_status = 'verifie' where id = $1", [projectId]);
    }
  });

  it("une certification vérifiée perd sa vérification si son lien ou ses dates changent", async () => {
    const status = await asUser(db, U.alice, async () => {
      await db.query("update public.candidate_certifications set credential_url = 'https://autre.test/b', issue_date = '2020-01-01' where id = $1", [certId]);
      return (await db.query("select verification_status from public.candidate_certifications where id = $1", [certId])).rows[0].verification_status;
    });
    expect(status).toBe("non_verifie");
  });

  it("un partenaire ne revient pas sur une décision prise, ni ne signe à la place de quelqu'un", async () => {
    await raw("update public.applications set status = 'refusee', decision_reason = 'Profil incomplet (YEN)', decided_by = $2 where id = $1", [appId, U.partnerManager]);
    await expect(asUser(db, U.recruiter, () => db.query("update public.applications set status = 'acceptee', decision_reason = 'Finalement oui' where id = $1", [appId])))
      .rejects.toThrow(/décision est déjà prise/);
    // sur une candidature en cours, auteur et motif de décision ne se forgent pas
    await raw("update public.applications set status = 'entretien_programme', decision_reason = null, decided_by = null where id = $1", [appId]);
    const row = await asUser(db, U.recruiter, async () => {
      await db.query("update public.applications set decided_by = $2, decision_reason = 'Texte imposé' where id = $1", [appId, U.partnerManager]);
      return (await db.query("select decided_by, decision_reason from public.applications where id = $1", [appId])).rows[0];
    });
    expect(row).toEqual({ decided_by: null, decision_reason: null });
    // sa propre décision est enregistrée à son nom, avec son motif
    const decided = await asUser(db, U.recruiter, async () => {
      await db.query("update public.applications set status = 'acceptee', decision_reason = 'Très bon entretien' where id = $1", [appId]);
      return (await db.query("select decided_by, decision_reason from public.applications where id = $1", [appId])).rows[0];
    });
    expect(decided).toEqual({ decided_by: U.recruiter, decision_reason: "Très bon entretien" });
  });

  it("présélection d'une candidature directe sans en changer le statut", async () => {
    await raw("update public.applications set status = 'soumise', partner_shortlisted = false where id = $1", [appId]);
    const row = await asUser(db, U.recruiter, async () => {
      await db.query("update public.applications set partner_shortlisted = true where id = $1", [appId]);
      return (await db.query("select status, partner_shortlisted from public.applications where id = $1", [appId])).rows[0];
    });
    expect(row).toEqual({ status: "soumise", partner_shortlisted: true });
  });

  it("pipeline : pas de rejeu sur une ancienne candidature, ni sur une candidature retirée", async () => {
    await raw("update public.applications set status = 'refusee', updated_at = now() - interval '2 days' where id = $1", [appId]);
    await expect(asUser(db, U.recruiter, () => db.query("select public.sync_application_pipeline($1)", [appId]))).rejects.toThrow(/non autorisée/);
    await raw("update public.applications set status = 'soumise', updated_at = now() - interval '2 days' where id = $1", [appId]);
    await expect(asUser(db, U.alice, () => db.query("select public.sync_application_pipeline($1)", [appId]))).rejects.toThrow(/non autorisée/);
    // juste après l'action : autorisé
    await raw("update public.applications set status = 'entretien_programme', updated_at = now() where id = $1", [appId]);
    await asUser(db, U.recruiter, () => db.query("select public.sync_application_pipeline($1)", [appId]));
    await raw("update public.applications set status = 'retiree', updated_at = now() where id = $1", [appId]);
    await expect(asUser(db, U.recruiter, () => db.query("select public.sync_application_pipeline($1)", [appId]))).rejects.toThrow(/non autorisée/);
  });

  it("retours de compétences : refusés sur une candidature retirée, et invisibles des partenaires avant validation", async () => {
    await raw("update public.applications set status = 'retiree' where id = $1", [appId]);
    const ratings = JSON.stringify([{ skill_id: skillId, level: "avance" }]);
    await expect(asUser(db, U.recruiter, () => db.query("select public.add_partner_skill_feedback($1, 'Entretien', $2::jsonb)", [appId, ratings]))).rejects.toThrow(/non autorisée/);
    await raw("update public.applications set status = 'entretien_programme' where id = $1", [appId]);
    const n = await asUser(db, U.recruiter, async () => (await db.query("select public.add_partner_skill_feedback($1, 'Entretien', $2::jsonb) n", [appId, ratings])).rows[0].n, { commit: true });
    expect(n).toBe(1);
    await db.query("insert into public.skill_assessments (candidate_id, skill_id, level, source, confidence, status) values ($1, $2, 'intermediaire', 'evaluateur', 'elevee', 'valide')", [alice, skillId]);
    const data = await asUser(db, U.recruiter, async () => (await db.query("select public.partner_candidate_data($1) d", [alice])).rows[0].d);
    expect(data.skill_assessments.map((s: { status: string }) => s.status)).toEqual(["valide"]);
  });

  it("la gestion des partenaires ne lit plus les profils des candidats", async () => {
    const seen = await asUser(db, U.partnerManager, async () => (await db.query("select id from public.profiles where id = any($1)", [[U.alice, U.recruiter]])).rows.map((r) => r.id));
    expect(seen).toEqual([U.recruiter]);
  });

  it("un partenaire ne voit plus les candidatures d'un compte désactivé", async () => {
    await raw("update public.applications set status = 'entretien_programme' where id = $1", [appId]);
    const visible = () => asUser(db, U.recruiter, async () => (await db.query("select id from public.applications where id = $1", [appId])).rowCount);
    expect(await visible()).toBe(1);
    await db.query("update public.profiles set is_active = false where id = $1", [U.alice]);
    try {
      expect(await visible()).toBe(0);
    } finally {
      await db.query("update public.profiles set is_active = true where id = $1", [U.alice]);
    }
  });

  it("le journal : un candidat n'écrit pas d'action réservée au personnel YEN", async () => {
    await expect(asUser(db, U.alice, () => db.query("select public.log_audit('partner_member_approved', 'partner_memberships', 'x')"))).rejects.toThrow(/Entrée de journal invalide/);
    await asUser(db, U.alice, () => db.query("select public.log_audit('password_changed', 'profiles', $1)", [U.alice]));
    await asUser(db, U.partnerManager, () => db.query("select public.log_audit('partner_request_approved', 'organizations', $1)", [orgId]));
  });
});
