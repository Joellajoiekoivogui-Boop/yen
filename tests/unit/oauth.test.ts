import { afterEach, describe, expect, it, vi } from "vitest";

/** Le bouton Google n'apparaît que si Supabase déclare le fournisseur activé. */
describe("connexion Google : fournisseur activé ou non", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function enabledWith(response: () => Promise<Response>) {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://projet.supabase.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => (void input, void init, response()));
    vi.stubGlobal("fetch", fetchMock);
    const { isGoogleAuthEnabled } = await import("@/lib/auth/oauth");
    return { enabled: await isGoogleAuthEnabled(), fetchMock };
  }

  it("activé dans Supabase : bouton affiché", async () => {
    const { enabled, fetchMock } = await enabledWith(async () => Response.json({ external: { google: true, email: true } }));
    expect(enabled).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe("https://projet.supabase.test/auth/v1/settings");
  });

  it("non activé, erreur ou réseau indisponible : bouton masqué", async () => {
    expect((await enabledWith(async () => Response.json({ external: { google: false } }))).enabled).toBe(false);
    expect((await enabledWith(async () => new Response("erreur", { status: 500 }))).enabled).toBe(false);
    expect((await enabledWith(async () => { throw new Error("hors ligne"); })).enabled).toBe(false);
  });
});
