import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Award, Briefcase, ClipboardCheck, FolderKanban, Wrench } from "lucide-react";
import { Badge, ButtonLink, Card, CardBody, CardHeader } from "@/components/ui";
import { DomainIcon } from "@/components/domain-icon";
import { getDomain } from "@/features/catalog/queries";
import { importanceLabel, levelLabel, SKILL_LEVELS } from "@/lib/labels";

export async function generateMetadata(props: PageProps<"/domaines/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const d = await getDomain(slug);
  return { title: d?.name ?? "Domaine" };
}

export default async function DomainPage(props: PageProps<"/domaines/[slug]">) {
  const { slug } = await props.params;
  const d = await getDomain(slug);
  if (!d) notFound();
  const fundamentals = d.skills.filter((s) => s.tier === "fondamentale");
  const advanced = d.skills.filter((s) => s.tier === "avancee");

  return (
    <div data-reveal-children className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="flex items-start gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-navy-800 text-teal-300"><DomainIcon name={d.icon} className="size-7" /></span>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-navy-900">{d.name}</h1>
          <p className="mt-2 max-w-3xl text-slate-600">{d.description}</p>
        </div>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-3">
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
                      <Badge key={s.name} tone={s.importance === "obligatoire" ? "blue" : "neutral"}>
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
                        <li key={l} className="grid grid-cols-[110px_1fr] gap-2">
                          <span className="font-medium text-electric-700">{levelLabel[l]}</span>
                          <span className="text-slate-600">{s.level_criteria?.[l] ?? "—"}</span>
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
            <CardBody className="flex flex-wrap gap-1.5">{d.tools.map((t) => <Badge key={t} tone="teal">{t}</Badge>)}</CardBody>
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
            <CardHeader icon={ClipboardCheck} title="Évaluations disponibles" />
            <CardBody className="space-y-2">
              {d.assessments.length === 0 && <p className="text-sm text-muted">Aucune évaluation publiée pour l&apos;instant.</p>}
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
