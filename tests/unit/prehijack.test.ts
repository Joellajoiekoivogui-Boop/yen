import { describe, expect, it, vi } from "vitest";
import { neutralizeUnprovenPassword } from "@/features/auth/prehijack";

type Client = Parameters<typeof neutralizeUnprovenPassword>[0];
const client = (user: { email: string; email_confirmed_at: string | null } | null) => {
  const updateUser = vi.fn(async (_: { password: string }) => ({ error: null }));
  return { supabase: { auth: { getUser: async () => ({ data: { user } }), updateUser } } as unknown as Client, updateUser };
};
const now = () => new Date().toISOString();
const lastYear = new Date(Date.now() - 365 * 86_400_000).toISOString();

describe("adresse préinscrite par un tiers", () => {
  it("première confirmation (lien, code ou Google) : le mot de passe existant est remplacé par un aléatoire", async () => {
    const { supabase, updateUser } = client({ email: "awa@exemple.test", email_confirmed_at: now() });
    await neutralizeUnprovenPassword(supabase, null);
    expect(updateUser).toHaveBeenCalledOnce();
    expect(updateUser.mock.calls[0][0].password.length).toBeGreaterThanOrEqual(40);
  });

  it("mot de passe choisi dans ce navigateur pour cette adresse : conservé", async () => {
    const { supabase, updateUser } = client({ email: "awa@exemple.test", email_confirmed_at: now() });
    await neutralizeUnprovenPassword(supabase, "awa@exemple.test");
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("mot de passe choisi pour une autre adresse : ne protège pas ce compte", async () => {
    const { supabase, updateUser } = client({ email: "awa@exemple.test", email_confirmed_at: now() });
    await neutralizeUnprovenPassword(supabase, "tiers@exemple.test");
    expect(updateUser).toHaveBeenCalledOnce();
  });

  it("compte confirmé depuis longtemps (connexion habituelle) ou sans session : rien ne change", async () => {
    const old = client({ email: "awa@exemple.test", email_confirmed_at: lastYear });
    await neutralizeUnprovenPassword(old.supabase, null);
    expect(old.updateUser).not.toHaveBeenCalled();
    const none = client(null);
    await neutralizeUnprovenPassword(none.supabase, null);
    expect(none.updateUser).not.toHaveBeenCalled();
  });
});
