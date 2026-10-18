/**
 * Jeu de données de DÉMONSTRATION — entièrement FICTIF.
 *  - Tous les comptes utilisent le domaine réservé « demo.yen-career-bridge.invalid ».
 *  - Toutes les lignes sont marquées is_demo = true et les noms portent la mention « (démo) ».
 *  - Les tableaux de bord excluent ces données par défaut.
 *
 * Usage : npx tsx scripts/seed-demo.ts            (création)
 *         npx tsx scripts/seed-demo.ts --reset    (suppression de toutes les données de démo)
 * Refuse de s'exécuter si NODE_ENV=production, sauf --allow-production.
 */
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const DOMAIN = "demo.yen-career-bridge.invalid";

const CANDIDATES = [
  { first: "Mariama", last: "Diallo (démo)", city: "Conakry", domain: "genie-informatique-developpement", program: "Développement web full-stack", level: "Licence", year: 2025, status: "diplome", headline: "Développeuse web junior (profil fictif)", skills: [["javascript-typescript", "intermediaire"], ["developpement-web-frontend", "intermediaire"], ["bases-de-donnees-sql", "debutant"], ["git-versionnement", "intermediaire"]], demonstrated: [["javascript-typescript", "intermediaire", 82], ["developpement-web-frontend", "intermediaire", 76], ["git-versionnement", "debutant", 70]], project: { title: "Annuaire d'artisans (démo)", skills: ["javascript-typescript", "developpement-web-frontend"], verified: true } },
  { first: "Ibrahima", last: "Camara (démo)", city: "Kindia", domain: "reseaux-telecommunications", program: "Administration réseaux", level: "BTS", year: 2024, status: "en_recherche", headline: "Technicien réseaux (profil fictif)", skills: [["modele-tcp-ip-adressage", "intermediaire"], ["commutation-vlan", "intermediaire"], ["supervision-reseau", "debutant"]], demonstrated: [["modele-tcp-ip-adressage", "intermediaire", 88], ["commutation-vlan", "debutant", 64]], project: { title: "Maquette réseau d'un lycée (démo)", skills: ["commutation-vlan"], verified: false } },
  { first: "Fatoumata", last: "Bah (démo)", city: "Conakry", domain: "energies-renouvelables", program: "Installateur solaire", level: "Licence", year: 2025, status: "diplome", headline: "Technicienne en énergie solaire (profil fictif)", skills: [["solaire-photovoltaique", "intermediaire"], ["stockage-energie", "debutant"]], demonstrated: [["solaire-photovoltaique", "intermediaire", 79]], project: { title: "Kit solaire pour un centre de santé (démo)", skills: ["solaire-photovoltaique"], verified: true } },
  { first: "Mamadou", last: "Sylla (démo)", city: "Boké", domain: "genie-mecanique-maintenance", program: "Maintenance industrielle", level: "BTS", year: 2023, status: "en_recherche", headline: "Technicien de maintenance (profil fictif)", skills: [["maintenance-industrielle", "intermediaire"], ["hydraulique-pneumatique", "debutant"]], demonstrated: [["maintenance-industrielle", "intermediaire", 71]], project: null },
  { first: "Aïssatou", last: "Barry (démo)", city: "Labé", domain: "intelligence-artificielle-donnees", program: "Analyse de données", level: "Master", year: 2026, status: "etudiant", headline: "Étudiante en science des données (profil fictif)", skills: [["analyse-donnees", "intermediaire"], ["statistiques", "intermediaire"], ["python", "intermediaire"]], demonstrated: [], project: { title: "Tableau de bord des prix du marché (démo)", skills: ["analyse-donnees", "python"], verified: false } },
  { first: "Ousmane", last: "Keïta (démo)", city: "Conakry", domain: "genie-informatique-developpement", program: "Développement web full-stack", level: "Licence", year: 2025, status: "diplome", headline: "Développeur back-end junior (profil fictif)", skills: [["developpement-backend-api", "intermediaire"], ["bases-de-donnees-sql", "intermediaire"], ["python", "intermediaire"]], demonstrated: [["developpement-backend-api", "intermediaire", 74], ["bases-de-donnees-sql", "intermediaire", 81]], project: { title: "API de suivi de stocks (démo)", skills: ["developpement-backend-api", "bases-de-donnees-sql"], verified: true } },
] as const;

function arg(name: string) { return process.argv.includes(`--${name}`); }

async function reset(supabase: SupabaseClient) {
  const { data } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const demoUsers = (data?.users ?? []).filter((u) => u.email?.endsWith(`@${DOMAIN}`));
  for (const u of demoUsers) await supabase.auth.admin.deleteUser(u.id);
  await supabase.from("organizations").delete().eq("is_demo", true);
  console.log(`Données de démonstration supprimées (${demoUsers.length} compte(s)).`);
}

async function main() {
  if (process.env.NODE_ENV === "production" && !arg("allow-production")) throw new Error("Refus : NODE_ENV=production (utilisez --allow-production en connaissance de cause).");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SECRET_KEY sont requis.");
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  if (arg("reset")) return reset(supabase);

  const password = process.env.DEMO_PASSWORD ?? `Demo-${randomBytes(6).toString("hex")}A1`;
  const skillId = async (slug: string) => (await supabase.from("skills").select("id").eq("slug", slug).single()).data!.id as string;
  const domainId = async (slug: string) => (await supabase.from("engineering_domains").select("id").eq("slug", slug).single()).data!.id as string;

  // Organisation et recruteur fictifs
  const { data: org, error: orgErr } = await supabase.from("organizations").insert({
    name: "Organisation Démo SARL (fictive)", sector: "Ingénierie (démonstration)", description: "Organisation fictive utilisée pour la démonstration de la plateforme.",
    city: "Conakry", status: "actif", portal_enabled: true, is_public: false, is_demo: true,
  }).select("id").single();
  if (orgErr) throw orgErr;
  const { data: rec } = await supabase.auth.admin.createUser({ email: `recruteur@${DOMAIN}`, password, email_confirm: true, user_metadata: { first_name: "Recruteur", last_name: "(démo)", account_type: "partner" } });
  await supabase.from("profiles").update({ is_demo: true }).eq("id", rec!.user!.id);
  await supabase.from("partner_memberships").insert({ organization_id: org!.id, user_id: rec!.user!.id, status: "actif", role_in_org: "administrateur_org" });
  await supabase.from("user_roles").insert({ user_id: rec!.user!.id, role: "partner" });

  // Offres fictives
  const offers = [
    { title: "Stage développeur web (démo)", type: "stage", domain: "genie-informatique-developpement", skills: [["javascript-typescript", "intermediaire", true], ["developpement-web-frontend", "intermediaire", false], ["git-versionnement", "debutant", false]] },
    { title: "Technicien solaire junior (démo)", type: "emploi", domain: "energies-renouvelables", skills: [["solaire-photovoltaique", "intermediaire", true], ["securite-electrique", "intermediaire", false]] },
  ] as const;
  const offerIds: string[] = [];
  for (const o of offers) {
    const { data, error } = await supabase.from("job_offers").insert({
      organization_id: org!.id, title: o.title, description: "Offre fictive créée pour la démonstration de la plateforme YEN Career Bridge. Aucune candidature réelle ne doit y être déposée.",
      offer_type: o.type, domain_id: await domainId(o.domain), location: "Conakry", positions: 2, status: "publiee", is_demo: true,
      deadline: new Date(Date.now() + 45 * 86400_000).toISOString().slice(0, 10), education_level: "Licence",
    }).select("id").single();
    if (error) throw error;
    offerIds.push(data.id);
    for (const [slug, level, mandatory] of o.skills) await supabase.from("job_required_skills").insert({ offer_id: data.id, skill_id: await skillId(slug), required_level: level, is_mandatory: mandatory });
  }

  // Candidats fictifs
  const candidateIds: string[] = [];
  for (const [i, c] of CANDIDATES.entries()) {
    const { data: u, error } = await supabase.auth.admin.createUser({
      email: `candidat${i + 1}@${DOMAIN}`, password, email_confirm: true,
      user_metadata: { first_name: c.first, last_name: c.last, city: c.city, account_type: "candidate", accepted_terms: "true", institution: "Établissement fictif", yen_program: c.program, education_level: c.level, graduation_year: String(c.year), status: c.status, opportunity_types: ["stage", "emploi"] },
    });
    if (error) throw error;
    const { data: cand } = await supabase.from("candidate_profiles").select("id").eq("user_id", u.user.id).single();
    const cid = cand!.id as string;
    candidateIds.push(cid);
    await supabase.from("profiles").update({ is_demo: true }).eq("id", u.user.id);
    await supabase.from("candidate_profiles").update({
      is_demo: true, primary_domain_id: await domainId(c.domain), headline: c.headline,
      summary: "Profil entièrement fictif créé pour la démonstration de YEN Career Bridge. Les compétences et projets affichés ne correspondent à aucune personne réelle.",
      pipeline_status: c.demonstrated.length ? "pret_preselection" : "en_evaluation",
    }).eq("id", cid);
    await supabase.from("candidate_consents").upsert(
      ["traitement_ia", "visibilite_vivier", "partage_partenaires", "notifications_externes"].map((t) => ({ candidate_id: cid, consent_type: t, granted: t !== "notifications_externes" })),
      { onConflict: "candidate_id,consent_type" },
    );
    await supabase.from("candidate_education").insert({ candidate_id: cid, institution: "Établissement fictif", degree: c.level, field_of_study: c.program, end_year: c.year, is_yen_program: true });
    await supabase.from("candidate_experiences").insert({ candidate_id: cid, title: "Stagiaire (démo)", organization: "Entreprise fictive", experience_type: "stage", start_date: `${c.year - 1}-03-01`, end_date: `${c.year - 1}-08-31`, description: "Expérience fictive de démonstration." });
    for (const [slug, level] of c.skills) await supabase.from("candidate_skills").insert({ candidate_id: cid, skill_id: await skillId(slug), self_level: level });
    for (const [slug, level, score] of c.demonstrated) {
      await supabase.from("skill_assessments").insert({ candidate_id: cid, skill_id: await skillId(slug), level, score_percent: score, source: "evaluateur", confidence: "moyenne", status: "valide", notes: "Donnée de démonstration (fictive)." });
    }
    if (c.project) {
      const { data: p } = await supabase.from("candidate_projects").insert({ candidate_id: cid, title: c.project.title, description: "Projet fictif de démonstration.", technologies: [], verification_status: c.project.verified ? "verifie" : "non_verifie" }).select("id").single();
      for (const s of c.project.skills) await supabase.from("project_skills").insert({ project_id: p!.id, skill_id: await skillId(s) });
    }
  }

  // Candidatures et placement fictifs
  await supabase.from("applications").insert({ offer_id: offerIds[0], candidate_id: candidateIds[0], origin: "candidat", status: "entretien_programme", visible_to_partner: true, motivation: "Candidature fictive (démo)." });
  await supabase.from("applications").insert({ offer_id: offerIds[1], candidate_id: candidateIds[2], origin: "candidat", status: "acceptee", visible_to_partner: true, decision_reason: "Démonstration" });
  await supabase.from("placements").insert({ candidate_id: candidateIds[2], organization_id: org!.id, organization_name: "Organisation Démo SARL (fictive)", position_title: "Technicienne solaire (démo)", placement_type: "emploi", contract_type: "cdd", start_date: new Date().toISOString().slice(0, 10), duration_months: 12, confirmation_status: "confirme", is_demo: true });
  await supabase.from("candidate_profiles").update({ pipeline_status: "emploi_obtenu" }).eq("id", candidateIds[2]);

  console.log("Données de démonstration (fictives) créées :");
  console.log(`  - ${CANDIDATES.length} candidats : candidat1@${DOMAIN} … candidat${CANDIDATES.length}@${DOMAIN}`);
  console.log(`  - 1 recruteur : recruteur@${DOMAIN}`);
  if (!process.env.DEMO_PASSWORD) console.log(`  Mot de passe commun (affiché une seule fois) : ${password}`);
}

main().catch((e) => {
  console.error("Échec :", e instanceof Error ? e.message : e);
  process.exit(1);
});
