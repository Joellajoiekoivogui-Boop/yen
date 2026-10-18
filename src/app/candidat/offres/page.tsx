import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase, MapPin } from "lucide-react";
import { Badge, Card, EmptyState, PageHeader, Pagination, ScorePill } from "@/components/ui";
import { requireCandidate } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { opportunityLabel, OPPORTUNITY_TYPES, type OpportunityType } from "@/lib/labels";
import { clampInt, formatDate, param } from "@/lib/utils";
import { computeMatch } from "@/features/matching/engine";
import { loadEvidence, loadOfferTargets } from "@/features/matching/loader";
import { loadOfferOrganizations } from "@/features/offers/organizations";

export const metadata: Metadata = { title: "Offres d'emploi et de stage" };
const PAGE_SIZE = 12;

export default async function OffersPage(props: PageProps<"/candidat/offres">) {
  const sp = await props.searchParams;
  const ctx = await requireCandidate();
  const supabase = await createClient();
  const type = param(sp.type);
  const domain = param(sp.domaine);
  const qText = param(sp.q)?.trim().slice(0, 100);
  const page = clampInt(param(sp.page), 1, 1, 1000);
  const today = new Date().toISOString().slice(0, 10);

  let q = supabase
    .from("job_offers")
    .select("id, title, offer_type, location, deadline, published_at, positions, is_demo, organization_id, engineering_domains(name)", { count: "exact" })
    .eq("status", "publiee")
    .or(`deadline.is.null,deadline.gte.${today}`)
    .order("published_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (type && OPPORTUNITY_TYPES.includes(type as OpportunityType)) q = q.eq("offer_type", type);
  if (domain) q = q.eq("domain_id", domain);
  if (qText) q = q.ilike("title", `%${qText.replace(/[%_]/g, "")}%`);

  const [{ data: offers, count }, domains, myApps, cand] = await Promise.all([
    q,
    supabase.from("engineering_domains").select("id, name").eq("is_active", true).order("position"),
    supabase.from("applications").select("offer_id").eq("candidate_id", ctx.candidateId),
    supabase.from("candidate_profiles").select("primary_domain_id").eq("id", ctx.candidateId).single(),
  ]);
  const applied = new Set((myApps.data ?? []).map((a) => a.offer_id));
  const evidence = await loadEvidence(supabase, ctx.candidateId, cand.data?.primary_domain_id ?? null);
  const targets = await loadOfferTargets(supabase, (offers ?? []).map((o) => o.id));
  const orgs = await loadOfferOrganizations(supabase, (offers ?? []).map((o) => o.organization_id));
  const scores = new Map(targets.map((t) => [t.id, evidence ? computeMatch(t, evidence) : null]));
  const qs = (p: number) => `?${new URLSearchParams({ ...(type ? { type } : {}), ...(domain ? { domaine: domain } : {}), ...(qText ? { q: qText } : {}), page: String(p) })}`;

  return (
    <div className="space-y-6">
      <PageHeader title="Offres d'emploi et de stage" description="Offres validées par YEN. Le score indique une compatibilité estimée, pas une probabilité d'embauche." />
      <form method="get" className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1">
          <label htmlFor="q" className="mb-1 block text-xs font-medium text-muted">Recherche</label>
          <input id="q" name="q" defaultValue={qText} className="field-input" placeholder="Intitulé…" />
        </div>
        <div>
          <label htmlFor="type" className="mb-1 block text-xs font-medium text-muted">Type</label>
          <select id="type" name="type" defaultValue={type ?? ""} className="field-input">
            <option value="">Tous</option>
            {OPPORTUNITY_TYPES.map((t) => <option key={t} value={t}>{opportunityLabel[t]}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="domaine" className="mb-1 block text-xs font-medium text-muted">Domaine</label>
          <select id="domaine" name="domaine" defaultValue={domain ?? ""} className="field-input max-w-64">
            <option value="">Tous</option>
            {(domains.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <button className="h-10 rounded-lg bg-navy-800 px-4 text-sm font-medium text-white hover:bg-navy-700">Filtrer</button>
      </form>

      {(offers ?? []).length === 0 ? (
        <EmptyState icon={Briefcase} title="Aucune offre ne correspond" description="Les nouvelles offres pertinentes vous seront notifiées." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(offers ?? []).map((o) => {
            const m = scores.get(o.id);
            return (
              <Link key={o.id} href={`/candidat/offres/${o.id}`}>
                <Card className="h-full p-5 transition hover:border-electric-300 hover:shadow-md">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap gap-1.5">
                      <Badge tone="blue">{opportunityLabel[o.offer_type as OpportunityType]}</Badge>
                      {applied.has(o.id) && <Badge tone="teal">Candidature envoyée</Badge>}
                      {o.is_demo && <Badge tone="purple">Démo · fictif</Badge>}
                    </div>
                    {m && <ScorePill score={m.score} />}
                  </div>
                  <h2 className="mt-3 font-semibold text-navy-900">{o.title}</h2>
                  <p className="text-sm text-slate-600">{orgs.get(o.organization_id)?.name}</p>
                  <p className="mt-2 flex items-center gap-1 text-xs text-muted"><MapPin className="size-3" aria-hidden /> {o.location} · {(o.engineering_domains as unknown as { name: string } | null)?.name ?? "Tous domaines"}</p>
                  <p className="mt-1 text-xs text-muted">Date limite : {o.deadline ? formatDate(o.deadline) : "non précisée"}</p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
      <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} hrefFor={qs} />
    </div>
  );
}
