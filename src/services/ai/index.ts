/** Point d'entrée IA unifié : Gemini (audio+vision) si clé présente,
 *  sinon Claude (vision + texte, la voix passant par la reconnaissance
 *  vocale du navigateur). */
import {
  claudeAvailable,
  parseProductPhotoClaude,
  parseVoiceTextClaude,
} from "./claude";
import {
  aiAvailable as geminiAvailable,
  parseProductPhoto as parsePhotoGemini,
  parseVoiceOrder as parseVoiceAudioGemini,
  parseVoiceText as parseVoiceTextGemini,
} from "./gemini";
import type { Product } from "../../types";
import type { DetectedItem, VoiceResult } from "./gemini";

export { matchProducts, classifyItems, speak, lastAiFailure, aiFailureMessage } from "./gemini";
export type { DetectedItem, VoiceResult } from "./gemini";

export const aiAvailable = () => geminiAvailable() || claudeAvailable();

export const providerName = (): string | null =>
  geminiAvailable() ? "Gemini" : claudeAvailable() ? "Claude" : null;

/* ---- reconnaissance vocale navigateur (pour le mode Claude) ---- */
export type SpeechRec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult:
    | ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void)
    | null;
  onend: (() => void) | null;
  onerror: ((e?: unknown) => void) | null;
  start(): void;
  stop(): void;
};

export function getSpeechRecognition(): SpeechRec | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRec;
    webkitSpeechRecognition?: new () => SpeechRec;
  };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

export const speechSupported = () => getSpeechRecognition() !== null;

/** Mode vocal disponible :
 *  - "audio"  : Gemini écoute l'enregistrement brut (meilleur pour la darija)
 *  - "speech" : navigateur transcrit, Claude interprète
 *  - null     : indisponible */
export const voiceMode = (): "audio" | "speech" | null =>
  geminiAvailable() ? "audio" : claudeAvailable() && speechSupported() ? "speech" : null;

export async function parseVoiceAudio(
  audio: Blob,
  products: Product[],
): Promise<VoiceResult | null> {
  return parseVoiceAudioGemini(audio, products);
}

export async function parseVoiceText(
  transcript: string,
  products: Product[],
): Promise<VoiceResult | null> {
  if (geminiAvailable()) return parseVoiceTextGemini(transcript, products);
  return parseVoiceTextClaude(transcript, products);
}

export async function parsePhoto(
  imageB64: string,
  products: Product[],
): Promise<DetectedItem[] | null> {
  if (geminiAvailable()) {
    const r = await parsePhotoGemini(imageB64, products);
    if (r) return r;
  }
  if (claudeAvailable()) return parseProductPhotoClaude(imageB64, products);
  return null;
}
