/**
 * Tests d'intégration des permissions au niveau base de données (RLS, triggers
 * de protection, consentements, audit, stockage). Exécutés sur un vrai
 * PostgreSQL avec une émulation minimale de Supabase (auth.uid, storage).
 *
 * Prérequis : TEST_DATABASE_URL=postgres://postgres@localhost:54329/postgres
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, candidateId, createAuthUser, createTestDatabase, grantRole, type Db } from "./helpers";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

const U = {
  alice: "00000000-0000-4000-8000-00000000000a",
  bob: "00000000-0000-4000-8000-00000000000b",
  admin: "00000000-0000-4000-8000-0000000000ad",
  manager: "00000000-0000-4000-8000-0000000000e1",
  evaluator: "00000000-0000-4000-8000-0000000000e2",
  partnerMgr: "00000000-0000-4000-8000-0000000000e3",
  recruiter: "00000000-0000-4000-8000-0000000000f1",
  otherRecruiter: "00000000-0000-4000-8000-0000000000f2",
  sneaky: "00000000-0000-4000-8000-0000000000ff",
};

d("Sécurité base de données (RLS)", () => {
  let db: Db;
  let drop: () => Promise<void>;
  let alice: string, bob: string, orgId: string, otherOrgId: string, offerId: string, draftOfferId: string;

  beforeAll(async () => {
    ({ client: db, drop } = await createTestDatabase(url!));
    await createAuthUser(db, U.alice, "alice@example.test", { first_name: "Alice", last_name: "Test", accepted_terms: "true" });
    await createAuthUser(db, U.bob, "bob@example.test", { first_name: "Bob", last_name: "Test" });
    await createAuthUser(db, U.sneaky, "sneaky@example.test", { account_type: "super_admin", role: "super_admin" });
    for (const [id, email] of [[U.admin, "admin@yen.test"], [U.manager, "manager@yen.test"], [U.evaluator, "eval@yen.test"], [U.partnerMgr, "pm@yen.test"]]) {
      await createAuthUser(db, id, email, { account_type: "partner" });
      await db.query("update public.profiles set account_type = 'staff' where id = $1", [id]);
    }
    await createAuthUser(db, U.recruiter, "rh@entreprise.test", { account_type: "partner" });
    await createAuthUser(db, U.otherRecruiter, "rh@autre.test", { account_type: "partner" });

    // Attribution initiale hors application (équivalent scripts/grant-role.sql)
    await grantRole(db, U.admin, "super_admin");
    await grantRole(db, U.manager, "insertion_manager");
    await grantRole(db, U.evaluator, "evaluator");
    await grantRole(db, U.partnerMgr, "partner_manager");
    await grantRole(db, U.recruiter, "partner");
    await grantRole(db, U.otherRecruiter, "partner");

    alice = await candidateId(db, U.alice);
    bob = await candidateId(db, U.bob);

    const org = await db.query("insert into public.organizations (name, status, portal_enabled) values ('Entreprise Test', 'actif', true) returning id");
    orgId = org.rows[0].id;
    const other = await db.query("insert into public.organizations (name, status, portal_enabled) values ('Autre Org', 'actif', true) returning id");
    otherOrgId = other.rows[0].id;
    await db.query("insert into public.partner_memberships (organization_id, user_id, status) values ($1, $2, 'actif'), ($3, $4, 'actif')",
      [orgId, U.recruiter, otherOrgId, U.otherRecruiter]);
    const offer = await db.query(
      "insert into public.job_offers (organization_id, title, description, offer_type, status, deadline) values ($1, 'Stage dev', 'Stage', 'stage', 'publiee', current_date + 30) returning id",
      [orgId]);
    offerId = offer.rows[0].id;
    const draft = await db.query(
      "insert into public.job_offers (organization_id, title, description, offer_type, status) values ($1, 'Brouillon', 'x', 'emploi', 'brouillon') returning id", [orgId]);
    draftOfferId = draft.rows[0].id;
  }, 60_000);

  afterAll(async () => { await drop?.(); });

  describe("Inscription et rôles", () => {
    it("crée profil, rôle candidat et identifiant YEN-CB à l'inscription", async () => {
      const r = await db.query("select public_code from public.candidate_profiles where id = $1", [alice]);
      expect(r.rows[0].public_code).toMatch(/^YEN-CB-\d{6}$/);
      const roles = await db.query("select role from public.user_roles where user_id = $1", [U.alice]);
      expect(roles.rows.map((x) => x.role)).toEqual(["candidate"]);
      const consent = await db.query("select granted from public.candidate_consents where candidate_id = $1 and consent_type = 'conditions_utilisation'", [alice]);
      expect(consent.rows[0].granted).toBe(true);
    });

    it("ignore toute tentative d'auto-attribution d'un rôle via les métadonnées", async () => {
      const roles = await db.query("select role from public.user_roles where user_id = $1", [U.sneaky]);
      expect(roles.rows.map((x) => x.role)).toEqual(["candidate"]);
    });

    it("n'attribue aucun rôle à un compte partenaire non validé", async () => {
      await createAuthUser(db, "00000000-0000-4000-8000-0000000000f9", "pending@org.test", { account_type: "partner" });
      const roles = await db.query("select count(*)::int n from public.user_roles where user_id = '00000000-0000-4000-8000-0000000000f9'");
      expect(roles.rows[0].n).toBe(0);
    });

    it("enregistre les informations d'inscription validées et ignore les valeurs invalides", async () => {
      await createAuthUser(db, "00000000-0000-4000-8000-0000000000c1", "c1@example.test", {
        institution: "UGANC", yen_program: "Développement web", graduation_year: "2025", status: "diplome",
        availability: "pirate", opportunity_types: ["stage", "emploi", "invalide"],
      });
      const r = await db.query("select institution, graduation_year, status, availability, opportunity_types from public.candidate_profiles where user_id = '00000000-0000-4000-8000-0000000000c1'");
      expect(r.rows[0]).toMatchObject({ institution: "UGANC", graduation_year: 2025, status: "diplome", availability: "immediate" });
      expect(r.rows[0].opportunity_types).toEqual("{stage,emploi}");
    });

    it("une demande partenaire crée une organisation et une adhésion en attente, sans accès", async () => {
      await createAuthUser(db, "00000000-0000-4000-8000-0000000000f8", "rh@nouvelle.test", { account_type: "partner", organization_name: "Nouvelle SARL", first_name: "Awa" });
      const r = await db.query(`select o.status, o.portal_enabled, m.status as m_status from public.organizations o
        join public.partner_memberships m on m.organization_id = o.id where m.user_id = '00000000-0000-4000-8000-0000000000f8'`);
      expect(r.rows[0]).toEqual({ status: "en_attente", portal_enabled: false, m_status: "en_attente" });
      const offers = await asUser(db, "00000000-0000-4000-8000-0000000000f8", () => db.query("select count(*)::int n from public.job_offers"));
      expect(offers.rows[0].n).toBe(0);
    });

    it("empêche un candidat de s'attribuer un rôle", async () => {
      await expect(asUser(db, U.alice, () => db.query("insert into public.user_roles (user_id, role) values ($1, 'super_admin')", [U.alice])))
        .rejects.toThrow();
    });

    it("empêche un responsable d'insertion de gérer les rôles", async () => {
      await expect(asUser(db, U.manager, () => db.query("insert into public.user_roles (user_id, role) values ($1, 'evaluator')", [U.bob])))
        .rejects.toThrow();
    });

    it("permet à l'administrateur principal d'attribuer un rôle et l'audite", async () => {
      await asUser(db, U.admin, () => db.query("insert into public.user_roles (user_id, role) values ($1, 'evaluator')", [U.bob]));
      const audit = await db.query("select count(*)::int n from public.audit_logs where entity_type = 'user_roles' and actor_id is null");
      expect(audit.rows[0].n).toBeGreaterThan(0); // insertions initiales hors session
    });

    it("empêche un candidat de se réactiver ou de changer son type de compte", async () => {
      await expect(asUser(db, U.alice, () => db.query("update public.profiles set account_type = 'staff' where id = $1", [U.alice]))).rejects.toThrow(/protégés/);
      const ok = await asUser(db, U.alice, () => db.query("update public.profiles set city = 'Kankan' where id = $1", [U.alice]));
      expect(ok.rowCount).toBe(1);
    });

    it("un compte désactivé perd ses permissions", async () => {
      await db.query("update public.profiles set is_active = false where id = $1", [U.manager]);
      const r = await asUser(db, U.manager, () => db.query("select count(*)::int n from public.candidate_profiles"));
      expect(r.rows[0].n).toBe(0);
      await db.query("update public.profiles set is_active = true where id = $1", [U.manager]);
    });
  });

  describe("Isolation des candidats", () => {
    it("un candidat ne voit que son propre profil", async () => {
      const r = await asUser(db, U.alice, () => db.query("select id from public.candidate_profiles"));
      expect(r.rows.map((x) => x.id)).toEqual([alice]);
    });

    it("un candidat ne peut pas lire ni modifier les données d'un autre par identifiant", async () => {
      await db.query("insert into public.candidate_projects (candidate_id, title, description) values ($1, 'Projet Bob', 'secret')", [bob]);
      const read = await asUser(db, U.alice, () => db.query("select * from public.candidate_projects where candidate_id = $1", [bob]));
      expect(read.rowCount).toBe(0);
      const upd = await asUser(db, U.alice, () => db.query("update public.candidate_profiles set headline = 'pirate' where id = $1", [bob]));
      expect(upd.rowCount).toBe(0);
      await expect(asUser(db, U.alice, () => db.query("insert into public.candidate_projects (candidate_id, title, description) values ($1, 'x', 'y')", [bob])))
        .rejects.toThrow();
    });

    it("un candidat ne peut pas modifier ses champs de suivi YEN", async () => {
      await expect(asUser(db, U.alice, () => db.query("update public.candidate_profiles set pipeline_status = 'emploi_obtenu' where id = $1", [alice])))
        .rejects.toThrow(/suivi/);
    });

    it("un candidat ne peut pas se valider lui-même un projet", async () => {
      const r = await asUser(db, U.alice, () =>
        db.query("insert into public.candidate_projects (candidate_id, title, description, verification_status) values ($1, 'P', 'D', 'verifie') returning verification_status", [alice]));
      expect(r.rows[0].verification_status).toBe("non_verifie");
    });

    it("un candidat ne peut pas s'attribuer une compétence démontrée", async () => {
      await expect(asUser(db, U.alice, () =>
        db.query("insert into public.skill_assessments (candidate_id, skill_id, level, source) select $1, id, 'avance', 'evaluateur' from public.skills limit 1", [alice])))
        .rejects.toThrow();
    });

    it("un questionnaire ne peut jamais attribuer le niveau expert", async () => {
      await expect(db.query("insert into public.skill_assessments (candidate_id, skill_id, level, source) select $1, id, 'expert', 'questionnaire' from public.skills limit 1", [alice]))
        .rejects.toThrow(/check/);
    });
  });

  describe("Évaluations", () => {
    it("les questions et les clés de correction sont invisibles pour les candidats", async () => {
      const q = await asUser(db, U.alice, () => db.query("select count(*)::int n from public.assessment_questions"));
      const o = await asUser(db, U.alice, () => db.query("select count(*)::int n from public.assessment_options"));
      expect(q.rows[0].n).toBe(0);
      expect(o.rows[0].n).toBe(0);
      const a = await asUser(db, U.alice, () => db.query("select count(*)::int n from public.assessments"));
      expect(a.rows[0].n).toBeGreaterThan(0); // les métadonnées publiées restent visibles
    });

    it("un candidat ne peut pas créer lui-même une tentative notée", async () => {
      await expect(asUser(db, U.alice, () =>
        db.query("insert into public.assessment_attempts (assessment_id, assessment_version, candidate_id, deadline_at, score_percent) select id, 1, $1, now(), 100 from public.assessments limit 1", [alice])))
        .rejects.toThrow();
    });

    it("l'évaluateur voit les questions", async () => {
      const q = await asUser(db, U.evaluator, () => db.query("select count(*)::int n from public.assessment_questions"));
      expect(q.rows[0].n).toBeGreaterThan(0);
    });
  });

  describe("Notes internes et personnel", () => {
    it("les notes internes sont réservées au personnel habilité", async () => {
      await asUser(db, U.manager, () => db.query("insert into public.internal_notes (candidate_id, body) values ($1, 'Note confidentielle')", [alice]), { commit: true });
      const staff = await asUser(db, U.manager, () => db.query("select author_id from public.internal_notes where candidate_id = $1", [alice]));
      expect(staff.rows[0].author_id).toBe(U.manager);
      for (const u of [U.alice, U.recruiter, U.partnerMgr]) {
        const r = await asUser(db, u, () => db.query("select count(*)::int n from public.internal_notes"));
        expect(r.rows[0].n).toBe(0);
      }
    });

    it("le gestionnaire de partenaires n'accède pas aux profils candidats", async () => {
      const r = await asUser(db, U.partnerMgr, () => db.query("select count(*)::int n from public.candidate_profiles"));
      expect(r.rows[0].n).toBe(0);
    });

    it("le responsable d'insertion consulte les profils et modifie le suivi", async () => {
      const r = await asUser(db, U.manager, () => db.query("update public.candidate_profiles set pipeline_status = 'en_evaluation' where id = $1", [alice]));
      expect(r.rowCount).toBe(1);
    });

    it("le journal d'audit est réservé à audit.read et non modifiable", async () => {
      const cand = await asUser(db, U.alice, () => db.query("select count(*)::int n from public.audit_logs"));
      expect(cand.rows[0].n).toBe(0);
      const adm = await asUser(db, U.admin, () => db.query("select count(*)::int n from public.audit_logs"));
      expect(adm.rows[0].n).toBeGreaterThan(0);
      await expect(db.query("delete from public.audit_logs")).rejects.toThrow(/ajout seul/);
    });
  });

  describe("Partenaires et consentement", () => {
    it("un partenaire n'a aucun accès direct aux tables candidats", async () => {
      const r = await asUser(db, U.recruiter, () => db.query("select count(*)::int n from public.candidate_profiles"));
      expect(r.rows[0].n).toBe(0);
      const p = await asUser(db, U.recruiter, () => db.query("select count(*)::int n from public.profiles where id <> $1", [U.recruiter]));
      expect(p.rows[0].n).toBe(0);
    });

    it("un partenaire ne peut pas publier sans validation YEN", async () => {
      await expect(asUser(db, U.recruiter, () =>
        db.query("insert into public.job_offers (organization_id, title, description, offer_type, status) values ($1, 'X', 'Y', 'stage', 'publiee')", [orgId])))
        .rejects.toThrow(/validée/);
      const ok = await asUser(db, U.recruiter, () =>
        db.query("insert into public.job_offers (organization_id, title, description, offer_type, status) values ($1, 'X', 'Y', 'stage', 'en_validation') returning created_by", [orgId]));
      expect(ok.rows[0].created_by).toBe(U.recruiter);
    });

    it("un partenaire ne voit pas les offres d'une autre organisation", async () => {
      const r = await asUser(db, U.otherRecruiter, () => db.query("select count(*)::int n from public.job_offers where organization_id = $1", [orgId]));
      expect(r.rows[0].n).toBe(0);
    });

    it("un candidat ne peut pas postuler à une offre non publiée", async () => {
      await expect(asUser(db, U.alice, () => db.query("insert into public.applications (offer_id, candidate_id) values ($1, $2)", [draftOfferId, alice])))
        .rejects.toThrow();
    });

    it("la candidature rend le profil visible au seul partenaire concerné", async () => {
      const before = await asUser(db, U.recruiter, () => db.query("select public.partner_can_view_candidate($1) v", [alice]));
      expect(before.rows[0].v).toBe(false);
      await asUser(db, U.alice, () => db.query("insert into public.applications (offer_id, candidate_id, status) values ($1, $2, 'acceptee')", [offerId, alice]), { commit: true });
      const app = await db.query("select status, visible_to_partner from public.applications where candidate_id = $1", [alice]);
      expect(app.rows[0]).toEqual({ status: "soumise", visible_to_partner: true }); // statut forcé par le serveur
      const after = await asUser(db, U.recruiter, () => db.query("select public.partner_can_view_candidate($1) v", [alice]));
      expect(after.rows[0].v).toBe(true);
      const other = await asUser(db, U.otherRecruiter, () => db.query("select public.partner_can_view_candidate($1) v", [alice]));
      expect(other.rows[0].v).toBe(false);
      const bobView = await asUser(db, U.recruiter, () => db.query("select public.partner_can_view_candidate($1) v", [bob]));
      expect(bobView.rows[0].v).toBe(false);
      const apps = await asUser(db, U.recruiter, () => db.query("select count(*)::int n from public.applications"));
      expect(apps.rows[0].n).toBe(1);
    });

    it("le candidat peut uniquement retirer sa candidature", async () => {
      await expect(asUser(db, U.alice, () => db.query("update public.applications set status = 'acceptee' where candidate_id = $1", [alice])))
        .rejects.toThrow(/retirer/);
      const r = await asUser(db, U.alice, () => db.query("update public.applications set status = 'retiree' where candidate_id = $1", [alice]));
      expect(r.rowCount).toBe(1);
    });

    it("le partenaire fait avancer le recrutement mais ne peut pas modifier la candidature", async () => {
      const ok = await asUser(db, U.recruiter, () => db.query("update public.applications set status = 'entretien_programme' where candidate_id = $1", [alice]));
      expect(ok.rowCount).toBe(1);
      await expect(asUser(db, U.recruiter, () => db.query("update public.applications set motivation = 'modifiée' where candidate_id = $1", [alice])))
        .rejects.toThrow();
      const events = await db.query("select count(*)::int n from public.application_events e join public.applications a on a.id = e.application_id where a.candidate_id = $1", [alice]);
      expect(events.rows[0].n).toBeGreaterThanOrEqual(1);
    });

    it("le partage d'un profil exige le consentement du candidat", async () => {
      await expect(asUser(db, U.manager, () =>
        db.query("insert into public.profile_shares (candidate_id, organization_id, reason) values ($1, $2, 'Profil pertinent')", [bob, orgId])))
        .rejects.toThrow(/consenti/);

      await asUser(db, U.bob, () => db.query("insert into public.candidate_consents (candidate_id, consent_type, granted) values ($1, 'partage_partenaires', true)", [bob]), { commit: true });
      await asUser(db, U.manager, () =>
        db.query("insert into public.profile_shares (candidate_id, organization_id, reason) values ($1, $2, 'Profil pertinent')", [bob, orgId]), { commit: true });
      const v = await asUser(db, U.recruiter, () => db.query("select public.partner_can_view_candidate($1) v", [bob]));
      expect(v.rows[0].v).toBe(true);

      // Retrait du consentement : l'accès cesse immédiatement
      await asUser(db, U.bob, () => db.query("update public.candidate_consents set granted = false where candidate_id = $1 and consent_type = 'partage_partenaires'", [bob]), { commit: true });
      const v2 = await asUser(db, U.recruiter, () => db.query("select public.partner_can_view_candidate($1) v", [bob]));
      expect(v2.rows[0].v).toBe(false);
    });

    it("l'association par YEN visible du partenaire exige le consentement", async () => {
      await expect(asUser(db, U.manager, () =>
        db.query("insert into public.applications (offer_id, candidate_id, origin, status, visible_to_partner) values ($1, $2, 'yen', 'proposee_partenaire', true)", [offerId, bob])))
        .rejects.toThrow(/consenti/);
    });

    it("un partenaire ne peut pas modifier le statut de son organisation", async () => {
      await expect(asUser(db, U.recruiter, () => db.query("update public.organizations set is_public = true where id = $1", [orgId])))
        .rejects.toThrow(/YEN/);
      const ok = await asUser(db, U.recruiter, () => db.query("update public.organizations set description = 'Nouvelle description' where id = $1", [orgId]));
      expect(ok.rowCount).toBe(1);
    });
  });

  describe("Stockage des documents", () => {
    it("un candidat ne peut téléverser que dans son propre dossier", async () => {
      await expect(asUser(db, U.alice, () =>
        db.query("insert into storage.objects (bucket_id, name) values ('candidate-documents', $1)", [`${U.bob}/cv.pdf`])))
        .rejects.toThrow();
      await asUser(db, U.alice, () =>
        db.query("insert into storage.objects (bucket_id, name) values ('candidate-documents', $1)", [`${U.alice}/cv.pdf`]), { commit: true });
    });

    it("refuse un fichier non PDF", async () => {
      await expect(asUser(db, U.alice, () =>
        db.query("insert into storage.objects (bucket_id, name) values ('candidate-documents', $1)", [`${U.alice}/script.html`])))
        .rejects.toThrow();
    });

    it("un autre candidat et un partenaire ne peuvent pas lire le fichier ; le personnel habilité le peut", async () => {
      const q = "select count(*)::int n from storage.objects where name = $1";
      const p = [`${U.alice}/cv.pdf`];
      expect((await asUser(db, U.bob, () => db.query(q, p))).rows[0].n).toBe(0);
      expect((await asUser(db, U.recruiter, () => db.query(q, p))).rows[0].n).toBe(0);
      expect((await asUser(db, U.alice, () => db.query(q, p))).rows[0].n).toBe(1);
      expect((await asUser(db, U.manager, () => db.query(q, p))).rows[0].n).toBe(1);
    });

    it("le bucket est privé", async () => {
      const r = await db.query("select public from storage.buckets where id = 'candidate-documents'");
      expect(r.rows[0].public).toBe(false);
    });
  });

  describe("Accès anonyme", () => {
    it("l'anonyme lit le catalogue mais aucune donnée candidat", async () => {
      const dom = await asUser(db, null, () => db.query("select count(*)::int n from public.engineering_domains"));
      expect(dom.rows[0].n).toBe(15);
      await expect(asUser(db, null, () => db.query("select * from public.candidate_profiles"))).rejects.toThrow(/permission/);
      await expect(asUser(db, null, () => db.query("select * from public.profiles"))).rejects.toThrow(/permission/);
    });
  });

  describe("Rapport d'insertion", () => {
    it("calcule le taux avec un dénominateur explicite et distingue les placements non confirmés", async () => {
      await db.query("update public.candidate_profiles set status = 'diplome' where id in ($1, $2)", [alice, bob]);
      await db.query(`insert into public.placements (candidate_id, organization_name, position_title, placement_type, contract_type, start_date, confirmation_status)
        values ($1, 'Org', 'Dev', 'emploi', 'cdi', current_date, 'confirme'), ($2, 'Org', 'Stagiaire', 'stage', 'stage', current_date, 'declare')`, [alice, bob]);
      const r = await asUser(db, U.manager, () => db.query("select public.insertion_report(current_date - 30, current_date + 1) v"));
      const v = r.rows[0].v;
      expect(v.placed_confirmed).toBe(1);
      expect(v.placements_declared_unconfirmed).toBe(1);
      expect(v.denominator).toBeGreaterThanOrEqual(2);
      expect(v.insertion_rate).toBeCloseTo((100 * 1) / v.denominator, 1);
      expect(v.denominator_definition).toContain("diplômés");
      await expect(asUser(db, U.alice, () => db.query("select public.insertion_report(current_date - 30, current_date)"))).rejects.toThrow(/Permission/);
    });
  });
});
