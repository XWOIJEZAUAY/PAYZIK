/** Gemini Live — conversation vocale TEMPS RÉEL (WebSocket audio natif).
 *
 *  Comme le mode vocal de ChatGPT : le micro streame l'audio en continu,
 *  l'IA écoute (VAD automatique), répond à voix haute (< 1s), se laisse
 *  interrompre, et agit sur le panier via function calling.
 *
 *  Modèle : gemini-2.5-flash-native-audio-preview-09-2025
 *  Entrée : PCM16 mono 16 kHz (streamé depuis le micro du navigateur)
 *  Sortie : PCM16 mono 24 kHz (joué via AudioContext)
 */
import { env } from "../../config/env";
import type { Product } from "../../types";
import { getAiLang, aiLangInstruction } from "../../lib/aiLang";

const MODEL = "gemini-2.5-flash-native-audio-preview-09-2025";
const WS_URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

export const liveAvailable = () => !!env.geminiKey && env.geminiKey.length > 20;

/* ------------------------------- types ------------------------------- */

export interface ToolCall {
  id?: string;
  name: string;
  args: Record<string, unknown>;
}

export interface LiveSessionCallbacks {
  onReady?: () => void;
  /** done = fin de tour : la bulle doit être figée dans le fil. */
  onUserTranscript?: (text: string, done?: boolean) => void;
  onAssistantTranscript?: (text: string, done?: boolean) => void;
  onToolCall?: (call: ToolCall) => Promise<Record<string, unknown>>;
  /** "listening" (micro ouvert) / "speaking" (l'IA parle) */
  onActivity?: (state: "listening" | "speaking") => void;
  onError?: (message: string) => void;
  onClose?: () => void;
}

/* --------------------------- encode PCM16 ---------------------------- */

function base64ToPcm16(b64: string): Int16Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

function f32ToPcm16Base64(f32: Float32Array): string {
  const bytes = new Uint8Array(f32.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/* ---------------------------- la session ----------------------------- */

export class LiveSession {
  private ws: WebSocket | null = null;
  private micCtx: AudioContext | null = null;
  private playCtx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private sources: AudioBufferSourceNode[] = [];
  private nextPlayTime = 0;
  private userBuf = "";
  private assistantBuf = "";
  private stopped = false;
  private catalog: Product[];
  private callbacks: LiveSessionCallbacks;
  private merchantName: string;

  constructor(catalog: Product[], callbacks: LiveSessionCallbacks, merchantName = "") {
    this.catalog = catalog;
    this.callbacks = callbacks;
    this.merchantName = merchantName.trim();
  }

  get isStopped() {
    return this.stopped;
  }

  private systemPrompt() {
    const cat = this.catalog
      .map((p) => `- ${p.name} — ${p.priceDh} DH`)
      .join("\n");
    return `Tu es PAYZIK, l'assistant vocal de la caisse d'un hanout (épicerie) au Maroc.
Le commerçant et ses clients te parlent en ${getAiLang() === "tachelhit" ? "TACHELHIT (amazigh du Souss)" : "DARIJA marocaine"}.
${aiLangInstruction(getAiLang())}
une phrase courte et chaleureuse.

OUVERTURE (très important) :
- Dès que la conversation commence, sans bruit parasite ni souffle, tu salues chaleureusement.
- Salutation : « Salam${this.merchantName ? " " + this.merchantName : ""} ! Achno 3ndk tma ? »
  (si le nom commence par « Si », l'utiliser ; sinon pas de « akhouya », car le commerçant peut être une femme).
- Cette salutation n'est faite QU'AU DÉBUT de la conversation. Aux tours suivants, tu réponds directement à la demande (confirmation + total), sans re-saluer.
- Ne dis JAMAIS seulement « pas disponible » : si un produit manque, propose une alternative ou demande la quantité.
- Interdit : bruits, souffle, grognements, onomatopées ("euh", "hmm", "aaa"). Tu parles clairement.

NOMBRES EN DARIJA (quantités et total) :
0 zéro · 1 wa7ed · 2 jouj · 3 tlata · 4 rba3a · 5 khamsa · 6 setta · 7 seb3a · 8 tmnya · 9 ts3a · 10 3achra
11 7dach · 12 tnach · 13 tlettach · 14 rbe3tach · 15 khmestach · 16 settach · 17 seb3tach · 18 tmntach · 19 ts3tach
20 3ichrin · 30 tlatin · 40 rbe3in · 50 khamsin · 60 settin · 70 seb3in · 80 tmanin · 90 ts3in
100 mya · 1000 alf
Pour les MONTANTS d'argent, les chiffres français sont très utilisés au Maroc ("vingt-quatre", "deux cents")
— c'est OK. Dis le montant (darija ou chiffres français) toujours suivi de « derhem ».

TOTAL (quand il demande « ch7al lmajmou3 ? » / « lhsab nk ? » / « le total ? ») :
1) appelle getCart — le ticket s'affiche alors automatiquement à l'écran —
2) puis annonce le total à voix haute DANS LA LANGUE CHOISIE, toujours suivi de « derhem ».

COMMANDES :
- Commande ("zid jouj Sidi Ali", "wa7ed atay", "jouj sokkar") -> appelle addProduct
  (nom EXACT du catalogue + quantité), puis confirme en darija : « Wakha, jouj Sidi Ali. Ach mn ba3d ? »
  Ajoute UN produit à la fois et laisse le client enchaîner : « zid zit » … « zid sokkar » …
- Retirer -> removeProduct.
- Produit hors catalogue -> dis-le honnêtement. N'invente jamais de prix : utilise le catalogue.
- L'image de chaque produit ajouté s'affiche automatiquement à l'écran : tu n'as pas à la décrire.

TOTAL & PAIEMENT (important) :
- Quand le client a fini (ou dit "safi", "khelles", "ch7al lmajmou3 ?", "lhsab nk ?"), donne d'abord le total à voix haute dans la langue choisie, suivi de « derhem ».
- Puis demande le mode de paiement : « Wach b cash, kridi, wla carte ? » — les 3 boutons
  (Espèces / Crédit / Carte) s'affichent alors à l'écran ; le caissier peut appuyer dessus.
- Si le client répond à la voix : "cash"/"kash"/"flous" -> checkout cash ;
  "kridi"/"lkrida" -> checkout kridi (demande le nom du client si tu ne l'as pas).
- "carte"/"kart" -> il faut TOUJOURS le QR/code de la carte PAYZIK : appelle findCard avec le code
  (scan ou dictée), vérifie le solde en base, puis payWithCard avec le MÊME code.
  Jamais de paiement par carte sans code — si le code manque, demande-le.
  Carte inconnue -> dis « Cette carte n'est pas valide ». Solde insuffisant -> dis-le.

CARNET DE CRÉDIT (lkridi) — tu y as accès :
- « chkoun 3lih lkridi ? » / « ch7al lkridi ? » -> getDebts, puis cite les clients et montants.
- « <nom> ch7al 3lih ? » -> getClientDebt, puis annonce la dette du client.
- « ach chra <nom> ? » / détail des achats -> getClientHistory, puis liste les PRODUITS achetés à crédit (pas seulement le montant).
- « zid kridi <montant> l <nom> » SANS produit -> NE PAS enregistrer tout de suite : demande d'abord « Ach chra <nom> ? », puis, quand on te le dit, appelle addDebt avec items.
- Si on te dit directement les produits (« <nom> chra jouj sokkar o wa7ed atay ») -> résous-les dans le catalogue, calcule le total, puis addDebt avec items (amountDh = somme des prix).
- « <nom> khelles <montant> » / « 3tani <montant> <nom> » -> payDebt.
- Infos personnelles : « beddel smiya <ancien> -> <nouveau> », « zid tilifon <nom> 06… », « note 3la <nom> … » -> updateClient.

IMPORTANT : l'argument items de addDebt doit contenir le nom EXACT du catalogue et la quantité. Ne devine jamais les prix : prends-les du catalogue.
Dis toujours les montants suivis de « derhem ». Respecte la langue choisie plus haut (darija ou tachelhit).

STOCK, CARTES, VENTES (tu as accès aux données réelles) :
- « ch7al 3endna f stock ? » / « chnou qrib ykmel ? » / « stock » -> getStock, puis cite les produits bas/rupture.
- « cartes » / « solde des cartes » -> getCards. « carte de <nom> / code PZK… » -> findCard (solde + mouvements).
- « recharge carte <nom/code> <montant> » -> topUpCard. « paie par carte <code> » -> payWithCard.
- « ch7al khda lyoum ? » / « ventes » / « bilan » -> getSales (nombre de ventes + total du jour).

CATALOGUE : tu peux MODIFIER les données, pas seulement les lire :
- « prix de <produit> = <montant> » -> setPrice ; « stock de <produit> = <n> » ou « zid/naqqs stock <n> » -> setStock.
- « ajoute produit <nom> prix <montant> stock <n> » -> addCatalogProduct ; « catalogue » -> getCatalog.
- cite toujours les NOMS EXACTS du catalogue ci-dessous pour ces outils.

CATALOGUE DE RÉFÉRENCE :
${cat}`;
  }

  private tools() {
    return [
      {
        functionDeclarations: [
          {
            name: "addProduct",
            description: "Ajoute un produit au panier de la caisse",
            parameters: {
              type: "object",
              properties: {
                name: { type: "string", description: "Nom exact du produit du catalogue" },
                qty: { type: "integer", description: "Quantité (défaut 1)" },
              },
              required: ["name"],
            },
          },
          {
            name: "removeProduct",
            description: "Retire un produit du panier de la caisse",
            parameters: {
              type: "object",
              properties: {
                name: { type: "string", description: "Nom exact du produit du catalogue" },
                qty: { type: "integer", description: "Quantité à retirer (défaut: tout)" },
              },
              required: ["name"],
            },
          },
          {
            name: "getStock",
            description: "Liste le stock de tous les produits avec les niveaux bas et ruptures",
            parameters: { type: "object", properties: {} },
          },
          {
            name: "getCards",
            description: "Liste les cartes PAYZIK avec leurs soldes",
            parameters: { type: "object", properties: {} },
          },
          {
            name: "findCard",
            description:
              "Vérifie une carte dans la base : solde et derniers mouvements. Le code QR est obligatoire, sinon demande-le au client.",
            parameters: {
              type: "object",
              properties: {
                code: { type: "string", description: "Code QR de la carte (ex. PZK-XXXX-XXXX)" },
                name: { type: "string", description: "Nom du porteur si le code est absent" },
              },
            },
          },
          {
            name: "topUpCard",
            description: "Recharge le solde d'une carte PAYZIK existante après vérification en base",
            parameters: {
              type: "object",
              properties: {
                code: { type: "string", description: "Code QR de la carte" },
                name: { type: "string", description: "Nom du porteur" },
                amountDh: { type: "number", description: "Montant de la recharge en dirhams" },
              },
            },
          },
          {
            name: "payWithCard",
            description:
              "Débite une carte PAYZIK du montant du panier. Vérifie d'abord la carte en base ; refuse si solde insuffisant. Code QR obligatoire.",
            parameters: {
              type: "object",
              properties: {
                code: { type: "string", description: "Code QR de la carte scannée" },
                name: { type: "string", description: "Nom du porteur si pas de code" },
              },
            },
          },
          {
            name: "getSales",
            description: "Ventes du jour : nombre, chiffre d'affaires et derniers tickets",
            parameters: { type: "object", properties: {} },
          },
          {
            name: "getCatalog",
            description: "Liste le catalogue de référence avec prix et stock",
            parameters: { type: "object", properties: {} },
          },
          {
            name: "setStock",
            description: "Modifie le stock d'un produit du catalogue (quantité ou delta)",
            parameters: {
              type: "object",
              properties: {
                name: { type: "string", description: "Nom exact du produit" },
                qty: { type: "number", description: "Nouveau stock" },
                delta: { type: "number", description: "Ajout/retrait par rapport au stock actuel" },
              },
              required: ["name"],
            },
          },
          {
            name: "setPrice",
            description: "Modifie le prix d'un produit du catalogue",
            parameters: {
              type: "object",
              properties: {
                name: { type: "string", description: "Nom exact du produit" },
                priceDh: { type: "number", description: "Nouveau prix en dirhams" },
              },
              required: ["name", "priceDh"],
            },
          },
          {
            name: "addCatalogProduct",
            description: "Ajoute un nouveau produit au catalogue de référence",
            parameters: {
              type: "object",
              properties: {
                name: { type: "string" },
                priceDh: { type: "number" },
                stock: { type: "number" },
              },
              required: ["name", "priceDh"],
            },
          },
          {
            name: "getCart",
            description: "Liste le panier actuel et son total en dirhams",
            parameters: { type: "object", properties: {} },
          },
          {
            name: "checkout",
            description:
              "Encaisse le panier. method=card/wallet = carte PAYZIK rechargeable : code/QR OBLIGATOIRE, solde vérifié en base. Ne jamais encaisser par carte sans code.",
            parameters: {
              type: "object",
              properties: {
                method: { type: "string", enum: ["cash", "card", "wallet", "kridi"] },
                client: {
                  type: "string",
                  description: "Nom du client (obligatoire si method=kridi)",
                },
                code: {
                  type: "string",
                  description: "Code/QR de la carte scanné (obligatoire si method=card/wallet)",
                },
              },
              required: ["method"],
            },
          },
          {
            name: "getDebts",
            description:
              "Carnet de crédit (kridi) : liste tous les clients qui doivent de l'argent avec le montant et le retard",
            parameters: { type: "object", properties: {} },
          },
          {
            name: "getClientDebt",
            description:
              "Carnet de crédit : dette d'un client précis (montant, ancienneté, derniers mouvements)",
            parameters: {
              type: "object",
              properties: {
                name: { type: "string", description: "Nom du client" },
              },
              required: ["name"],
            },
          },
          {
            name: "getClientHistory",
            description:
              "Carnet de crédit : détail de ce qu'un client a acheté à crédit (liste des produits, quantités et montants), mouvement par mouvement",
            parameters: {
              type: "object",
              properties: {
                name: { type: "string", description: "Nom du client" },
              },
              required: ["name"],
            },
          },
          {
            name: "addDebt",
            description:
              "Ajoute une dette (crédit/kridi) au carnet d'un client ; crée le client s'il n'existe pas. Fournis TOUJOURS items (produits achetés) ; si tu ne les as pas, demande-les d'abord.",
            parameters: {
              type: "object",
              properties: {
                name: { type: "string", description: "Nom du client" },
                amountDh: {
                  type: "number",
                  description: "Montant de la dette en dirhams (si absent, calculé depuis items)",
                },
                note: { type: "string", description: "Motif / libellé (ex : courses, lait + sucre)" },
                items: {
                  type: "array",
                  description: "Produits achetés à crédit (noms EXACTS du catalogue)",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string", description: "Nom du produit (catalogue)" },
                      qty: { type: "number", description: "Quantité" },
                    },
                    required: ["name", "qty"],
                  },
                },
              },
              required: ["name"],
            },
          },
          {
            name: "payDebt",
            description: "Enregistre un acompte / remboursement d'un client dans le carnet de crédit",
            parameters: {
              type: "object",
              properties: {
                name: { type: "string", description: "Nom du client" },
                amountDh: { type: "number", description: "Montant payé en dirhams" },
              },
              required: ["name", "amountDh"],
            },
          },
          {
            name: "updateClient",
            description:
              "Modifie les infos personnelles d'un client : nouveau nom, téléphone, note. Crée le client s'il n'existe pas.",
            parameters: {
              type: "object",
              properties: {
                name: { type: "string", description: "Nom actuel du client" },
                newName: { type: "string", description: "Nouveau nom" },
                phone: { type: "string", description: "Numéro de téléphone" },
                note: { type: "string", description: "Note libre (adresse, famille…)" },
              },
              required: ["name"],
            },
          },
        ],
      },
    ];
  }

  /** Ouvre la session : micro + WebSocket + streaming bidirectionnel. */
  async start() {
    if (!liveAvailable()) {
      this.callbacks.onError?.("Clé Gemini manquante dans .env");
      return;
    }
    // 1) Micro d'abord — échec → on n'ouvre même pas la session.
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      this.callbacks.onError?.("Micro refusé — autorise le microphone (🔒 barre d'adresse).");
      return;
    }

    // 2) WebSocket + handlers assignés SYNCHRONEMENT juste après le constructeur.
    //    ⚠️ Si un await se glisse entre new WebSocket() et onopen = …, l'événement
    //    "open" peut se déclencher avant l'affectation → le setup n'est jamais
    //    envoyé → jamais de setupComplete → la session reste bloquée « connexion… ».
    try {
      this.ws = new WebSocket(`${WS_URL}?key=${env.geminiKey}`);
      this.playCtx = new AudioContext();
      if (this.playCtx.state === "suspended") void this.playCtx.resume();
    } catch {
      this.callbacks.onError?.("Connexion Live impossible — vérifie la clé Gemini.");
      return;
    }

    this.ws.onopen = () => {
      this.ws?.send(
        JSON.stringify({
          setup: {
            model: `models/${MODEL}`,
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
              },
              temperature: 0.8,
            },
            systemInstruction: { parts: [{ text: this.systemPrompt() }] },
            tools: this.tools(),
            inputAudioTranscription: {},
            outputAudioTranscription: {},
          },
        }),
      );
    };

    // Gemini envoie ses messages en frames BINAIRES (Blob) : on convertit toujours en texte.
    this.ws.onmessage = (e) => {
      if (typeof e.data === "string") {
        this.handleMessage(e.data);
      } else if (e.data instanceof ArrayBuffer) {
        this.handleMessage(new TextDecoder().decode(e.data));
      } else {
        void (e.data as Blob).text().then((t) => this.handleMessage(t));
      }
    };
    this.ws.onerror = () =>
      this.callbacks.onError?.("Connexion Live impossible — vérifie la clé Gemini.");
    this.ws.onclose = () => {
      if (!this.stopped) this.callbacks.onClose?.();
    };
  }

  private startMic() {
    if (!this.micStream || !this.playCtx) return;
    this.micCtx = new AudioContext({ sampleRate: 16000 });
    // ⚠️ Chrome démarre l'AudioContext en suspended (autoplay policy) :
    // sans resume(), onaudioprocess ne se déclenche JAMAIS et l'IA n'entend rien.
    if (this.micCtx.state === "suspended") void this.micCtx.resume();
    const src = this.micCtx.createMediaStreamSource(this.micStream);
    const proc = this.micCtx.createScriptProcessor(2048, 1, 1);
    const mute = this.micCtx.createGain();
    mute.gain.value = 0; // on n'écoute pas soi-même
    proc.onaudioprocess = (e) => {
      if (this.stopped || this.ws?.readyState !== WebSocket.OPEN) return;
      const b64 = f32ToPcm16Base64(e.inputBuffer.getChannelData(0));
      this.ws.send(
        JSON.stringify({
          realtimeInput: { audio: { data: b64, mimeType: "audio/pcm;rate=16000" } },
        }),
      );
    };
    src.connect(proc);
    proc.connect(mute);
    mute.connect(this.micCtx.destination);
    this.processor = proc;
  }

  private playBase64Audio(b64: string, mimeType?: string) {
    if (!this.playCtx) return;
    if (this.playCtx.state === "suspended") void this.playCtx.resume();
    // le modèle natif sort en PCM16 24 kHz mono (on lit le rate si fourni)
    const rate = Number(/rate=(\d+)/.exec(mimeType ?? "")?.[1]) || 24000;
    const pcm = base64ToPcm16(b64);
    if (pcm.length === 0) return;
    const f32 = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) f32[i] = pcm[i] / 32768;
    const buf = this.playCtx.createBuffer(1, f32.length, rate);
    buf.getChannelData(0).set(f32);
    const src = this.playCtx.createBufferSource();
    src.buffer = buf;
    src.connect(this.playCtx.destination);
    const startAt = Math.max(this.playCtx.currentTime, this.nextPlayTime);
    src.start(startAt);
    this.nextPlayTime = startAt + buf.duration;
    this.sources.push(src);
    src.onended = () => {
      this.sources = this.sources.filter((s) => s !== src);
      if (this.sources.length === 0) this.callbacks.onActivity?.("listening");
    };
    this.callbacks.onActivity?.("speaking");
  }

  private stopPlayback() {
    for (const s of this.sources) {
      try {
        s.onended = null;
        s.stop();
      } catch {
        /* déjà arrêté */
      }
    }
    this.sources = [];
    this.nextPlayTime = this.playCtx?.currentTime ?? 0;
    this.callbacks.onActivity?.("listening");
  }

  private async handleMessage(raw: string) {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (this.stopped) return;

    if (msg.setupComplete) {
      this.startMic();
      this.callbacks.onReady?.();
      this.callbacks.onActivity?.("listening");
      // l'IA ouvre la conversation elle-même, en darija (« Salam a khoya ! »)
      setTimeout(() => this.sendText("salam a khoya"), 400);
      return;
    }
    if (msg.error) {
      this.callbacks.onError?.(
        String((msg.error as { message?: string })?.message ?? "Erreur Live"),
      );
      return;
    }

    // les functionCalls peuvent arriver au SOMMET du message (modèle natif audio),
    // sans serverContent : on les traite AVANT le guard sc
    const topCalls = (
      msg.toolCall as { functionCalls?: { id?: string; name: string; args?: Record<string, unknown> }[] } | undefined
    )?.functionCalls;
    if (topCalls?.length) {
      for (const fc of topCalls) await this.runFunctionCall(fc);
    }

    const sc = msg.serverContent as
      | {
          interrupted?: boolean;
          turnComplete?: boolean;
          transcription?: {
            inputTranscription?: { text?: string; finished?: boolean };
            outputTranscription?: { text?: string; finished?: boolean };
          };
          /** Forme réelle de l'API Live : transcriptions DIRECTEMENT sous serverContent. */
          inputTranscription?: { text?: string; finished?: boolean };
          outputTranscription?: { text?: string; finished?: boolean };
          modelTurn?: { parts?: Record<string, unknown>[] };
        }
      | undefined;
    if (!sc) return;

    if (sc.interrupted) this.stopPlayback();

    if (sc.transcription || sc.inputTranscription || sc.outputTranscription) {
      const inp = sc.transcription?.inputTranscription ?? sc.inputTranscription;
      const out = sc.transcription?.outputTranscription ?? sc.outputTranscription;
      if (inp?.text) {
        this.userBuf = inp.finished
          ? ""
          : (this.userBuf ? this.userBuf + " " : "") + inp.text;
        this.callbacks.onUserTranscript?.(inp.finished ? inp.text : this.userBuf || inp.text, inp.finished);
        if (inp.finished) this.userBuf = "";
      }
      if (out?.text) {
        this.assistantBuf = out.finished
          ? ""
          : (this.assistantBuf ? this.assistantBuf + " " : "") + out.text;
        this.callbacks.onAssistantTranscript?.(
          out.finished ? out.text : this.assistantBuf || out.text,
          out.finished,
        );
        if (out.finished) this.assistantBuf = "";
      }
    }

    // Fin de tour : l'API Live n'envoie presque jamais "finished" → on fige
    // les bulles accumulées (sinon elles restent partielles et disparaissent
    // au prochain message du fil).
    if (sc.turnComplete) {
      if (this.userBuf) {
        const t = this.userBuf;
        this.userBuf = "";
        this.callbacks.onUserTranscript?.(t, true);
      }
      if (this.assistantBuf) {
        const t = this.assistantBuf;
        this.assistantBuf = "";
        this.callbacks.onAssistantTranscript?.(t, true);
      }
    }

    for (const part of sc.modelTurn?.parts ?? []) {
      // ⚠️ l'API Live renvoie inlineData (camelCase) — on accepte aussi inline_data
      const inline = (part.inlineData ?? part.inline_data) as
        | { data?: string; mimeType?: string; mime_type?: string }
        | undefined;
      if (inline?.data)
        this.playBase64Audio(inline.data, inline.mimeType ?? inline.mime_type);

      const fc = part.functionCall as
        | { id?: string; name: string; args?: Record<string, unknown> }
        | undefined;
      if (fc?.name) await this.runFunctionCall(fc);
    }
  }

  private async runFunctionCall(fc: { id?: string; name: string; args?: Record<string, unknown> }) {
    let result: Record<string, unknown> = { ok: false, error: "aucun handler" };
    try {
      result = (await this.callbacks.onToolCall?.({
        id: fc.id,
        name: fc.name,
        args: fc.args ?? {},
      })) ?? { ok: false, error: "aucun handler" };
    } catch (err) {
      result = { ok: false, error: String(err) };
    }
    if (this.ws?.readyState === WebSocket.OPEN && fc.id) {
      this.ws.send(
        JSON.stringify({
          toolResponse: {
            functionResponses: [
              { id: fc.id, name: fc.name, response: { result } },
            ],
          },
        }),
      );
    }
  }

  /** Envoie du texte écrit (mode test / saisie clavier). */
  sendText(text: string) {
    if (this.ws?.readyState === WebSocket.OPEN)
      this.ws.send(JSON.stringify({ realtimeInput: { text } }));
  }

  stop() {
    this.stopped = true;
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.stopPlayback();
    this.processor?.disconnect();
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.micCtx?.close().catch(() => undefined);
    this.playCtx?.close().catch(() => undefined);
    this.ws = null;
    this.processor = null;
    this.micStream = null;
    this.micCtx = null;
    this.playCtx = null;
  }
}
