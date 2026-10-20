import type { Metadata } from "next";
import { listDomains } from "@/features/catalog/queries";
import { DomainExplorer } from "./domain-explorer";

export const metadata: Metadata = { title: "Domaines d'ingénierie" };

export default async function DomainsPage() {
  const domains = await listDomains();
  return (
    <div data-reveal-children className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
      <p className="text-sm font-semibold text-gold-600">Catalogue</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy-900">Domaines d&apos;ingénierie</h1>
      <p className="mt-2 max-w-2xl text-muted">Métiers associés, compétences fondamentales et avancées, outils, certifications et projets permettant de démontrer ses compétences.</p>
      <DomainExplorer
        domains={domains.map((d) => ({ slug: d.slug, name: d.name, short_description: d.short_description, icon: d.icon, occupationCount: d.occupationCount, skillCount: d.skillCount }))}
      />
    </div>
  );
}
