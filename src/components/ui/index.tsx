import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { CountUp } from "@/components/motion/count-up";

/* ----------------------------------------------------------------------------
 * Boutons
 * ------------------------------------------------------------------------- */
type Variant = "primary" | "secondary" | "accent" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

const variantClass: Record<Variant, string> = {
  primary: "btn-shine bg-navy-800 text-white hover:bg-navy-700 shadow-sm hover:shadow-md hover:shadow-navy-900/20",
  secondary: "btn-shine bg-electric-600 text-white hover:bg-electric-700 shadow-sm hover:shadow-md hover:shadow-electric-600/30",
  accent: "btn-shine bg-gold-400 text-navy-950 hover:bg-gold-300 shadow-sm hover:shadow-md hover:shadow-gold-500/30",
  ghost: "text-navy-700 hover:bg-navy-50",
  danger: "btn-shine bg-red-600 text-white hover:bg-red-700 shadow-sm hover:shadow-md hover:shadow-red-600/30",
  outline: "border border-border bg-white text-navy-800 hover:border-electric-200 hover:bg-navy-50",
};
const sizeClass: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(
    "inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200 ease-out hover:-translate-y-px active:translate-y-0 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 whitespace-nowrap",
    variantClass[variant],
    sizeClass[size],
    className,
  );
}

export function Button({ variant, size, className, type = "button", ...props }: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({ variant, size, className, ...props }: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

/* ----------------------------------------------------------------------------
 * Surfaces
 * ------------------------------------------------------------------------- */
export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div data-reveal="up" className={cn("rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow-card)]", className)} {...props} />;
}

export function CardHeader({ title, description, action, icon: Icon }: { title: ReactNode; description?: ReactNode; action?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <span className="mt-0.5 animate-pop-in rounded-md bg-electric-50 p-1.5 text-electric-600 [animation-delay:250ms]">
            <Icon className="size-4" aria-hidden />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-navy-900">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div data-reveal-children className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-semibold tracking-wide text-gold-600 uppercase">{eyebrow}</div>}
        <h1 className="text-2xl font-bold tracking-tight text-navy-900">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div data-reveal="up" className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Badges
 * ------------------------------------------------------------------------- */
type Tone = "neutral" | "blue" | "gold" | "green" | "amber" | "red" | "navy" | "purple";
const toneClass: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  blue: "bg-electric-50 text-electric-700 ring-electric-200",
  gold: "bg-gold-50 text-gold-700 ring-gold-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  navy: "bg-navy-800 text-white ring-navy-800",
  purple: "bg-violet-50 text-violet-700 ring-violet-200",
};
export function Badge({ tone = "neutral", className, ...props }: ComponentProps<"span"> & { tone?: Tone }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap", toneClass[tone], className)} {...props} />;
}

export function DemoBadge() {
  return <Badge tone="purple" title="Donnée fictive de démonstration">Démo · fictif</Badge>;
}

/* ----------------------------------------------------------------------------
 * Alertes et états
 * ------------------------------------------------------------------------- */
const alertStyles = {
  info: { cls: "border-electric-200 bg-electric-50 text-electric-900", Icon: Info },
  success: { cls: "border-emerald-200 bg-emerald-50 text-emerald-900", Icon: CheckCircle2 },
  warning: { cls: "border-amber-200 bg-amber-50 text-amber-900", Icon: AlertTriangle },
  error: { cls: "border-red-200 bg-red-50 text-red-900", Icon: XCircle },
};
export function Alert({ tone = "info", title, children, className }: { tone?: keyof typeof alertStyles; title?: ReactNode; children?: ReactNode; className?: string }) {
  const { cls, Icon } = alertStyles[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex animate-slide-down gap-3 rounded-lg border px-4 py-3 text-sm", cls, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && "mt-0.5", "leading-relaxed")}>{children}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon = Info, title, description, action }: { icon?: LucideIcon; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-white/60 px-6 py-10 text-center">
      <span className="animate-float rounded-full bg-navy-50 p-3 text-navy-500">
        <Icon className="size-6" aria-hidden />
      </span>
      <p className="mt-3 font-semibold text-navy-900">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Statistiques et progression
 * ------------------------------------------------------------------------- */
export function StatCard({ label, value, hint, icon: Icon, tone = "blue" }: { label: string; value: ReactNode; hint?: ReactNode; icon?: LucideIcon; tone?: "blue" | "gold" | "navy" | "amber" }) {
  const iconTone = { blue: "bg-electric-50 text-electric-600", gold: "bg-gold-50 text-gold-600", navy: "bg-navy-50 text-navy-700", amber: "bg-amber-50 text-amber-700" }[tone];
  return (
    <Card data-spotlight className="group p-4 transition duration-500 ease-out-expo hover:-translate-y-1 hover:shadow-lg hover:shadow-electric-500/10">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted">{label}</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-navy-900 tabular-nums">{typeof value === "number" ? <CountUp value={value} /> : value}</p>
          {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
        </div>
        {Icon && (
          <span className={cn("rounded-lg p-2 transition-transform duration-500 ease-spring group-hover:scale-110 group-hover:-rotate-6", iconTone)}>
            <Icon className="size-5" aria-hidden />
          </span>
        )}
      </div>
    </Card>
  );
}

export function ProgressBar({ value, label, tone = "gold", className }: { value: number; label?: string; tone?: "gold" | "blue" | "navy" | "amber"; className?: string }) {
  const v = Math.max(0, Math.min(100, value));
  const bar = { gold: "bg-gold-400", blue: "bg-electric-500", navy: "bg-navy-700", amber: "bg-amber-500" }[tone];
  return (
    <div className={className}>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={cn("h-full animate-progress-grow rounded-full transition-[width] duration-500", bar)} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

export function ScorePill({ score, confidence }: { score: number; confidence?: "faible" | "moyenne" | "elevee" }) {
  // fond et texte choisis pour un contraste suffisant (texte bleu marine sur le jaune YEN)
  const tone = score >= 75 ? "bg-gold-400 text-navy-950" : score >= 50 ? "bg-electric-600 text-white" : score >= 30 ? "bg-amber-300 text-navy-950" : "bg-slate-500 text-white";
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cn("inline-flex h-7 min-w-11 animate-pop-in items-center justify-center rounded-md px-1.5 text-sm font-bold tabular-nums", tone)}>{score}</span>
      {confidence && <span className="text-xs text-muted">confiance {confidence === "elevee" ? "élevée" : confidence}</span>}
    </span>
  );
}

/* ----------------------------------------------------------------------------
 * Tableaux
 * ------------------------------------------------------------------------- */
export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full min-w-[640px] border-collapse text-left text-sm [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-electric-50/40", className)} {...props} />
    </div>
  );
}
export function Th({ className, ...props }: ComponentProps<"th">) {
  return <th scope="col" className={cn("border-b border-border bg-slate-50/80 px-3 py-2.5 text-xs font-semibold tracking-wide text-slate-600 uppercase", className)} {...props} />;
}
export function Td({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("border-b border-border px-3 py-2.5 align-top text-slate-700", className)} {...props} />;
}

/* ----------------------------------------------------------------------------
 * Navigation par onglets (liens)
 * ------------------------------------------------------------------------- */
export function TabLinks({ tabs, active }: { tabs: { key: string; label: string; href: string }[]; active: string }) {
  return (
    <nav className="-mx-1 mb-5 flex gap-1 overflow-x-auto border-b border-border" aria-label="Sections">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === active ? "page" : undefined}
          className={cn(
            "mx-1 border-b-2 px-2 py-2.5 text-sm font-medium whitespace-nowrap transition-all duration-300",
            t.key === active ? "border-electric-600 text-electric-700" : "border-transparent text-slate-500 hover:border-electric-200 hover:text-navy-800",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export function Pagination({ page, pageSize, total, hrefFor }: { page: number; pageSize: number; total: number; hrefFor: (p: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return <p className="mt-3 text-xs text-muted">{total} résultat(s)</p>;
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
      <p className="text-xs text-muted">
        {total} résultat(s) · page {page} sur {pages}
      </p>
      <div className="flex gap-2">
        {page > 1 ? <ButtonLink variant="outline" size="sm" href={hrefFor(page - 1)}>Précédent</ButtonLink> : <Button variant="outline" size="sm" disabled>Précédent</Button>}
        {page < pages ? <ButtonLink variant="outline" size="sm" href={hrefFor(page + 1)}>Suivant</ButtonLink> : <Button variant="outline" size="sm" disabled>Suivant</Button>}
      </div>
    </div>
  );
}

export function DefinitionList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-xs font-medium text-muted">{i.label}</dt>
          <dd className="mt-0.5 text-sm break-words text-navy-900">{i.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ----------------------------------------------------------------------------
 * Chargement
 * ------------------------------------------------------------------------- */
export function PageSkeleton() {
  return (
    <div aria-busy="true" className="animate-fade-in">
      <p className="sr-only" role="status">Chargement…</p>
      <div className="skeleton h-3 w-24 rounded" />
      <div className="skeleton mt-3 h-7 w-72 max-w-full rounded-lg" />
      <div className="skeleton mt-3 h-4 w-96 max-w-full rounded" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-24 rounded-[var(--radius-card)]" style={{ animationDelay: `${i * 120}ms` }} />
        ))}
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="skeleton h-64 rounded-[var(--radius-card)] lg:col-span-2" />
        <div className="skeleton h-64 rounded-[var(--radius-card)] [animation-delay:200ms]" />
      </div>
    </div>
  );
}
