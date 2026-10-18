/**
 * Lecture centralisée de la configuration. Les valeurs secrètes ne sont lues que
 * côté serveur (jamais préfixées par NEXT_PUBLIC_).
 */
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
};

export function isSupabaseConfigured(): boolean {
  return Boolean(publicEnv.supabaseUrl && publicEnv.supabaseAnonKey);
}

export function serverEnv() {
  if (typeof window !== "undefined") {
    throw new Error("serverEnv() ne doit jamais être appelé côté navigateur");
  }
  return {
    supabaseServiceKey: process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    aiProvider: (process.env.AI_PROVIDER ?? "none").toLowerCase(),
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
    aiModel: process.env.AI_MODEL ?? "claude-opus-5-5",
    aiTimeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 120_000),
    clamavScanUrl: process.env.CLAMAV_SCAN_URL ?? "",
    emailProvider: process.env.EMAIL_PROVIDER ?? "none",
    smsProvider: process.env.SMS_PROVIDER ?? "none",
    whatsappProvider: process.env.WHATSAPP_PROVIDER ?? "none",
  };
}
