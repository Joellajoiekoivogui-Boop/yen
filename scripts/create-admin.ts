/**
 * Création contrôlée d'un compte du personnel YEN (premier administrateur
 * principal, responsable d'insertion, évaluateur…). À exécuter par un
 * opérateur disposant de la clé de service, jamais depuis l'application.
 *
 * Usage :
 *   npx tsx scripts/create-admin.ts --email admin@yen.org --role super_admin --first "Prénom" --last "Nom"
 * Le mot de passe est généré aléatoirement et affiché UNE fois (à changer à la première connexion),
 * ou fourni via la variable ADMIN_PASSWORD. Aucun mot de passe par défaut n'existe.
 */
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const ROLES = ["super_admin", "insertion_manager", "evaluator", "partner_manager"] as const;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SECRET_KEY sont requis.");
  const email = arg("email");
  const role = (arg("role") ?? "super_admin") as (typeof ROLES)[number];
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("--email invalide");
  if (!ROLES.includes(role)) throw new Error(`--role doit être l'un de : ${ROLES.join(", ")}`);

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const password = process.env.ADMIN_PASSWORD ?? `${randomBytes(12).toString("base64url")}Aa1!`;
  let userId: string;
  const { data: created, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name: arg("first") ?? "", last_name: arg("last") ?? "", account_type: "partner" },
  });
  if (error) {
    // Compte existant : on attribue simplement le rôle
    const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = list?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (!existing) throw error;
    userId = existing.id;
    console.log(`Compte existant ${email} : attribution du rôle ${role}.`);
  } else {
    userId = created.user.id;
    console.log(`Compte créé : ${email}`);
    if (!process.env.ADMIN_PASSWORD) console.log(`Mot de passe temporaire (affiché une seule fois) : ${password}`);
  }
  await supabase.from("profiles").update({ account_type: "staff" }).eq("id", userId);
  const { error: roleErr } = await supabase.from("user_roles").upsert({ user_id: userId, role }, { onConflict: "user_id,role" });
  if (roleErr) throw roleErr;
  console.log(`Rôle « ${role} » attribué.`);
}

main().catch((e) => {
  console.error("Échec :", e instanceof Error ? e.message : e);
  process.exit(1);
});
