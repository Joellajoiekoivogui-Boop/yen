/** Connexion refusée tant que l'adresse e-mail n'est pas vérifiée (affiché avec un lien vers la page du code). */
export const EMAIL_NOT_CONFIRMED_MESSAGE =
  "Votre adresse e-mail n'est pas encore vérifiée : saisissez le code reçu par e-mail lors de l'inscription.";

/**
 * Messages d'erreur d'inscription à partir des codes de Supabase Auth.
 * Un compte déjà existant n'est jamais signalé (pas d'énumération des comptes).
 */
export function signUpErrorMessage(code: string | undefined): string | null {
  switch (code) {
    case undefined:
    case "user_already_exists":
    case "email_exists":
      return null;
    case "weak_password":
      return "Ce mot de passe est trop faible ou trop courant : choisissez-en un autre.";
    case "email_address_invalid":
      return "Cette adresse e-mail est refusée. Utilisez une autre adresse.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Trop de demandes d'inscription pour le moment. Réessayez dans une heure.";
    case "email_address_not_authorized":
      return "L'e-mail de confirmation n'a pas pu être envoyé : le service d'e-mail de la plateforme n'est pas encore configuré. Prévenez l'équipe YEN.";
    case "signup_disabled":
    case "email_provider_disabled":
      return "Les inscriptions sont momentanément fermées. Prévenez l'équipe YEN.";
    default:
      return "L'inscription n'a pas pu aboutir. Vérifiez vos informations et réessayez.";
  }
}
