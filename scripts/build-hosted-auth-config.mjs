/** Génère le payload Management API pour les modèles PAYZIK.
 *  Aucun secret n'est lu ni écrit : seulement les fichiers HTML et les objets. */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const templates = resolve(root, "supabase/templates");

const read = (name) => readFileSync(resolve(templates, `${name}.html`), "utf8");

const config = {
  mailer_autoconfirm: false,
  mailer_subjects_confirmation: "Payzik — confirmez votre adresse email",
  mailer_templates_confirmation_content: read("confirmation"),
  mailer_subjects_recovery: "Payzik — réinitialisez votre mot de passe",
  mailer_templates_recovery_content: read("recovery"),
  mailer_subjects_email_change: "Payzik — confirmez votre nouvelle adresse email",
  mailer_templates_email_change_content: read("email_change"),
  mailer_subjects_magic_link: "Payzik — votre lien de connexion",
  mailer_templates_magic_link_content: read("magic_link"),
  mailer_subjects_reauthentication: "Payzik — code de vérification : {{ .Token }}",
  mailer_templates_reauthentication_content: read("reauthentication"),
  mailer_subjects_invite: "Payzik — invitation à rejoindre votre espace",
  mailer_templates_invite_content: read("invite"),

  mailer_notifications_password_changed_enabled: true,
  mailer_subjects_password_changed_notification: "Payzik — votre mot de passe a été modifié",
  mailer_templates_password_changed_notification_content: read("password_changed"),
  mailer_notifications_email_changed_enabled: true,
  mailer_subjects_email_changed_notification: "Payzik — votre adresse email a été modifiée",
  mailer_templates_email_changed_notification_content: read("email_changed"),
  mailer_notifications_phone_changed_enabled: true,
  mailer_subjects_phone_changed_notification: "Payzik — votre numéro de téléphone a été modifié",
  mailer_templates_phone_changed_notification_content: read("phone_changed"),
  mailer_notifications_mfa_factor_enrolled_enabled: true,
  mailer_subjects_mfa_factor_enrolled_notification: "Payzik — une méthode de vérification a été ajoutée",
  mailer_templates_mfa_factor_enrolled_notification_content: read("mfa_factor_enrolled"),
  mailer_notifications_mfa_factor_unenrolled_enabled: true,
  mailer_subjects_mfa_factor_unenrolled_notification: "Payzik — une méthode de vérification a été retirée",
  mailer_templates_mfa_factor_unenrolled_notification_content: read("mfa_factor_unenrolled"),
  mailer_notifications_identity_linked_enabled: true,
  mailer_subjects_identity_linked_notification: "Payzik — une méthode de connexion a été liée",
  mailer_templates_identity_linked_notification_content: read("identity_linked"),
  mailer_notifications_identity_unlinked_enabled: true,
  mailer_subjects_identity_unlinked_notification: "Payzik — une méthode de connexion a été retirée",
  mailer_templates_identity_unlinked_notification_content: read("identity_unlinked"),
};

const out = resolve(root, "supabase/email/hosted-auth-config.json");
writeFileSync(out, `${JSON.stringify(config, null, 2)}\n`, "utf8");
console.log(`Generated ${out}`);
