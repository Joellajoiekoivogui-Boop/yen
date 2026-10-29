import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { IntentLink } from "@/components/layout/intent-link";
import { ChevronDown, Download, Flag, Phone, SlidersHorizontal } from "lucide-react";
import { Badge, Button, ButtonLink, Card, PageHeader, Pagination, Table, TableEmpty, Td, Th } from "@/components/ui";
import { requireStaff } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { availabilityLabel, levelLabel, opportunityLabel, pipelineLabel, PIPELINE_STATUSES, SKILL_LEVELS, type Availability, type PipelineStatus, type SkillLevel } from "@/lib/labels";
import { clampInt, formatDate, param } from "@/lib/utils";
import { searchTalents, type TalentFilters } from "@/features/admin/talents";

export const metadata: Metadata = { title: "Répertoire des talents" };

export default async function TalentsPage(props: PageProps<"/admin/talents">) {
  const sp = await props.searchParams;
  const ctx = await requireStaff("candidates.read");
  const supabase = await createClient();
  const filters: TalentFilters = {
    q: param(sp.q)?.slice(0, 80),
    domain: param(sp.domaine) || undefined,
    skill: param(sp.competence) || undefined,
    minLevel: SKILL_LEVELS.includes(param(sp.niveau) as SkillLevel) ? (param(sp.niveau) as SkillLevel) : undefined,
    program: param(sp.formation)?.slice(0, 100) || undefined,
    gradYear: param(sp.annee) ? clampInt(param(sp.annee), 0, 1970, 2100) : undefined,
    city: param(sp.ville)?.slice(0, 80) || undefined,
    availability: param(sp.disponibilite) || undefined,
    opportunity: param(sp.opportunite) || undefined,
    minScore: param(sp.score) ? clampInt(param(sp.score), 0, 0, 100) : undefined,
    pipeline: param(sp.statut) || undefined,
    flagged: param(sp.verifier) === "1",
    includeDemo: param(sp.demo) === "1",
    sort: (["activite", "inscription", "identifiant", "diplomation"].includes(param(sp.tri) ?? "") ? param(sp.tri) : "activite") as TalentFilters["sort"],
    page: clampInt(param(sp.page), 1, 1, 10000),
    pageSize: 25,
  };
  const [{ rows, total }, domains, skills] = await Promise.all([
    searchTalents(supabase, filters),
    supabase.from("engineering_domains").select("id, name").eq("is_active", true).order("position"),
    supabase.from("skills").select("id, name").eq("is_active", true).order("name"),
  ]);
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) { const val = param(v); if (val && k !== "page") params.set(k, val); }
  const hrefFor = (p: number) => `/admin/talents?${new URLSearchParams({ ...Object.fromEntries(params), page: String(p) })}`;

  // filtres secondaires renseignés : leur volet s'ouvre et leur nombre est affiché
  const advancedCount = [filters.skill, filters.minLevel, filters.program, filters.gradYear, filters.city, filters.availability, filters.opportunity, filters.minScore, filters.flagged || undefined, filters.includeDemo || undefined, filters.sort !== "activite" ? filters.sort : undefined].filter((v) => v !== undefined && v !== "").length;

  const sel = (name: string, label: string, options: { value: string; label: string }[], value?: string) => (
    <div>
      <label htmlFor={name} className="mb-1 block text-xs font-medium text-muted">{label}</label>
      <select id={name} name={name} defaultValue={value ?? ""} className="field-input">
        <option value="">Tous</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Répertoire des talents"
        description="Recherche multicritère. Les compétences « évaluées » sont des compétences démontrées par une preuve validée."
        actions={ctx.permissions.has("reports.export") ? <ButtonLink href={`/api/admin/export/talents?${params}`} variant="outline" prefetch={false}><Download className="size-4" aria-hidden /> Export CSV</ButtonLink> : undefined}
      />
      <Card className="p-4">
        <Form action="/admin/talents" className="space-y-3">
          {/* Filtres principaux toujours visibles ; les autres sont regroupés (page plus courte, surtout sur téléphone) */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto]">
            <div className="sm:col-span-2 lg:col-span-1">
              <label htmlFor="q" className="mb-1 block text-xs font-medium text-muted">Nom, téléphone ou identifiant YEN</label>
              <input id="q" name="q" type="search" defaultValue={filters.q} className="field-input" placeholder="Nom, téléphone ou YEN-CB-000012" />
            </div>
            {sel("domaine", "Domaine", (domains.data ?? []).map((d) => ({ value: d.id, label: d.name })), filters.domain)}
            {sel("statut", "Statut du profil", PIPELINE_STATUSES.map((l) => ({ value: l, label: pipelineLabel[l] })), filters.pipeline)}
            <div className="flex items-end gap-2">
              <Button type="submit">Filtrer</Button>
              <Link href="/admin/talents" className="h-10 px-2 text-sm leading-10 text-muted hover:text-navy-900">Réinitialiser</Link>
            </div>
          </div>
          <details open={advancedCount > 0} className="group rounded-xl border border-border bg-slate-50/60 [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium text-navy-800 select-none">
              <SlidersHorizontal className="size-4" aria-hidden />
              Plus de filtres
              {advancedCount > 0 && <Badge tone="blue">{advancedCount} actif{advancedCount > 1 ? "s" : ""}</Badge>}
              <ChevronDown className="ml-auto size-4 transition-transform duration-300 group-open:rotate-180" aria-hidden />
            </summary>
            <div className="grid gap-3 border-t border-border p-3 sm:grid-cols-2 lg:grid-cols-4">
              {sel("competence", "Compétence démontrée", (skills.data ?? []).map((d) => ({ value: d.id, label: d.name })), filters.skill)}
              {sel("niveau", "Niveau minimal", SKILL_LEVELS.map((l) => ({ value: l, label: levelLabel[l] })), filters.minLevel)}
              <div><label htmlFor="formation" className="mb-1 block text-xs font-medium text-muted">Formation YEN</label><input id="formation" name="formation" defaultValue={filters.program} className="field-input" /></div>
              <div><label htmlFor="annee" className="mb-1 block text-xs font-medium text-muted">Année de diplomation</label><input id="annee" name="annee" type="number" defaultValue={filters.gradYear} className="field-input" /></div>
              <div><label htmlFor="ville" className="mb-1 block text-xs font-medium text-muted">Ville</label><input id="ville" name="ville" defaultValue={filters.city} className="field-input" /></div>
              {sel("disponibilite", "Disponibilité", Object.entries(availabilityLabel).map(([value, label]) => ({ value, label })), filters.availability)}
              {sel("opportunite", "Opportunité recherchée", Object.entries(opportunityLabel).map(([value, label]) => ({ value, label })), filters.opportunity)}
              <div><label htmlFor="score" className="mb-1 block text-xs font-medium text-muted">Résultat min. à un entretien (%)</label><input id="score" name="score" type="number" min={0} max={100} defaultValue={filters.minScore} className="field-input" /></div>
              {sel("tri", "Tri", [{ value: "activite", label: "Dernière activité" }, { value: "inscription", label: "Date d'inscription" }, { value: "identifiant", label: "Identifiant" }, { value: "diplomation", label: "Année de diplomation" }], filters.sort)}
              <div className="flex items-end gap-4 pb-2 text-sm">
                <label className="flex items-center gap-1.5"><input type="checkbox" name="verifier" value="1" defaultChecked={filters.flagged} className="size-4 accent-electric-600" /> À vérifier</label>
                <label className="flex items-center gap-1.5"><input type="checkbox" name="demo" value="1" defaultChecked={filters.includeDemo} className="size-4 accent-electric-600" /> Démo</label>
              </div>
            </div>
          </details>
        </Form>
      </Card>

      <p className="text-sm text-muted" role="status"><strong className="text-navy-900 tabular-nums">{total}</strong> candidat{total > 1 ? "s" : ""}</p>

      {/* Téléphone : une fiche par candidat (le tableau de 12 colonnes ne tient pas à l'écran) */}
      <ul className="space-y-3 md:hidden">
        {rows.map((r) => (
          <li key={r.id}>
            <Card className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <IntentLink href={`/admin/talents/${r.id}`} className="font-semibold text-navy-900 hover:underline">{r.name}</IntentLink>
                  <p className="font-mono text-xs text-electric-700">{r.public_code}</p>
                </div>
                <Badge tone="blue">{pipelineLabel[r.pipeline_status as PipelineStatus]}</Badge>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">{r.is_demo && <Badge tone="purple">Démo</Badge>}{r.review_flag && <Badge tone="amber"><Flag className="size-3" aria-hidden /> À vérifier</Badge>}</div>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                <div className="col-span-2"><dt className="sr-only">Téléphone</dt><dd>{r.phone ? <a href={`tel:${r.phone.replace(/[^+\d]/g, "")}`} className="inline-flex items-center gap-1.5 font-medium text-navy-800 tabular-nums"><Phone className="size-3.5" aria-hidden />{r.phone}</a> : <Badge tone="red">Téléphone manquant</Badge>}</dd></div>
                <div className="col-span-2 min-w-0"><dt className="text-xs text-muted">Domaine</dt><dd className="truncate">{r.domain ?? "—"}</dd></div>
                <div><dt className="text-xs text-muted">Compétences évaluées</dt><dd className="tabular-nums">{r.evaluatedSkills}</dd></div>
                <div><dt className="text-xs text-muted">Complétion</dt><dd className="tabular-nums">{r.completion} %</dd></div>
                <div><dt className="text-xs text-muted">Disponibilité</dt><dd>{availabilityLabel[r.availability as Availability]}</dd></div>
                <div><dt className="text-xs text-muted">Dernière activité</dt><dd>{formatDate(r.last_activity_at)}</dd></div>
              </dl>
            </Card>
          </li>
        ))}
        {rows.length === 0 && <li className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">Aucun candidat ne correspond à ces critères.</li>}
      </ul>

      <Card className="hidden md:block">
        <Table className="min-w-[1100px]">
          <thead>
            <tr><Th>Identifiant</Th><Th>Candidat</Th><Th>Téléphone</Th><Th>Formation</Th><Th>Domaine</Th><Th>Compétences évaluées</Th><Th>Projets</Th><Th>Complétion</Th><Th>Dernière activité</Th><Th>Disponibilité</Th><Th>Métier recommandé</Th><Th>Statut</Th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <Td className="font-mono text-xs"><Link href={`/admin/talents/${r.id}`} className="text-electric-700 hover:underline">{r.public_code}</Link></Td>
                <Td>
                  <IntentLink href={`/admin/talents/${r.id}`} className="font-medium text-navy-900 hover:underline">{r.name}</IntentLink>
                  <div className="flex gap-1">{r.is_demo && <Badge tone="purple">Démo</Badge>}{r.review_flag && <Badge tone="amber"><Flag className="size-3" aria-hidden /> À vérifier</Badge>}</div>
                  <span className="text-xs text-muted">{r.city}</span>
                </Td>
                <Td className="whitespace-nowrap">{r.phone ? <a href={`tel:${r.phone.replace(/[^+\d]/g, "")}`} className="font-medium text-navy-800 tabular-nums hover:underline">{r.phone}</a> : <Badge tone="red">Manquant</Badge>}</Td>
                <Td className="max-w-[160px] truncate" title={r.yen_program ?? undefined}>{r.yen_program ?? "—"}<div className="text-xs text-muted">{r.graduation_year ?? ""}</div></Td>
                <Td className="max-w-[160px] truncate" title={r.domain ?? undefined}>{r.domain ?? "—"}</Td>
                <Td className="text-center tabular-nums">{r.evaluatedSkills}</Td>
                <Td className="text-center tabular-nums">{r.projects}</Td>
                <Td className="tabular-nums">{r.completion} %</Td>
                <Td>{formatDate(r.last_activity_at)}</Td>
                <Td>{availabilityLabel[r.availability as Availability]}</Td>
                <Td className="max-w-[180px]">{r.bestOccupation ? <span className="text-xs">{r.bestOccupation.title} <strong className="tabular-nums">({r.bestOccupation.score})</strong></span> : "—"}</Td>
                <Td><Badge tone="blue">{pipelineLabel[r.pipeline_status as PipelineStatus]}</Badge></Td>
              </tr>
            ))}
            {rows.length === 0 && <TableEmpty colSpan={12}>Aucun candidat ne correspond à ces critères.</TableEmpty>}
          </tbody>
        </Table>
      </Card>
      <Pagination page={filters.page} pageSize={filters.pageSize} total={total} hrefFor={hrefFor} />
      <p className="text-xs text-muted">La compatibilité avec une offre précise se consulte depuis la fiche de l&apos;offre (classement intelligent).</p>
    </div>
  );
}
