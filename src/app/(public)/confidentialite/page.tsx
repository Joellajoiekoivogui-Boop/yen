import type { Metadata } from "next";

export const metadata: Metadata = { title: "Politique de confidentialité" };

export default function PrivacyPage() {
  return (
    <div data-reveal-children className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight text-navy-900">Politique de confidentialité</h1>
      <p className="mt-2 text-sm text-muted">Version 2026-10 — modèle à faire valider par le responsable juridique de YEN avant mise en production.</p>
      <div className="prose-yen mt-6">
        <h2>Responsable du traitement</h2>
        <p>Youth Engineers Network (YEN). Les coordonnées du délégué ou du référent chargé de la protection des données doivent être précisées ici par YEN.</p>
        <h2>Données collectées</h2>
        <ul>
          <li>Identité et coordonnées : nom, prénom, adresse e-mail, téléphone (obligatoire pour les candidats, afin que YEN puisse vous contacter), ville, pays.</li>
          <li>Parcours : établissement, formation suivie chez YEN, niveau d&apos;études, formations, expériences, projets, certifications, langues.</li>
          <li>Documents : CV et justificatifs au format PDF, stockés de manière privée.</li>
          <li>Entretiens : réponses, résultats, compétences démontrées et analyses associées.</li>
          <li>Suivi : candidatures, entretiens de recrutement, décisions et placements.</li>
        </ul>
        <p>Aucune photo, ni donnée relative au sexe, à l&apos;origine, à la religion ou à la situation familiale n&apos;est demandée ni utilisée pour classer les candidats.</p>
        <h2>Finalités</h2>
        <ul>
          <li>Accompagner les bénéficiaires dans le développement de leurs compétences et leur insertion professionnelle.</li>
          <li>Mettre en relation les candidats avec des organisations partenaires, avec leur consentement.</li>
          <li>Mesurer l&apos;impact des programmes de YEN de façon agrégée.</li>
        </ul>
        <h2>Intelligence artificielle</h2>
        <p>
          Si vous y consentez (« Paramètres et confidentialité »), votre CV, votre profil et vos réponses écrites aux entretiens peuvent être transmis au
          fournisseur d&apos;IA utilisé par YEN, actuellement Anthropic (modèles Claude), qui les traite hors de Guinée, notamment aux États-Unis. Ils
          servent à extraire les informations de votre CV, à proposer des recommandations, à répondre à l&apos;assistant de carrière et à aider l&apos;équipe
          YEN (synthèses de profil, propositions de note relues par un évaluateur). Votre adresse e-mail et votre téléphone de compte ne sont pas ajoutés
          aux données envoyées ; votre CV, lui, est transmis tel quel et peut contenir vos coordonnées.
        </p>
        <p>
          Les résultats sont des suggestions : les informations extraites ne sont ajoutées à votre profil qu&apos;après votre validation, une compétence
          n&apos;est jamais considérée comme démontrée sur la seule base d&apos;une analyse automatique, et aucune décision de recrutement n&apos;est prise
          automatiquement. Chaque analyse est enregistrée (date, modèle, sources utilisées) et peut être corrigée ou contestée par l&apos;équipe YEN. Vous
          pouvez retirer ce consentement à tout moment : aucune nouvelle analyse n&apos;est alors réalisée.
        </p>
        <h2>Partage avec les partenaires</h2>
        <p>
          Un partenaire n&apos;accède jamais à l&apos;ensemble de la base. Il ne voit que les candidatures reçues sur ses offres et les profils que YEN lui a
          explicitement partagés, si vous avez donné votre consentement. Votre adresse e-mail et votre téléphone ne lui sont pas communiqués par la plateforme.
          Vous pouvez retirer ce consentement à tout moment depuis « Paramètres et confidentialité ».
        </p>
        <h2>Sécurité</h2>
        <p>Accès contrôlés par rôle et vérifiés côté serveur, isolation des données au niveau de la base, stockage privé des documents, liens de téléchargement temporaires, journal d&apos;audit.</p>
        <h2>Vos droits</h2>
        <p>Vous pouvez consulter, exporter, rectifier vos données et demander leur suppression depuis votre espace (« Paramètres et confidentialité ») ou en contactant YEN.</p>
        <h2>Conservation</h2>
        <p>La durée de conservation doit être fixée par YEN (par exemple : durée de l&apos;accompagnement puis période de suivi d&apos;insertion), puis les données sont supprimées ou anonymisées.</p>
      </div>
    </div>
  );
}
