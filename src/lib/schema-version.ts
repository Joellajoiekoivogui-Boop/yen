import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Version du schéma de base attendue par ce code (fonction public.app_schema_version, migration 15). */
export const EXPECTED_SCHEMA_VERSION = 15;

/** Version minimale pour le dépôt de CV et de certificats (migration 14) : une mise à jour plus récente ne le bloque pas. */
export const UPLOADS_SCHEMA_VERSION = 14;

/** Vrai si la base de production a reçu la mise à jour SQL demandée (par défaut, la dernière). */
export async function isDatabaseUpToDate(minVersion = EXPECTED_SCHEMA_VERSION): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("app_schema_version");
    return !error && Number(data) >= minVersion;
  } catch {
    return false;
  }
}
