/** Client Gemini direct navigateur : audio (dictée darija) + vision (scan produits).
 *  Clé dans .env : VITE_GEMINI_API_KEY (gratuite sur https://aistudio.google.com). */
import { env } from "../../config/env";
import type { Product } from "../../types";
import { getAiLang } from "../../lib/aiLang";

const KEY = env.geminiKey;
const PRIMARY_MODEL = "gemini-3.5-flash-lite";
/** Alias stable utilisé en secours si le modèle principal est surchargé. */
const FALLBACK_MODEL = "gemini-flash-lite-latest";
const endpoint = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

/** Une clé réelle fait ~39 caractères — on ignore les placeholders. */
export const aiAvailable = () => !!KEY && KEY.length > 20;

/* ---------------------------------------------------- diagnostic des échecs IA */
export type AiFailureKind =
  | "no-key"
  | "network"
  | "timeout"
  | "rate-limit"
  | "server"
  | "auth"
  | "empty"
  | "parse";

export type AiFailure = { kind: AiFailureKind; status?: number; detail?: string };

let lastFailure: AiFailure | null = null;

/** Dernière erreur rencontrée (null si le dernier appel a réussi). */
export const lastAiFailure = (): AiFailure | null => lastFailure;

/** Message court, compréhensible par le commerçant. */
export function aiFailureMessage(): string {
  const f = lastFailure;
  if (!f) return "L'IA n'a pas répondu — réessaie ou écris ta commande.";
  if (f.kind === "no-key") return "Aucune clé IA — ajoute VITE_GEMINI_API_KEY dans .env.";
  if (f.kind === "rate-limit") return "L'IA est très sollicitée — réessaie dans quelques secondes.";
  if (f.kind === "server") return "Le service IA est momentanément surchargé — réessaie.";
  if (f.kind === "timeout") return "L'IA met trop de temps à répondre — réessaie.";
  if (f.kind === "network") return "Connexion internet instable — vérifie le réseau puis réessaie.";
  if (f.kind === "auth") return "Clé IA refusée — vérifie VITE_GEMINI_API_KEY.";
  return "L'IA n'a pas répondu — réessaie ou écris ta commande.";
}

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function postOnce(
  model: string,
  parts: Part[],
): Promise<{ text: string | null; failure?: AiFailure }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const res = await fetch(`${endpoint(model)}?key=${KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
          maxOutputTokens: 512,
        },
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      const kind: AiFailureKind =
        res.status === 429
          ? "rate-limit"
          : res.status >= 500
            ? "server"
            : res.status === 401 || res.status === 403
              ? "auth"
              : "empty";
      return { text: null, failure: { kind, status: res.status, detail: detail.slice(0, 300) } };
    }
    const data = await res.json();
    const respParts = data?.candidates?.[0]?.content?.parts as { text?: string }[] | undefined;
    const text = respParts?.map((p) => p.text ?? "").join("") || null;
    return { text };
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === "AbortError";
    return {
      text: null,
      failure: { kind: aborted ? "timeout" : "network", detail: String(e) },
    };
  } finally {
    clearTimeout(timer);
  }
}

async function generateJSON(parts: Part[]): Promise<Record<string, unknown> | null> {
  if (!aiAvailable()) {
    lastFailure = { kind: "no-key" };
    return null;
  }
  // 3 tentatives (le 503 « model overloaded » est fréquent et transitoire),
  // la dernière bascule sur l'alias stable du modèle.
  const plan = [PRIMARY_MODEL, PRIMARY_MODEL, FALLBACK_MODEL];
  const delays = [0, 800, 2_000];

  for (let i = 0; i < plan.length; i++) {
    if (delays[i]) await sleep(delays[i]);
    const { text, failure } = await postOnce(plan[i], parts);
    if (text) {
      let parsed: Record<string, unknown> | null = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        const m = text.match(/\{[\s\S]*\}/);
        try {
          parsed = m ? JSON.parse(m[0]) : null;
        } catch {
          parsed = null;
        }
      }
      if (parsed) {
        lastFailure = null;
        return parsed;
      }
      lastFailure = { kind: "parse", detail: text.slice(0, 200) };
      continue;
    }
    lastFailure = failure ?? { kind: "empty" };
    // Clé invalide / droits refusés : inutile de réessayer.
    if (failure?.kind === "auth") break;
  }

  console.warn("[Payzik IA] échec après tentatives :", lastFailure);
  return null;
}

/** Texte tapé/dicté -> articles + réponse parlée (via Gemini). */
export async function parseVoiceText(
  transcript: string,
  products: Product[],
): Promise<VoiceResult | null> {
  const tachelhit = getAiLang() === "tachelhit";
  const replyExample = tachelhit
    ? "Azul ! Sin Sidi Ali asidi. Adak smounagh lhsab nk : 12 DH. Tanmirt !"
    : "Wakha, jouj Sidi Ali o wa7ed atay.";
  const prompt = `Tu es l'assistant vocal d'une caisse d'épicerie marocaine (hanout).
Le commerçant dicte une commande en darija marocaine ou en français (texte déjà transcrit).
Identifie UNIQUEMENT les produits du catalogue ci-dessous avec leurs quantités
(jouj=2, tlata=3, wahed=1...).
Réponds UNIQUEMENT en JSON valide :
{
  "transcript": "<texte reçu>",
  "items": [{"name": "<nom EXACT du catalogue>", "qty": <nombre>}],
  "reply": "<réponse orale courte en ${tachelhit ? "TACHELHIT" : "DARIJA marocaine"}, ex: '${replyExample}'>"
}
Règles : n'invente aucun produit ; si rien n'est reconnu, items=[] et reply demande « Achno 3ndk tma ? » (darija) ou « Azoul madark ghid ilan ? » (tachelhit), sans dire seulement « pas disponible ».
Réponds en ${getAiLang() === "tachelhit" ? "tachelhit (amazigh du Souss)" : "darija marocaine"}.
RÈGLE ABSOLUE : réponds UNIQUEMENT dans cette langue. Ne mélange JAMAIS avec l'autre (darija ↔ tachelhit). Si tu utilises un mot de l'autre langue, tu as ÉCHOUÉ. Même si le commerçant parle l'autre langue, ta réponse doit être 100 % dans la langue choisie.
${getAiLang() === "tachelhit" ? "Phrases types tachelhit (Souss/Agadir) : « Azoul madark ghid ilan ? » (ach 3NDK TMA ?), « Matsghit ? ACH CHRITI ? », « DARK : 3NDK », « Tla dark ghid asidi 10 DH », « 3NDK HNA ASIDI 10 DH », « Trit atkhlest khach, nighd lcarta n PAYZIK, nighd carte bancaire, nighd matrit ? », « Njm3 LIK LHSAB : adak smounagh lhsab nk ? », « Makaynch f catalogue HAD SA3a mais ranjiboh. », « OurDARNGH ILA SA3TAD MACH RATID NAWI ? », « Ila bghiti tkhls b lcarta payzik 9reb lscan ou ratkhls flblasa. », « Ighdwi rbi trit atkhlst slcarta n payzik s9rbd s scan ratkhlst rllas toutswit. », crédit = « credi », merci = « tanmirt », bonjour = « azul ». Nombres : yan(1) sin(2) krad(3) kkuẓ(4) smmus(5) sḍis(6) sa(7) tam(8) tẓa(9) mraw(10) ɛiwin(20) kramraw(30) tman(40) xemsin(50) settin(60) sebɛin(70) tmanin(80) tsɛin(90) tma(100)." : ""}

TEXTE : ${transcript}

CATALOGUE :
${catalog(products)}`;
  const out = await generateJSON([{ text: prompt }]);
  if (!out) return null;
  return {
    transcript: String(out.transcript ?? transcript),
    items: Array.isArray(out.items)
      ? (out.items as DetectedItem[]).map((i) => ({
          name: String(i.name),
          qty: Math.max(1, Number(i.qty) || 1),
        }))
      : [],
    reply: String(out.reply ?? ""),
  };
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

function catalog(products: Product[]) {
  return products
    .map((p) => `- ${p.name} (alias : ${p.aliases.join(", ")})`)
    .join("\n");
}

export interface DetectedItem {
  name: string;
  qty: number;
}
export interface VoiceResult {
  transcript: string;
  items: DetectedItem[];
  reply: string;
}

/** Dictée vocale (darija/français) -> transcription + articles + réponse parlée. */
export async function parseVoiceOrder(
  audio: Blob,
  products: Product[],
): Promise<VoiceResult | null> {
  const tachelhit = getAiLang() === "tachelhit";
  const replyExample = tachelhit
    ? "Azul ! Sin Sidi Ali asidi. Adak smounagh lhsab nk : 12 DH. Tanmirt !"
    : "Wakha, jouj Sidi Ali o wa7ed atay.";
  const prompt = `Tu es l'assistant vocal d'une caisse d'épicerie marocaine (hanout).
Le commerçant dicte une commande en darija marocaine ou en français.
Transcris l'audio, puis identifie UNIQUEMENT les produits du catalogue ci-dessous
avec leurs quantités (jouj=2, tlata=3, wahed=1...).
Réponds UNIQUEMENT en JSON valide :
{
  "transcript": "<ce que tu as entendu>",
  "items": [{"name": "<nom EXACT du catalogue>", "qty": <nombre>}],
  "reply": "<réponse orale courte en ${tachelhit ? "TACHELHIT" : "DARIJA marocaine"}, ex: '${replyExample}'>"
}
Règles : n'invente aucun produit ; si rien n'est reconnu, items=[] et reply demande « Achno 3ndk tma ? » (darija) ou « Azoul madark ghid ilan ? » (tachelhit), sans dire seulement « pas disponible ».
Réponds en ${getAiLang() === "tachelhit" ? "tachelhit (amazigh du Souss)" : "darija marocaine"} (pas dans l'autre langue, pas en français).
RÈGLE ABSOLUE : réponds UNIQUEMENT dans cette langue. Ne mélange JAMAIS avec l'autre (darija ↔ tachelhit). Si tu utilises un mot de l'autre langue, tu as ÉCHOUÉ. Même si le commerçant parle l'autre langue, ta réponse doit être 100 % dans la langue choisie.
${getAiLang() === "tachelhit" ? "Phrases types tachelhit (Souss/Agadir) : « Azoul madark ghid ilan ? » (ach 3NDK TMA ?), « Matsghit ? ACH CHRITI ? », « DARK : 3NDK », « Tla dark ghid asidi 10 DH », « 3NDK HNA ASIDI 10 DH », « Trit atkhlest khach, nighd lcarta n PAYZIK, nighd carte bancaire, nighd matrit ? », « Njm3 LIK LHSAB : adak smounagh lhsab nk ? », « Makaynch f catalogue HAD SA3a mais ranjiboh. », « OurDARNGH ILA SA3TAD MACH RATID NAWI ? », « Ila bghiti tkhls b lcarta payzik 9reb lscan ou ratkhls flblasa. », « Ighdwi rbi trit atkhlst slcarta n payzik s9rbd s scan ratkhlst rllas toutswit. », crédit = « credi », merci = « tanmirt », bonjour = « azul ». Nombres : yan(1) sin(2) krad(3) kkuẓ(4) smmus(5) sḍis(6) sa(7) tam(8) tẓa(9) mraw(10) ɛiwin(20) kramraw(30) tman(40) xemsin(50) settin(60) sebɛin(70) tmanin(80) tsɛin(90) tma(100)." : ""}

CATALOGUE :
${catalog(products)}`;
  const b64 = await blobToBase64(audio);
  const out = await generateJSON([
    { text: prompt },
    { inlineData: { mimeType: audio.type || "audio/webm", data: b64 } },
  ]);
  if (!out) return null;
  return {
    transcript: String(out.transcript ?? ""),
    items: Array.isArray(out.items)
      ? (out.items as DetectedItem[]).map((i) => ({
          name: String(i.name),
          qty: Math.max(1, Number(i.qty) || 1),
        }))
      : [],
    reply: String(out.reply ?? ""),
  };
}

/** Photo des produits sur le comptoir -> articles détectés selon le catalogue. */
export async function parseProductPhoto(
  imageB64: string,
  products: Product[],
): Promise<DetectedItem[] | null> {
  const prompt = `Tu es l'assistant d'une caisse d'épicerie marocaine (hanout). Regarde la PHOTO.
Repère TOUS les produits visibles (même partiellement) sur le comptoir.
Pour chacun, écris le nom EXACT du produit du CATALOGUE qui correspond le mieux
(regarde l'emballage, le logo, la forme, la couleur, la catégorie). Si le produit
n'est pas exactement au catalogue, donne son nom courant en darija/français
(ex. "sel", "halib", "zit") — un rapprochement flou sera fait ensuite.
Compte la quantité (même produit en double = qty 2).
Réponds UNIQUEMENT en JSON valide :
{"items": [{"name": "<nom du catalogue ou nom courant>", "qty": <nombre>}]}
Ne mets rien d'autre que les produits consommables visibles.

CATALOGUE :
${catalog(products)}`;
  const out = await generateJSON([
    { text: prompt },
    { inlineData: { mimeType: "image/jpeg", data: imageB64 } },
  ]);
  if (!out || !Array.isArray(out.items)) return null;
  return (out.items as DetectedItem[]).map((i) => ({
    name: String(i.name),
    qty: Math.max(1, Number(i.qty) || 1),
  }));
}

/** Normalise un nom : minuscules, sans accents, sans ponctuation. */
function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP = new Set(["de", "du", "la", "le", "les", "des", "l", "d", "et", "kg", "g", "l", "ml", "cl", "x"]);

function tokens(s: string) {
  return normalize(s)
    .split(" ")
    .filter((t) => t && !STOP.has(t) && !/^\d+$/.test(t));
}

/** Score 0-1 de ressemblance entre un nom détecté et un produit. */
function score(detected: string, product: Product) {
  const dn = normalize(detected);
  if (!dn) return 0;
  const pn = normalize(product.name);
  if (dn === pn) return 1;
  const aliases = product.aliases.map(normalize);
  if (aliases.includes(dn)) return 0.98;
  if (pn.includes(dn) || dn.includes(pn)) return 0.9;
  const dt = tokens(detected);
  for (const a of product.aliases) {
    const at = tokens(a);
    if (at.length && at.every((t) => dt.includes(t))) return 0.95;
  }
  const pt = tokens(product.name);
  if (!dt.length || !pt.length) return 0;
  const shared = dt.filter((t) => pt.some((p) => p.startsWith(t) || t.startsWith(p))).length;
  return shared / Math.max(dt.length, pt.length);
}

/** Seuil de confiance : en dessous, on considère que le produit n'est PAS au catalogue. */
const THRESHOLD = 0.6;

/** Sépare les produits détectés : ceux trouvés au catalogue et ceux qui n'existent pas. */
export function classifyItems(items: DetectedItem[], products: Product[]) {
  const found: { product: Product; qty: number }[] = [];
  const missing: string[] = [];
  for (const it of items) {
    let best: Product | undefined;
    let bestScore = 0;
    for (const p of products) {
      const sc = score(it.name, p);
      if (sc > bestScore) {
        bestScore = sc;
        best = p;
      }
    }
    if (best && bestScore >= THRESHOLD) {
      if (!found.some((f) => f.product.id === best!.id)) found.push({ product: best, qty: it.qty });
    } else {
      missing.push(it.name);
    }
  }
  return { found, missing };
}

/** Associe les noms renvoyés par l'IA aux produits du store (rapprochement flou). */
export function matchProducts(items: DetectedItem[], products: Product[]) {
  return classifyItems(items, products).found;
}

/** Réponse orale (comme le mode vocal d'OpenAI) via la synthèse du navigateur.
 *  Voix arabe (ar-MA) si le texte est en écriture arabe (darija), sinon français. */
export function speak(text: string) {
  if (!text || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  // Tachelhit n'a pas de voix TTS : on utilise le français.
  const lang = getAiLang();
  u.lang = lang === "tachelhit" ? "fr-FR" : /[\u0600-\u06FF]/.test(text) ? "ar-MA" : "fr-FR";
  u.rate = 1.05;
  window.speechSynthesis.speak(u);
}
