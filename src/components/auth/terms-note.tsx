import Link from "next/link";

/** Mention unique sous les formulaires d'accès : créer un compte (Google ou e-mail) vaut acceptation des conditions. */
export function TermsNote() {
  return (
    <p className="text-center text-xs leading-relaxed text-muted">
      En continuant, vous acceptez les{" "}
      <Link href="/conditions" target="_blank" className="underline hover:text-navy-900">
        conditions d&apos;utilisation
      </Link>{" "}
      et la{" "}
      <Link href="/confidentialite" target="_blank" className="underline hover:text-navy-900">
        politique de confidentialité
      </Link>
      .
    </p>
  );
}
