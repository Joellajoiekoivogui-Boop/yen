import type { ChatMessage } from "./provider";

/**
 * Historique de l'assistant transmis au modèle (logique pure) : 12 derniers messages et
 * 16 000 caractères au plus, pour borner le coût de chaque appel. La conversation envoyée
 * commence toujours par un message du candidat.
 */
export function trimChatHistory(messages: ChatMessage[], maxChars = 16_000): ChatMessage[] {
  const kept = messages.slice(-12);
  let total = kept.reduce((n, m) => n + m.content.length, 0);
  while (kept.length > 1 && total > maxChars) total -= kept.shift()!.content.length;
  while (kept.length > 1 && kept[0].role !== "user") kept.shift();
  return kept;
}
