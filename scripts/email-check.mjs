/** Contrôle la configuration email Payzik sans jamais afficher de valeur secrète.
 *
 *  Vérifie uniquement la présence des variables nécessaires et indique ce qui
 *  reste à fournir. Aucun email n'est envoyé par ce script.
 */

const required = [
  ["PAYZIK_SMTP_HOST", "Hôte SMTP du fournisseur"],
  ["PAYZIK_SMTP_PORT", "Port SMTP (587 ou 465)"],
  ["PAYZIK_SMTP_USER", "Utilisateur SMTP"],
  ["PAYZIK_SMTP_PASS", "Mot de passe / clé API SMTP"],
];

const optional = [
  ["PAYZIK_SENDER_NAME", "Nom d'expéditeur (Payzik)"],
  ["PAYZIK_FROM_EMAIL", "Adresse d'expédition sur le domaine vérifié"],
  ["SUPABASE_ACCESS_TOKEN", "Token Management API (application des templates)"],
  ["SUPABASE_PROJECT_REF", "Référence du projet Supabase"],
];

let missing = 0;
for (const [key, label] of required) {
  const ok = Boolean((process.env[key] || "").trim());
  if (!ok) missing += 1;
  console.log(`${ok ? "OK     " : "MANQUE "} ${key.padEnd(24)} ${label}`);
}
for (const [key, label] of optional) {
  const ok = Boolean((process.env[key] || "").trim());
  console.log(`${ok ? "OK     " : "OPTION "} ${key.padEnd(24)} ${label}`);
}

console.log(
  missing === 0
    ? "\nSMTP complet : un test réel reste nécessaire avant de déclarer les emails opérationnels."
    : `\n${missing} variable(s) SMTP manquante(s) : configuration externe à terminer manuellement.`,
);

if ((process.env.PAYZIK_FROM_EMAIL || "").toLowerCase().endsWith("@resend.dev")) {
  console.log(
    "MODE TEST : onboarding@resend.dev ne peut envoyer qu'à l'adresse du compte Resend.\n" +
      "Pour les utilisateurs réels, vérifier un domaine puis utiliser une adresse @domaine-vérifié.",
  );
}
