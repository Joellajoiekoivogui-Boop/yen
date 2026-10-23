import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Download } from "lucide-react";
import { SimpleBarChart } from "@/components/charts";
import { Alert, Button, ButtonLink, Card, CardBody, CardHeader, PageHeader, StatCard } from "@/components/ui";
import { requireStaff } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatPercent, param } from "@/lib/utils";
import type { InsertionReport } from "@/features/reporting/export";

export const metadata: Metadata = { title: "Rapports d'insertion" };

function periodFor(kind: string, ref: string | undefined): { start: string; end: string; label: string } {
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const y = Number(ref?.slice(0, 4)) || today.getFullYear();
  if (kind === "annuel") return { start: `${y}-01-01`, end: `${y}-12-31`, label: `Année ${y}` };
  if (kind === "trimestriel") {
    const q = ref && /^\d{4}-T[1-4]$/.test(ref) ? Number(ref.slice(6)) : Math.floor(today.getMonth() / 3) + 1;
    const s = new Date(Date.UTC(y, (q - 1) * 3, 1));
    const e = new Date(Date.UTC(y, q * 3, 0));
    return { start: iso(s), end: iso(e), label: `T${q} ${y}` };
  }
  const m = ref && /^\d{4}-\d{2}$/.test(ref) ? Number(ref.slice(5)) - 1 : today.getMonth();
  return { start: iso(new Date(Date.UTC(y, m, 1))), end: iso(new Date(Date.UTC(y, m + 1, 0))), label: new Date(Date.UTC(y, m, 1)).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }) };
}

export default async function ReportsPage(props: PageProps<"/admin/rapports">) {
  const sp = await props.searchParams;
  const ctx = await requireStaff("reports.view");
  const kind = ["mensuel", "trimestriel", "annuel", "personnalise"].includes(param(sp.periode) ?? "") ? param(sp.periode)! : "trimestriel";
  const custom = kind === "personnalise" && /^\d{4}-\d{2}-\d{2}$/.test(param(sp.debut) ?? "") && /^\d{4}-\d{2}-\d{2}$/.test(param(sp.fin) ?? "");
  const p = custom ? { start: param(sp.debut)!, end: param(sp.fin)!, label: "Période personnalisée" } : periodFor(kind === "personnalise" ? "trimestriel" : kind, param(sp.ref));
  const includeDemo = param(sp.demo) === "1";
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("insertion_report", { p_start: p.start, p_end: p.end, p_include_demo: includeDemo });
  const r = data as InsertionReport | null;
  const qs = new URLSearchParams({ debut: p.start, fin: p.end, ...(includeDemo ? { demo: "1" } : {}) });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rapports d'insertion professionnelle"
        description={`${p.label} : du ${p.start} au ${p.end}`}
        actions={ctx.permissions.has("reports.export") ? (
          <>
            <ButtonLink href={`/api/admin/export/insertion?${qs}&format=csv`} variant="outline" prefetch={false}><Download className="size-4" aria-hidden /> CSV</ButtonLink>
            <ButtonLink href={`/api/admin/export/insertion?${qs}&format=pdf`} variant="outline" prefetch={false}><Download className="size-4" aria-hidden /> PDF</ButtonLink>
          </>
        ) : undefined}
      />
      <Card className="p-4">
        <Form action="/admin/rapports" className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="periode" className="mb-1 block text-xs font-medium text-muted">Période</label>
            <select id="periode" name="periode" defaultValue={kind} className="field-input">
              <option value="mensuel">Mensuelle</option><option value="trimestriel">Trimestrielle</option><option value="annuel">Annuelle</option><option value="personnalise">Personnalisée</option>
            </select>
          </div>
          <div><label htmlFor="ref" className="mb-1 block text-xs font-medium text-muted">Référence (AAAA-MM, AAAA-T1…T4 ou AAAA)</label><input id="ref" name="ref" defaultValue={param(sp.ref)} className="field-input" placeholder="2026-T3" /></div>
          <div><label htmlFor="debut" className="mb-1 block text-xs font-medium text-muted">Début (personnalisée)</label><input id="debut" name="debut" type="date" defaultValue={param(sp.debut)} className="field-input" /></div>
          <div><label htmlFor="fin" className="mb-1 block text-xs font-medium text-muted">Fin (personnalisée)</label><input id="fin" name="fin" type="date" defaultValue={param(sp.fin)} className="field-input" /></div>
          <label className="flex h-10 items-center gap-1.5 text-sm"><input type="checkbox" name="demo" value="1" defaultChecked={includeDemo} className="accent-electric-600" /> Inclure la démo</label>
          <Button type="submit">Afficher</Button>
        </Form>
      </Card>
      {error || !r ? <Alert tone="error">Le rapport n&apos;a pas pu être calculé.</Alert> : (
        <>
          {r.demo_data_included && <Alert tone="warning">Ce rapport inclut des données de démonstration fictives.</Alert>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Taux d'insertion" value={r.insertion_rate == null ? "—" : formatPercent(r.insertion_rate, 1)} hint={`${r.placed_confirmed} / ${r.denominator} candidats`} />
            <StatCard label="Stages confirmés" value={r.internships_confirmed} tone="gold" />
            <StatCard label="Emplois confirmés" value={r.jobs_confirmed} tone="gold" />
            <StatCard label="Déclarés non confirmés" value={r.placements_declared_unconfirmed} hint="Exclus du taux" tone="amber" />
          </div>
          <Alert tone="info" title="Méthode de calcul">
            Numérateur : candidats du dénominateur ayant au moins un placement <strong>confirmé</strong> débutant dans la période. Dénominateur : {r.denominator_definition}. Les candidatures en cours ({r.applications_in_progress}) et les placements non confirmés ne sont pas comptés comme insertions.
          </Alert>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card><CardHeader title="Placements confirmés par mois" /><CardBody>{r.by_month.length ? <SimpleBarChart data={r.by_month} xKey="month" series={[{ key: "stages", label: "Stages" }, { key: "emplois", label: "Emplois" }]} label="Placements confirmés par mois" /> : <p className="text-sm text-muted">Aucun placement confirmé sur la période.</p>}</CardBody></Card>
            <Card><CardHeader title="Candidats placés par domaine" /><CardBody>{r.by_domain.length ? <SimpleBarChart data={r.by_domain} xKey="domain" series={[{ key: "placed", label: "Candidats placés" }]} label="Candidats placés par domaine" layout="vertical" height={Math.max(160, r.by_domain.length * 36)} /> : <p className="text-sm text-muted">—</p>}</CardBody></Card>
          </div>
          <p className="text-xs text-muted">Voir aussi la <Link href="/admin" className="underline">vue générale</Link>.</p>
        </>
      )}
    </div>
  );
}
