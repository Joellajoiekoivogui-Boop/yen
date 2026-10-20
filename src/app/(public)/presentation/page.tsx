import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui";

export const metadata: Metadata = { title: "Présentation" };

export default function PresentationPage() {
  return (
    <div data-reveal-children className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <p className="text-sm font-semibold text-teal-600">Présentation</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy-900">YEN Career Bridge</h1>
      <div className="prose-yen mt-6">
        <p>
          Le Youth Engineers Network (YEN) accompagne des étudiants, des apprenants et des diplômés dans leurs formations techniques et professionnelles.
          YEN Career Bridge est sa plateforme de gestion des talents et d&apos;insertion professionnelle.
        </p>
        <h2>Pourquoi cette plateforme ?</h2>
        <p>
          Un simple site d&apos;annonces ne suffit pas pour rapprocher les jeunes ingénieurs et techniciens des organisations qui recrutent. Il faut savoir ce que
          chaque candidat sait réellement faire, ce qu&apos;il doit encore renforcer et quels postes correspondent à son profil.
        </p>
        <h2>Ce que fait YEN Career Bridge</h2>
        <ul>
          <li>Centraliser les CV, diplômes, certifications, projets et expériences de chaque bénéficiaire dans un espace personnel sécurisé.</li>
          <li>Évaluer les compétences techniques et transversales par des questionnaires, exercices, études de cas et évaluations humaines.</li>
          <li>Distinguer clairement les compétences déclarées des compétences démontrées, avec les preuves associées.</li>
          <li>Proposer des métiers compatibles et un plan de progression personnalisé.</li>
          <li>Gérer les offres de stage, d&apos;emploi, d&apos;alternance et de mission, les candidatures, les entretiens et les placements.</li>
          <li>Mesurer l&apos;impact de YEN en matière d&apos;insertion professionnelle, sur des périodes et des définitions explicites.</li>
        </ul>
        <h2>Nos principes</h2>
        <ul>
          <li><strong>Confidentialité :</strong> un candidat ne voit que ses propres données ; un partenaire ne voit que les profils qui lui ont été partagés avec consentement.</li>
          <li><strong>Explicabilité :</strong> chaque score et chaque analyse indiquent leurs sources et leur niveau de confiance.</li>
          <li><strong>Équité :</strong> aucune caractéristique sensible (photo, sexe, origine, religion, situation familiale) n&apos;est utilisée pour classer les candidats.</li>
          <li><strong>Contrôle humain :</strong> l&apos;intelligence artificielle assiste ; les décisions appartiennent à l&apos;équipe YEN et aux recruteurs.</li>
        </ul>
      </div>
      <div className="mt-8 flex gap-3">
        <ButtonLink href="/inscription" variant="secondary">Créer un compte</ButtonLink>
        <ButtonLink href="/fonctionnement" variant="outline">Fonctionnement</ButtonLink>
      </div>
    </div>
  );
}
