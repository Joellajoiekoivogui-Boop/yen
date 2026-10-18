"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play } from "lucide-react";
import { Alert, Button } from "@/components/ui";
import { startAttemptAction } from "@/features/assessments/actions";

export function StartAttemptButton({ assessmentId }: { assessmentId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <Button
        variant="secondary"
        size="lg"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await startAttemptAction(assessmentId);
            if (r.ok && r.data) router.push(`/candidat/evaluations/tentative/${r.data.attemptId}`);
            else if (!r.ok) setError(r.error);
          })
        }
      >
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Play className="size-4" aria-hidden />} Commencer l&apos;évaluation
      </Button>
    </div>
  );
}
