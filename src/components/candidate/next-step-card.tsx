import { ArrowRight, Clock } from "lucide-react";
import { ButtonLink, Card } from "@/components/ui";
import type { NextStep } from "@/features/candidates/next-step";

/** Une seule action conseillée, avec sa raison et sa durée : le premier bloc du tableau de bord. */
export function NextStepCard({ step }: { step: NextStep }) {
  return (
    <Card className="border-l-4 border-l-gold-400 p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-gold-700 uppercase">Votre prochaine étape</p>
          <h2 className="mt-1 text-lg font-semibold text-balance text-navy-900">{step.title}</h2>
          <p className="mt-1 text-sm text-slate-600">{step.why}</p>
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted">
            <Clock className="size-3.5" aria-hidden /> {step.duration}
          </p>
        </div>
        <ButtonLink href={step.href} variant="secondary" className="shrink-0">
          {step.cta} <ArrowRight className="size-4" aria-hidden />
        </ButtonLink>
      </div>
    </Card>
  );
}
