/** Variables d'environnement Vite centralisées (clés API). */

const raw = import.meta.env as Record<string, string | undefined>;

export const env = {
  geminiKey: raw.VITE_GEMINI_API_KEY?.trim() ?? "",
  anthropicKey: raw.VITE_ANTHROPIC_API_KEY?.trim() ?? "",
};
