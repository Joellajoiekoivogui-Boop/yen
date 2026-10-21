import Link from "next/link";

/** Mention affichée sous le bouton Google : un nouveau compte accepte les conditions d'utilisation. */
export function GoogleTermsNote() {
  return (
    <p className="text-center text-xs leading-relaxed text-muted">
      En continuant avec Google, vous acceptez les{" "}
      <Link href="/conditions" target="_blank" className="underline hover:text-navy-900">conditions d&apos;utilisation</Link> et la{" "}
      <Link href="/confidentialite" target="_blank" className="underline hover:text-navy-900">politique de confidentialité</Link>. Votre mot de passe Google
      n&apos;est jamais transmis à YEN.
    </p>
  );
}
