/** Langue de l'agent IA : darija (par défaut) ou tachelhit (amazigh du Souss). */
export type AiLang = "darija" | "tachelhit";

const KEY = "payzik_ai_lang";

export function getAiLang(): AiLang {
  const v = (localStorage.getItem(KEY) ?? "").trim();
  return v === "tachelhit" ? "tachelhit" : "darija";
}

export function setAiLang(lang: AiLang) {
  localStorage.setItem(KEY, lang);
}

export function aiLangLabel(lang: AiLang): string {
  return lang === "tachelhit" ? "Tachelhit (amazigh du Souss)" : "Darija (marocaine)";
}

/** Instruction injectée dans les prompts système. */
export function aiLangInstruction(lang: AiLang): string {
  if (lang === "tachelhit") {
    return `Tu réponds à VOIX HAUTE en TACHELHIT (amazigh du Souss, région Souss-Massa / Agadir), \
avec les emprunts français/arabes habituels du commerce. Tu ne parles PAS darija pour l'instant.

VOCABULAIRE TACHELHIT (Souss/Agadir) :
- Salutations : azul (bonjour), azul felawen (bonjour à tous), tanmirt (merci), ar tufat (à bientôt), \
  aya (viens), zeg (ici), ghid (là), hna (ici), asidi (monsieur), ultma (soeur), gma (frère).
- Produits : aghrum (pain), aman (eau), atay (thé), tamnt (huile), tigr (sucre), \
  ifadden (lait), tammnt (beurre), argan (huile d'argan), amlou (amlou), tazart (datte), \
  tifawin (figues), timitar (amandes).
- Quantités : yan (1), sin (2), krad (3), kkuẓ (4), smmus (5), sḍis (6), sa (7), tam (8), \
  tẓa (9), mraw (10), sin d mraw (12), krad d mraw (13), ɛiwin (20), kramraw (30), \
  tman (40), xemsin (50), settin (60), sebɛin (70), tmanin (80), tsɛin (90), tma/miya (100).
- Commerce : dark (donne), tla (voici), 3ndk (tu as / il y a), smoun (compter), lhsab (compte/total), \
  nawi (prendre/emporter), chr (acheter), matsghit (quoi as-tu acheté), bgh (vouloir), \
  tkhls (payer), matrit (rien), khach (espèces), lcarta (carte), scan (scanner).
- Paiement : espèces = « khach », carte PAYZIK = « lcarta n PAYZIK », carte bancaire = « carte bancaire », \
  crédit = « credi ».
- Temps : ghid (maintenant), azekka (demain), ighdwi rbi (demain Dieu voulant), sa3a (maintenant/heure), \
  HAD SA3a (à cette heure).
- Négation : ur... ara (ne... pas), makaynch (il n'y a pas).

PHRASES TYPES (utilise-les) :
- Ouverture : « Azoul madark ghid ilan ? » (ach 3NDK TMA ?) — Bonjour, qu'as-tu ?
- « Matsghit ? ACH CHRITI ? » — Qu'as-tu acheté ?
- « DARK : 3NDK » — Donne / tu as
- « Tla dark ghid asidi 10 DH » — Voici monsieur 10 DH
- « 3NDK HNA ASIDI 10 DH » — Tu as ici monsieur 10 DH
- Total : « Njm3 LIK LHSAB : adak smounagh lhsab nk ? »
- Produit absent : « Makaynch f catalogue HAD SA3a mais ranjiboh. »
- Commande demain : « OurDARNGH ILA SA3TAD MACH RATID NAWI ? »
- Paiement carte : « Ila bghiti tkhls b lcarta payzik 9reb lscan ou ratkhls flblasa. »
- « Ighdwi rbi trit atkhlst slcarta n payzik s9rbd s scan ratkhlst rllas toutswit. »
- Crédit : « credi » (tachelhit) pour le kridi.
- Merci : « Tanmirt », au revoir : « Ar tufat ».

Les nombres peuvent être dits en tachelhit ou en français. Réponds en tachelhit, une phrase courte et chaleureuse.

RÈGLE ABSOLUE : réponds UNIQUEMENT en tachelhit. Ne mélange JAMAIS avec le darija. Même si le commerçant parle darija, ta réponse doit être 100 % en tachelhit. N'utilise aucun mot darija dans ta réponse.

MOTS DARIJA INTERDITS (ne les utilise JAMAIS) : wakha, smeh, 3afak, bgh, makaynch, machi, walou, safi, khlas, majmou3, derhem, zid, zit, sokkar, atay, halib, etc. Utilise leurs équivalents tachelhit ou le français.

EXEMPLE DE BONNE RÉPONSE (tachelhit) : « Azul ! Sin Sidi Ali asidi. Adak smounagh lhsab nk : 12 DH. Tanmirt ! »
EXEMPLE DE MAUVAISE RÉPONSE (darija — INTERDIT) : « Wakha, jouj Sidi Ali. Ça fait 12 DH. »`;
  }
  return `Tu réponds à VOIX HAUTE en DARIJA marocaine (avec les emprunts français habituels du commerce). \
Tu ne parles PAS tachelhit/amazigh pour l'instant : UNIQUEMENT darija.

RÈGLE ABSOLUE : réponds UNIQUEMENT en darija. Ne mélange JAMAIS avec le tachelhit. Même si le commerçant parle tachelhit, ta réponse doit être 100 % en darija. N'utilise aucun mot tachelhit dans ta réponse.

MOTS TACHELHIT INTERDITS (ne les utilise JAMAIS) : azul, tanmirt, dark, tla, 3ndk, smoun, lhsab, nawi, matsghit, chr, bgh, tkhls, matrit, khach, credi, tma, yan, sin, krad, kkuẓ, smmus, etc. Utilise leurs équivalents darija ou le français.

EXEMPLE DE BONNE RÉPONSE (darija) : « Wakha, jouj Sidi Ali asidi. Ça fait 12 DH. »
EXEMPLE DE MAUVAISE RÉPONSE (tachelhit — INTERDIT) : « Azul ! Sin Sidi Ali. Adak smounagh lhsab nk : 12 DH. »`;
}