import type { Metadata } from "next";
import { PageHero } from "@/components/public/page-hero";
import { listDomains, referenceDomains } from "@/features/catalog/queries";
import { DomainExplorer } from "./domain-explorer";


export const metadata: Metadata = { title: "Domaines d'ingénierie" };

export default async function DomainsPage() {
  // base momentanément injoignable : catalogue de référence (même contenu)
  const domains = await listDomains().catch(() => referenceDomains());
  return (
    <>
      <PageHero
        eyebrow="Catalogue"
        title="Domaines d'ingénierie"
        description={<p>Métiers associés, compétences fondamentales et avancées, outils, certifications et projets permettant de démontrer ses compétences.</p>}
      />
      <div data-reveal="none" className="mx-auto max-w-7xl px-4 pt-6 pb-20 sm:px-6 lg:px-8">
        <DomainExplorer
          domains={domains.map((d) => ({ slug: d.slug, name: d.name, short_description: d.short_description, icon: d.icon, occupationCount: d.occupationCount, skillCount: d.skillCount }))}
        />
      </div>
    </>
  );
}
