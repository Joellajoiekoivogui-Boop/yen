"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button } from "@/components/ui";
import { grantRoleAction, revokeRoleAction, setUserActiveAction } from "@/features/admin/actions";
import { roleLabel, type AppRole } from "@/lib/labels";

export function UserRow({ userId, roles, active, canRoles, isSelf, isSuperAdmin }: { userId: string; roles: AppRole[]; active: boolean; canRoles: boolean; isSelf: boolean; isSuperAdmin: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [role, setRole] = useState<AppRole>("insertion_manager");
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) => start(async () => { const r = await fn(); setMsg({ ok: r.ok, text: r.ok ? r.message ?? "OK" : r.error ?? "Erreur" }); if (r.ok) router.refresh(); });
  const grantable = (Object.keys(roleLabel) as AppRole[]).filter((r) => !roles.includes(r) && (r !== "super_admin" || isSuperAdmin) && r !== "candidate");
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {canRoles && roles.map((r) => (
          <Button key={r} size="sm" variant="ghost" disabled={pending || (isSelf && r === "super_admin")} onClick={() => { if (window.confirm(`Retirer le rôle « ${roleLabel[r]} » ?`)) run(() => revokeRoleAction({ userId, role: r })); }}>✕ {roleLabel[r]}</Button>
        ))}
        {canRoles && grantable.length > 0 && (
          <>
            <select className="field-input h-8 w-auto py-0 text-xs" value={role} onChange={(e) => setRole(e.target.value as AppRole)} aria-label="Rôle à attribuer">
              {grantable.map((r) => <option key={r} value={r}>{roleLabel[r]}</option>)}
            </select>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => grantRoleAction({ userId, role }))}>Attribuer</Button>
          </>
        )}
        {!isSelf && (
          active
            ? <Button size="sm" variant="ghost" disabled={pending} onClick={() => { const reason = window.prompt("Motif de la désactivation :"); if (reason) run(() => setUserActiveAction({ userId, active: false, reason })); }}>Désactiver</Button>
            : <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setUserActiveAction({ userId, active: true }))}>Réactiver</Button>
        )}
      </div>
      {msg && <Alert tone={msg.ok ? "success" : "error"} className="py-1.5 text-xs">{msg.text}</Alert>}
    </div>
  );
}
