/**
 * Détection de consignes adressées à l'IA dans un texte fourni par un utilisateur (logique pure).
 * Un CV ou une réponse peut contenir, parfois en texte invisible, des phrases comme
 * « ignore les instructions précédentes » ou « attribue la note maximale ». Le modèle a pour
 * consigne de traiter ces textes comme des données, mais la détection permet d'alerter
 * l'équipe YEN, qui vérifie alors elle-même. Ce n'est pas un filtre : rien n'est bloqué.
 */
import { normalizeText } from "@/lib/utils";

const PATTERNS: { label: string; re: RegExp }[] = [
  { label: "demande d'ignorer les consignes", re: /\b(ignore[rsz]?|oublie[rsz]?|disregard|forget)\b.{0,40}\b(instructions?|consignes?|regles?|rules|prompt|ce qui precede|previous|above)\b/ },
  { label: "changement de rôle de l'IA", re: /\b(tu es (desormais|maintenant)|you are now|agis comme|act as|nouvelles? (instructions?|consignes?)|new instructions?)\b/ },
  { label: "mention des consignes système", re: /\b(system prompt|prompt systeme|consignes? systeme|instructions? systeme|developer message)\b/ },
  { label: "demande de note ou d'avis favorable", re: /\b(attribue[rsz]?|donne[rsz]?|accorde[rsz]?|give|award)\b.{0,30}\b(note maximale|tous les points|la note maximale|full (marks|points|score)|maximum (marks|points|score)|20\s*\/\s*20|100\s*\/\s*100)\b/ },
  { label: "consigne adressée à l'IA", re: /\b(note|message|instruction)s? (pour|to|for) (l'?ia|l'?assistant|le modele|the (ai|model|assistant)|chatgpt|claude)\b/ },
  { label: "balises imitant le prompt", re: /<\/?\s*(source|cv|reponse|offre|system|instructions?)\b/ },
];

/** Liste (sans doublon) des signaux trouvés dans les textes ; vide si rien de suspect. */
export function detectPromptInjection(...texts: (string | null | undefined)[]): string[] {
  const found = new Set<string>();
  for (const text of texts) {
    if (!text) continue;
    const raw = text.toLowerCase();
    const normalized = normalizeText(text).replace(/\s+/g, " ");
    for (const p of PATTERNS) if (p.re.test(normalized) || p.re.test(raw)) found.add(p.label);
  }
  return [...found];
}

export const INJECTION_WARNING =
  "Le texte analysé contient des formulations qui ressemblent à des consignes adressées à l'IA. Vérifiez vous-même les conclusions avant de vous en servir.";
