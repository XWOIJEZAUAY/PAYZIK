/** Rend une réponse déjà correcte plus naturelle, sans jamais la bloquer.
 *  Gemini reste optionnel : le texte local est toujours utilisé en repli. */
import { aiAvailable, askGeminiShort } from "./gemini";

const MAX_WAIT_MS = 2_500;

export async function shortReply(fallback: string, context: string): Promise<string> {
  if (!aiAvailable() || !fallback) return fallback;
  try {
    const text = await Promise.race([
      askGeminiShort(
        `Tu es un assistant PAYZIK chaleureux et très bref. ` +
          `Réponse à garder : ${fallback}\n` +
          `Contexte réel : ${context}\n` +
          `Réponds en une seule phrase de 12 mots maximum, même sens, sans explication ni introduction.`,
      ),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), MAX_WAIT_MS)),
    ]);
    if (!text) return fallback;
    const clean = text
      .replace(/\s+/g, " ")
      .replace(/^["'«»\s]+|["'«»\s]+$/g, "")
      .trim();
    return clean.length > 0 && clean.length <= 130 ? clean : fallback;
  } catch {
    return fallback;
  }
}
