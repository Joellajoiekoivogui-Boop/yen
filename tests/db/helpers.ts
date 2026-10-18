import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

const root = path.resolve(__dirname, "../..");

/** Crée une base vierge, applique l'émulation Supabase, les migrations et le catalogue. */
export async function createTestDatabase(adminUrl: string) {
  const dbName = `yen_rls_${process.pid}_${Date.now()}`;
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`create database ${dbName}`);
  await admin.end();

  const url = new URL(adminUrl);
  url.pathname = `/${dbName}`;
  const client = new Client({ connectionString: url.toString() });
  await client.connect();

  await client.query(readFileSync(path.join(root, "tests/db/supabase-stub.sql"), "utf8"));
  const migrationsDir = path.join(root, "supabase/migrations");
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
    await client.query(readFileSync(path.join(migrationsDir, file), "utf8"));
  }
  await client.query(readFileSync(path.join(root, "supabase/seed.sql"), "utf8"));

  const drop = async () => {
    await client.end();
    const a = new Client({ connectionString: adminUrl });
    await a.connect();
    await a.query(`drop database if exists ${dbName} with (force)`);
    await a.end();
  };
  return { client, drop };
}

export type Db = Client;

/** Exécute fn en tant qu'utilisateur authentifié (JWT simulé), dans une transaction annulée. */
export async function asUser<T>(db: Db, userId: string | null, fn: () => Promise<T>, opts: { commit?: boolean } = {}): Promise<T> {
  await db.query("begin");
  try {
    if (userId) {
      await db.query("set local role authenticated");
      await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: "authenticated" })]);
    } else {
      await db.query("set local role anon");
    }
    const result = await fn();
    await db.query(opts.commit ? "commit" : "rollback");
    return result;
  } catch (e) {
    await db.query("rollback");
    throw e;
  }
}

/** Crée un utilisateur comme le ferait Supabase Auth (déclenche handle_new_user). */
export async function createAuthUser(db: Db, id: string, email: string, meta: Record<string, unknown> = {}) {
  await db.query("insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values ($1, $2, $3, now())", [id, email, meta]);
}

export async function grantRole(db: Db, userId: string, role: string) {
  await db.query("insert into public.user_roles (user_id, role) values ($1, $2) on conflict do nothing", [userId, role]);
}

export async function candidateId(db: Db, userId: string): Promise<string> {
  const r = await db.query("select id from public.candidate_profiles where user_id = $1", [userId]);
  return r.rows[0].id;
}
