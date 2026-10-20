import { Download } from "lucide-react";
import { Badge, ButtonLink, Card, CardBody, CardHeader } from "@/components/ui";
import { availabilityLabel, levelLabel, opportunityLabel, type Availability, type OpportunityType } from "@/lib/labels";
import { formatDate } from "@/lib/utils";
import type { PartnerCandidateView } from "@/features/partners/queries";

/** Profil professionnel restreint présenté aux partenaires (sans coordonnées personnelles). */
export function PartnerCandidateCard({ v }: { v: PartnerCandidateView }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={`${v.name} · ${v.public_code}`}
          description={[v.headline, v.domain, v.city].filter(Boolean).join(" · ")}
          action={v.canDownloadCv ? <ButtonLink href={`/api/partenaire/candidats/${v.id}/cv`} variant="outline" size="sm" prefetch={false}><Download className="size-4" aria-hidden /> CV</ButtonLink> : <span className="text-xs text-muted">{v.hasCv ? "CV non partagé" : "Pas de CV"}</span>}
        />
        <CardBody className="space-y-3 text-sm">
          {v.summary && <p className="whitespace-pre-line text-slate-700">{v.summary}</p>}
          <p className="text-xs text-muted">Formation YEN : {v.yen_program ?? "—"} · Niveau : {v.education_level ?? "—"} · Disponibilité : {availabilityLabel[v.availability as Availability]} · Recherche : {v.opportunity_types.map((o) => opportunityLabel[o as OpportunityType]).join(", ") || "—"}</p>
          <p className="text-xs text-muted">Pour contacter le candidat, passez par l&apos;équipe YEN ou programmez un entretien depuis la candidature.</p>
        </CardBody>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Compétences démontrées" description="Validées par YEN (évaluations, projets vérifiés, évaluateurs)" />
          <CardBody className="space-y-1.5">
            {v.demonstrated.length === 0 && <p className="text-sm text-muted">Aucune compétence démontrée à ce jour.</p>}
            {v.demonstrated.map((d) => <p key={d.skill} className="text-sm"><Badge tone="gold">{levelLabel[d.level]}</Badge> {d.skill} <span className="text-xs text-muted">— {d.sources.join(" · ")}</span></p>)}
            {v.declared.length > 0 && <p className="pt-2 text-xs text-muted">Déclarées, non encore démontrées : {v.declared.map((d) => d.skill).join(", ")}</p>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Résultats d'évaluation" />
          <CardBody className="space-y-1 text-sm">
            {v.results.length === 0 && <p className="text-muted">Aucun résultat.</p>}
            {v.results.map((r, i) => <p key={i}>{r.title} : <strong className="tabular-nums">{r.score != null ? `${Math.round(r.score)} %` : "—"}</strong>{r.passed ? " ✓" : ""} <span className="text-xs text-muted">({formatDate(r.date)})</span></p>)}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Projets" />
          <CardBody className="space-y-2 text-sm">
            {v.projects.length === 0 && <p className="text-muted">Aucun projet.</p>}
            {v.projects.map((p, i) => <div key={i}><p className="font-medium text-navy-900">{p.title} {p.verified && <Badge tone="green">Vérifié par YEN</Badge>}</p><p className="text-slate-600">{p.description}</p>{p.technologies.length > 0 && <p className="text-xs text-muted">{p.technologies.join(", ")}</p>}</div>)}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Parcours" />
          <CardBody className="space-y-2 text-sm">
            {v.experiences.map((e, i) => <p key={i}><strong>{e.title}</strong> — {e.organization} <span className="text-xs text-muted">({formatDate(e.start_date)} → {e.is_current ? "aujourd'hui" : formatDate(e.end_date)})</span></p>)}
            {v.education.map((e, i) => <p key={`e${i}`}>{e.degree} — {e.institution} {e.end_year && <span className="text-xs text-muted">({e.end_year})</span>}</p>)}
            {v.certifications.map((c, i) => <p key={`c${i}`}>Certification : {c.name} — {c.issuer} {c.verified && <Badge tone="green">Vérifiée</Badge>}</p>)}
            {v.languages.length > 0 && <p className="text-xs text-muted">Langues : {v.languages.map((l) => `${l.language} (${l.proficiency})`).join(", ")}</p>}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
