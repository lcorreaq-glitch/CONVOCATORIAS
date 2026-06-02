import React from "react";

export default function PageHeader({ eyebrow, title, subtitle, actions }) {
  return (
    <div className="flex items-start justify-between gap-6 mb-8 pb-6 border-b border-border">
      <div>
        {eyebrow && (
          <div className="text-[11px] uppercase tracking-[0.18em] font-display font-bold text-emerald-700 mb-1.5">
            {eyebrow}
          </div>
        )}
        <h1 className="font-display font-black text-3xl lg:text-4xl tracking-tight">{title}</h1>
        {subtitle && <p className="text-muted-foreground text-sm mt-2 max-w-2xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function Badge({ children, tone = "default" }) {
  const map = {
    default: "bg-secondary text-foreground border-border",
    success: "bg-emerald-50 text-emerald-700 border-emerald-200",
    warning: "bg-amber-50 text-amber-700 border-amber-200",
    info: "bg-blue-50 text-blue-700 border-blue-200",
    danger: "bg-red-50 text-red-700 border-red-200",
    muted: "bg-zinc-100 text-zinc-600 border-zinc-200",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-sm text-[11px] font-semibold border ${map[tone]}`}>
      {children}
    </span>
  );
}

export function estadoTone(e) {
  if (!e) return "default";
  const s = e.toLowerCase();
  if (s.includes("habilitada") && !s.includes("no")) return "success";
  if (s.includes("ganador") || s.includes("firmada") || s.includes("cerrada") || s.includes("finalizada")) return "success";
  if (s.includes("no habilitada") || s.includes("anulada") || s.includes("rechaz")) return "danger";
  if (s.includes("pendiente") || s.includes("borrador") || s.includes("subsan")) return "warning";
  if (s.includes("activa") || s.includes("en edición") || s.includes("en evaluación") || s.includes("abierta")) return "info";
  return "default";
}

export function EmptyState({ title, hint, icon: Icon }) {
  return (
    <div className="border border-dashed border-border rounded-sm bg-white py-16 px-6 text-center">
      {Icon && <Icon className="w-8 h-8 mx-auto text-muted-foreground stroke-[1.5] mb-3" />}
      <div className="font-display font-bold text-lg">{title}</div>
      {hint && <p className="text-sm text-muted-foreground mt-1.5 max-w-md mx-auto">{hint}</p>}
    </div>
  );
}
