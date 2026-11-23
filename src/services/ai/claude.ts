/** Client Claude (Anthropic) direct navigateur : vision (scan produits) +
 *  compréhension texte darija. Claude n'accepte PAS l'audio : la voix passe
 *  par la reconnaissance vocale du navigateur, puis Claude interprète. */
import { env } from "../../config/env";
import type { Product } from "../../types";
import type { DetectedItem, VoiceResult } from "./gemini";

const KEY = env.anthropicKey;
const MODEL = "claude-haiku-5-5";

export const claudeAvailable = () => !!KEY && KEY.startsWith("sk-ant");

type ClaudeContent =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

async function claudeJSON(content: ClaudeContent[]): Promise<Record<string, unknown> | null> {
  if (!claudeAvailable()) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": KEY!,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 600,
        messages: [{ role: "user", content }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text: string | undefined = (
      data?.content as { type: string; text?: string }[] | undefined
    )?.find((c) => c.type === "text")?.text;
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      const m = text.match(/\{[\s\S]*\}/);
      return m ? JSON.parse(m[0]) : null;
    }
  } catch {
    return null;
  }
}

function catalog(products: Product[]) {
  return products
    .map((p) => `- ${p.name} (alias : ${p.aliases.join(", ")})`)
    .join("\n");
}

/** Texte dicté (transcrit par le navigateur) -> articles + réponse orale. */
export async function parseVoiceTextClaude(
  transcript: string,
  products: Product[],
): Promise<VoiceResult | null> {
  const out = await claudeJSON([
    {
      type: "text",
      text: `Tu es l'assistant vocal d'une caisse d'épicerie marocaine (hanout).
Le commerçant a dicté (darija marocaine ou français, transcription imparfaite possible) :
« ${transcript} »
Identifie UNIQUEMENT les produits du catalogue ci-dessous avec leurs quantités
(jouj=2, tlata=3, wahed=1...). Réponds UNIQUEMENT en JSON valide :
{
  "items": [{"name": "<nom EXACT du catalogue>", "qty": <nombre>}],
  "reply": "<réponse orale courte en darija, ex: 'Wakha, jouj Sidi Ali o wa7ed atay.'>"
}
Règles : n'invente aucun produit ; si rien n'est reconnu, items=[] et reply l'explique en darija.
Réponds en darija (pas en tachelhit, pas en français).

CATALOGUE :
${catalog(products)}`,
    },
  ]);
  if (!out) return null;
  return {
    transcript,
    items: Array.isArray(out.items)
      ? (out.items as DetectedItem[]).map((i) => ({
          name: String(i.name),
          qty: Math.max(1, Number(i.qty) || 1),
        }))
      : [],
    reply: String(out.reply ?? ""),
  };
}

/** Photo du comptoir -> articles détectés selon le catalogue (Claude Vision). */
export async function parseProductPhotoClaude(
  imageB64: string,
  products: Product[],
): Promise<DetectedItem[] | null> {
  const out = await claudeJSON([
    {
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: imageB64 },
    },
    {
      type: "text",
      text: `Tu es l'assistant d'une caisse d'épicerie marocaine (hanout). Regarde la PHOTO.
Repère TOUS les produits visibles. Pour chacun, écris le nom EXACT du produit du CATALOGUE
qui correspond le mieux (emballage, logo, forme, couleur, catégorie). Si le produit n'est pas
exactement au catalogue, donne son nom courant en darija/français (ex. "sel", "halib", "zit") —
un rapprochement flou sera fait ensuite. Compte la quantité (doublon = qty 2).
Réponds UNIQUEMENT en JSON valide :
{"items": [{"name": "<nom du catalogue ou nom courant>", "qty": <nombre>}]}

CATALOGUE :
${catalog(products)}`,
    },
  ]);
  if (!out || !Array.isArray(out.items)) return null;
  return (out.items as DetectedItem[]).map((i) => ({
    name: String(i.name),
    qty: Math.max(1, Number(i.qty) || 1),
  }));
}
