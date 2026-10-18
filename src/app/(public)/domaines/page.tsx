import type { Metadata } from "next";
import Link from "next/link";
import { DomainIcon } from "@/components/domain-icon";
import { listDomains } from "@/features/catalog/queries";

export const metadata: Metadata = { title: "Domaines d'ingénierie" };

export default async function DomainsPage() {
  const domains = await listDomains();
  return (
    <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
      <p className="text-sm font-semibold text-teal-600">Catalogue</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy-900">Domaines d&apos;ingénierie</h1>
      <p className="mt-2 max-w-2xl text-muted">Métiers associés, compétences fondamentales et avancées, outils, certifications et projets permettant de démontrer ses compétences.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {domains.map((d) => (
          <Link key={d.slug} href={`/domaines/${d.slug}`} className="group rounded-2xl border border-border bg-white p-5 transition hover:border-electric-300 hover:shadow-md">
            <span className="grid size-11 place-items-center rounded-xl bg-navy-50 text-navy-700 group-hover:bg-electric-100 group-hover:text-electric-700">
              <DomainIcon name={d.icon} className="size-5" />
            </span>
            <h2 className="mt-4 font-semibold text-navy-900">{d.name}</h2>
            <p className="mt-1 text-sm text-slate-600">{d.short_description}</p>
            <p className="mt-3 text-xs text-muted">{d.occupationCount} métiers · {d.skillCount} compétences</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
