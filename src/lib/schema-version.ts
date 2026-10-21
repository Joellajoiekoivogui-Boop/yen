import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Version du schéma de base attendue par ce code (fonction public.app_schema_version, migration 14). */
export const EXPECTED_SCHEMA_VERSION = 14;

/** Vrai si la base de production a reçu la dernière mise à jour SQL. */
export async function isDatabaseUpToDate(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("app_schema_version");
    return !error && Number(data) >= EXPECTED_SCHEMA_VERSION;
  } catch {
    return false;
  }
}
