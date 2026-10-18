import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod/v4";
import { serverEnv } from "@/lib/env";

/**
 * Couche d'abstraction des fournisseurs d'IA (côté serveur uniquement).
 * Aucune clé n'est jamais transmise au navigateur. Lorsqu'aucun fournisseur
 * n'est configuré, les appels lèvent AINotConfiguredError : la plateforme reste
 * utilisable et l'interface affiche clairement qu'une configuration est requise.
 * Aucun résultat n'est simulé.
 */
export class AINotConfiguredError extends Error {
  constructor() {
    super("Aucun fournisseur d'IA n'est configuré (AI_PROVIDER / clé API).");
  }
}

export class AIProviderError extends Error {
  constructor(message: string, public retryable = false) {
    super(message);
  }
}

export interface JsonRequest<S extends z.ZodType> {
  system: string;
  prompt: string;
  schema: S;
  /** PDF encodé en base64 (lecture directe, y compris PDF scannés via la vision du modèle) */
  pdfBase64?: string;
  maxTokens?: number;
  effort?: "low" | "medium" | "high";
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AIProvider {
  readonly name: string;
  readonly model: string;
  generateJson<S extends z.ZodType>(req: JsonRequest<S>): Promise<{ data: z.infer<S>; model: string }>;
  chat(system: string, messages: ChatMessage[], opts?: { maxTokens?: number }): Promise<{ text: string; model: string }>;
}

class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  private client: Anthropic;

  constructor(apiKey: string, readonly model: string, timeoutMs: number) {
    this.client = new Anthropic({ apiKey, timeout: timeoutMs, maxRetries: 2 });
  }

  async generateJson<S extends z.ZodType>(req: JsonRequest<S>) {
    const content: Anthropic.Beta.BetaContentBlockParam[] = [];
    if (req.pdfBase64) {
      content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: req.pdfBase64 } });
    }
    content.push({ type: "text", text: req.prompt });
    try {
      const response = await this.client.beta.messages.parse({
        model: this.model,
        max_tokens: req.maxTokens ?? 16000,
        system: req.system,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: req.effort ?? "medium", format: betaZodOutputFormat(req.schema) },
        messages: [{ role: "user", content }],
      });
      if (response.stop_reason === "refusal") throw new AIProviderError("Le modèle a refusé de traiter cette demande.");
      if (response.stop_reason === "max_tokens") throw new AIProviderError("La réponse du modèle a été tronquée (limite de longueur atteinte).", true);
      if (response.parsed_output == null) throw new AIProviderError("La réponse du modèle ne respecte pas le format attendu.", true);
      return { data: response.parsed_output as z.infer<S>, model: response.model };
    } catch (e) {
      throw this.mapError(e);
    }
  }

  async chat(system: string, messages: ChatMessage[], opts: { maxTokens?: number } = {}) {
    try {
      const response = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: opts.maxTokens ?? 4000,
        system,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low" },
        messages,
      });
      if (response.stop_reason === "refusal") throw new AIProviderError("Le modèle a refusé de répondre à cette demande.");
      const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
      return { text, model: response.model };
    } catch (e) {
      throw this.mapError(e);
    }
  }

  private mapError(e: unknown): Error {
    if (e instanceof AIProviderError) return e;
    if (e instanceof Anthropic.AuthenticationError) return new AIProviderError("Clé API du fournisseur d'IA invalide.");
    if (e instanceof Anthropic.RateLimitError) return new AIProviderError("Limite de requêtes du fournisseur d'IA atteinte. Réessayez plus tard.", true);
    if (e instanceof Anthropic.BadRequestError) return new AIProviderError("Requête refusée par le fournisseur d'IA (document trop volumineux ou format non pris en charge).");
    if (e instanceof Anthropic.APIConnectionError) return new AIProviderError("Le service d'IA est injoignable.", true);
    if (e instanceof Anthropic.APIError) return new AIProviderError(`Erreur du fournisseur d'IA (${e.status ?? "inconnue"}).`, true);
    return new AIProviderError("Erreur inattendue du service d'IA.", true);
  }
}

let cached: AIProvider | null | undefined;

/** Retourne le fournisseur configuré, ou null si l'IA n'est pas configurée. */
export function getAIProvider(): AIProvider | null {
  if (cached !== undefined) return cached;
  const env = serverEnv();
  if (env.aiProvider === "anthropic" && env.anthropicApiKey) {
    cached = new AnthropicProvider(env.anthropicApiKey, env.aiModel, env.aiTimeoutMs);
  } else {
    cached = null;
  }
  return cached;
}

export function isAIConfigured(): boolean {
  return getAIProvider() !== null;
}

export function requireAIProvider(): AIProvider {
  const p = getAIProvider();
  if (!p) throw new AINotConfiguredError();
  return p;
}
