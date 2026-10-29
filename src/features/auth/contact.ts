import { phoneSchema } from "./schemas";

export interface ContactFields {
  first_name: string;
  last_name: string;
  phone: string | null;
  city: string | null;
  country: string;
}

/** Coordonnées complètes : prénom, nom, téléphone valide, ville et pays. */
export function hasContactDetails(p: ContactFields): boolean {
  return Boolean(p.first_name.trim() && p.last_name.trim() && p.city?.trim() && p.country.trim()) && phoneSchema.safeParse(p.phone ?? "").success;
}
