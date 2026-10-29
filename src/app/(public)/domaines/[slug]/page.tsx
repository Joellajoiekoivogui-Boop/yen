import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Award, Briefcase, ClipboardCheck, FolderKanban, Wrench } from "lucide-react";
import { Badge, ButtonLink, Card, CardBody, CardHeader } from "@/components/ui";
import { DomainIcon } from "@/components/domain-icon";
import { getDomain, referenceDomain } from "@/features/catalog/queries";
import { importanceLabel, levelLabel, SKILL_LEVELS } from "@/lib/labels";


export async function generateMetadata(props: PageProps<"/domaines/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const d = await getDomain(slug).catch(() => referenceDomain(slug));
  return { title: d?.name ?? "Domaine" };
}

export default async function DomainPage(props: PageProps<"/domaines/[slug]">) {
  const { slug } = await props.params;
  const d = await getDomain(slug).catch(() => referenceDomain(slug));
  if (!d) notFound();
  const fundamentals = d.skills.filter((s) => s.tier === "fondamentale");
  const advanced = d.skills.filter((s) => s.tier === "avancee");

  return (
    <div data-reveal-children className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="flex items-start gap-3 sm:gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-navy-800 text-gold-300 sm:size-14"><DomainIcon name={d.icon} className="size-6 sm:size-7" /></span>
        {/* min-w-0 + césure : un nom long (« contrôle-commande ») passe à la ligne au lieu de déborder */}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-balance break-words hyphens-auto text-navy-900 sm:text-3xl">{d.name}</h1>
          <p className="mt-2 max-w-3xl text-slate-600">{d.description}</p>
        </div>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader icon={Briefcase} title="Métiers associés" />
            <CardBody className="space-y-4">
              {d.occupations.map((o) => (
                <div key={o.id} className="rounded-lg border border-border p-4">
                  <h3 className="font-semibold text-navy-900">{o.title}</h3>
                  <p className="mt-1 text-sm text-slate-600">{o.description}</p>
                  <p className="mt-1 text-xs text-muted">Formation habituelle : {o.typical_education}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {o.skills.map((s) => (
                      // pastille longue (compétence · niveau · importance) : passe à la ligne sur téléphone
                      <Badge key={s.name} tone={s.importance === "obligatoire" ? "blue" : "neutral"} className="max-w-full rounded-lg whitespace-normal">
                        {s.name} · {levelLabel[s.required_level]} · {importanceLabel[s.importance as keyof typeof importanceLabel]}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>

          {[{ title: "Compétences fondamentales", list: fundamentals }, { title: "Compétences avancées", list: advanced }].map((g) => (
            <Card key={g.title}>
              <CardHeader icon={ClipboardCheck} title={g.title} description="Critères observables par niveau" />
              <CardBody className="space-y-4">
                {g.list.map((s) => (
                  <details key={s.id} className="group rounded-lg border border-border p-3">
                    <summary className="cursor-pointer list-none font-medium text-navy-900 marker:hidden">
                      <span className="inline-flex items-center gap-2">{s.name}{s.category === "outil" && <Badge>Outil</Badge>}</span>
                    </summary>
                    <ul className="mt-3 space-y-2 text-sm">
                      {SKILL_LEVELS.map((l) => (
                        // téléphone : niveau au-dessus de son critère (la colonne de texte serait trop étroite)
                        <li key={l} className="grid gap-0.5 sm:grid-cols-[110px_minmax(0,1fr)] sm:gap-2">
                          <span className="font-medium text-electric-700">{levelLabel[l]}</span>
                          <span className="hyphens-auto break-words text-slate-600">{s.level_criteria?.[l] ?? "—"}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
              </CardBody>
            </Card>
          ))}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader icon={Wrench} title="Outils et technologies" />
            <CardBody className="flex flex-wrap gap-1.5">{d.tools.map((t) => <Badge key={t} tone="gold">{t}</Badge>)}</CardBody>
          </Card>
          <Card>
            <CardHeader icon={Award} title="Certifications pertinentes" />
            <CardBody><ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">{d.certifications.map((c) => <li key={c}>{c}</li>)}</ul></CardBody>
          </Card>
          <Card>
            <CardHeader icon={FolderKanban} title="Projets pour démontrer ses compétences" />
            <CardBody><ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">{d.project_types.map((c) => <li key={c}>{c}</li>)}</ul></CardBody>
          </Card>
          <Card>
            <CardHeader icon={ClipboardCheck} title="Entretiens disponibles" />
            <CardBody className="space-y-2">
              {d.assessments.length === 0 && <p className="text-sm text-muted">Aucun entretien publié pour l&apos;instant.</p>}
              {d.assessments.map((a) => (
                <div key={a.id} className="text-sm">
                  <p className="font-medium text-navy-900">{a.title}</p>
                  <p className="text-xs text-muted">{levelLabel[a.level]} · {a.duration_minutes} min</p>
                </div>
              ))}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Critères de progression" />
            <CardBody><p className="text-sm text-slate-600">{d.progression_criteria}</p></CardBody>
          </Card>
          <ButtonLink href="/inscription" variant="secondary" className="w-full">Évaluer mes compétences</ButtonLink>
        </div>
      </div>
    </div>
  );
}
