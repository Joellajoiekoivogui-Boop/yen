import type { Metadata } from "next";

export const metadata: Metadata = { title: "Conditions d'utilisation" };

export default function TermsPage() {
  return (
    <div data-reveal-children className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight text-navy-900">Conditions d&apos;utilisation</h1>
      <p className="mt-2 text-sm text-muted">Version 2026-10 — modèle à faire valider par YEN avant mise en production.</p>
      <div className="prose-yen mt-6">
        <h2>Objet</h2>
        <p>YEN Career Bridge est un service du Youth Engineers Network destiné à ses bénéficiaires, à son équipe et à ses organisations partenaires.</p>
        <h2>Comptes</h2>
        <ul>
          <li>Chaque compte est personnel. Vous êtes responsable de la confidentialité de votre mot de passe.</li>
          <li>Les informations saisies doivent être exactes. Il est interdit de déclarer des diplômes, expériences ou certifications fictifs.</li>
          <li>Les comptes partenaires sont activés par YEN après validation de l&apos;organisation.</li>
        </ul>
        <h2>Entretiens</h2>
        <p>Les entretiens doivent être réalisés personnellement et sans aide extérieure non autorisée. YEN peut invalider un résultat en cas de fraude.</p>
        <h2>Usage par les partenaires</h2>
        <p>Les informations consultées par un partenaire ne peuvent être utilisées que pour le recrutement concerné, et ne doivent pas être copiées ni transmises à des tiers.</p>
        <h2>Recommandations et scores</h2>
        <p>Les scores de compatibilité et analyses sont des aides à la décision, non des garanties d&apos;embauche. Les décisions restent humaines.</p>
        <h2>Suspension</h2>
        <p>YEN peut désactiver un compte en cas d&apos;usage contraire aux présentes conditions, après information de l&apos;utilisateur lorsque c&apos;est possible.</p>
      </div>
    </div>
  );
}
