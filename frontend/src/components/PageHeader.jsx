import React from "react";

export default function PageHeader({ eyebrow, title, subtitle, actions }) {
  return (
    <div className="flex items-start justify-between gap-6 mb-8 pb-6 border-b border-border">
      <div>
        {eyebrow && (
          <div className="text-[11px] uppercase tracking-[0.16em] font-display font-bold text-[#14776A] mb-1.5">
            {eyebrow}
          </div>
        )}
        <h1 className="font-display font-extrabold text-[32px] lg:text-[40px] tracking-tight text-[#1A1F2C] leading-tight">{title}</h1>
        {subtitle && <p className="text-[#5E6878] text-[14px] mt-2.5 max-w-2xl leading-relaxed">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">{actions}</div>}
    </div>
  );
}

export function Badge({ children, tone = "default" }) {
  const map = {
    default: "bg-[#F1F4F7] text-[#3F4856] border-[#E2E7EC]",
    success: "bg-[#F0F7F5] text-[#0F5E54] border-[#CDE7E1]",
    warning: "bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]",
    info: "bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]",
    danger: "bg-[#FEF3F2] text-[#B42318] border-[#FECDCA]",
    muted: "bg-[#F7F9FB] text-[#5E6878] border-[#E2E7EC]",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${map[tone]}`}>
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
    <div className="border border-dashed border-border rounded-xl bg-white py-16 px-6 text-center">
      {Icon && <Icon className="w-9 h-9 mx-auto text-[#9CA3AF] stroke-[1.4] mb-3" />}
      <div className="font-display font-bold text-[16px] text-[#1A1F2C]">{title}</div>
      {hint && <p className="text-[13px] text-[#5E6878] mt-2 max-w-md mx-auto leading-relaxed">{hint}</p>}
    </div>
  );
}
