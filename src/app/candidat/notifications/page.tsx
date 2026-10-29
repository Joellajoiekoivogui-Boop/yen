import type { Metadata } from "next";
import Link from "next/link";
import { Bell } from "lucide-react";
import { ActionButton } from "@/components/forms/action-button";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, safeInternalPath } from "@/lib/utils";
import { markNotificationsReadAction } from "@/features/candidates/actions";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const ctx = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase.from("notifications").select("id, category, title, body, link, read_at, created_at").eq("user_id", ctx.userId).order("created_at", { ascending: false }).limit(100);
  const unread = (data ?? []).filter((n) => !n.read_at).length;
  return (
    <div className="space-y-6">
      <PageHeader title="Notifications" description="Centre de notifications interne." actions={unread > 0 ? <ActionButton action={markNotificationsReadAction.bind(null, undefined)}>Tout marquer comme lu</ActionButton> : undefined} />
      {(data ?? []).length === 0 ? <EmptyState icon={Bell} title="Aucune notification" description="Vous serez prévenu ici des réponses à vos candidatures, des résultats de vos entretiens et des messages de l'équipe YEN." /> : (
        <Card className="divide-y divide-border">
          {(data ?? []).map((n) => (
            <div key={n.id} className={`flex items-start gap-3 px-5 py-4 ${n.read_at ? "" : "bg-electric-50/40"}`}>
              <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.read_at ? "bg-transparent" : "bg-electric-600"}`} aria-label={n.read_at ? "Lue" : "Non lue"} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-navy-900">{safeInternalPath(n.link) ? <Link href={safeInternalPath(n.link)!} className="hover:underline">{n.title}</Link> : n.title}</p>
                  <Badge>{n.category}</Badge>
                </div>
                {n.body && <p className="mt-0.5 text-sm text-slate-600">{n.body}</p>}
                <p className="mt-1 text-xs text-muted">{formatDateTime(n.created_at)}</p>
              </div>
              {!n.read_at && <ActionButton variant="ghost" action={markNotificationsReadAction.bind(null, [n.id])}>Marquer lue</ActionButton>}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
