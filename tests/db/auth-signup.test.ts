/**
 * Inscription : les métadonnées envoyées par le navigateur ne donnent jamais de rôle privilégié.
 * Nécessite TEST_DATABASE_URL (PostgreSQL local).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createAuthUser, createTestDatabase, type Db } from "./helpers";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

const U = {
  pirate: "00000000-0000-4000-8000-0000000004a1",
  orga: "00000000-0000-4000-8000-0000000004b1",
};

d("Inscription : aucun rôle privilégié par les métadonnées", () => {
  let db: Db;
  let drop: () => Promise<void>;

  beforeAll(async () => {
    ({ client: db, drop } = await createTestDatabase(url!));
  }, 60_000);
  afterAll(async () => { await drop?.(); });

  it("« staff » ou un rôle demandé à l'inscription donne un simple compte candidat", async () => {
    await createAuthUser(db, U.pirate, "pirate@example.test", { first_name: "P", last_name: "X", account_type: "staff", role: "super_admin", roles: ["super_admin"], accepted_terms: "true" });
    const p = (await db.query("select account_type from public.profiles where id = $1", [U.pirate])).rows[0];
    expect(p.account_type).toBe("candidate");
    const roles = (await db.query("select role from public.user_roles where user_id = $1", [U.pirate])).rows.map((r) => r.role);
    expect(roles).toEqual(["candidate"]);
    // et il ne peut pas se les attribuer ensuite
    await expect(asUser(db, U.pirate, () => db.query("insert into public.user_roles (user_id, role) values ($1, 'super_admin')", [U.pirate]))).rejects.toThrow();
    const perms = await asUser(db, U.pirate, () => db.query("select public.has_permission('users.manage') ok"));
    expect(perms.rows[0].ok).toBe(false);
  });

  it("une organisation qui s'inscrit n'obtient aucun rôle avant validation par YEN", async () => {
    await createAuthUser(db, U.orga, "rh@organisation.test", { first_name: "R", last_name: "H", account_type: "partner", organization_name: "Organisation test", accepted_terms: "true" });
    const roles = (await db.query("select role from public.user_roles where user_id = $1", [U.orga])).rows;
    expect(roles).toHaveLength(0);
    const org = (await db.query("select status, portal_enabled from public.organizations where contact_email = 'rh@organisation.test'")).rows[0];
    expect(org.portal_enabled).toBe(false);
  });
});
