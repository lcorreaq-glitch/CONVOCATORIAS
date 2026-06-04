import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Circle, Clock, ArrowRight, ClipboardList, PenLine, FileSignature, Target } from "lucide-react";

const PHASE_ICONS = {
  asignacion: ClipboardList,
  evaluacion: Target,
  finalizacion: CheckCircle2,
  firma: PenLine,
};

const STATUS_STYLES = {
  completed: {
    ring: "border-[#14776A] bg-[#14776A] text-white",
    dot: "bg-[#14776A]",
    text: "text-[#0F5E54]",
    line: "bg-[#14776A]",
  },
  in_progress: {
    ring: "border-[#14776A] bg-white text-[#14776A] ring-4 ring-[#CDE7E1] animate-pulse",
    dot: "bg-[#14776A]",
    text: "text-[#0F5E54]",
    line: "bg-gradient-to-r from-[#14776A] to-[#E2E7EC]",
  },
  pending: {
    ring: "border-[#E2E7EC] bg-white text-[#94A3B8]",
    dot: "bg-[#E2E7EC]",
    text: "text-[#5E6878]",
    line: "bg-[#E2E7EC]",
  },
};

export default function JuradoTimeline({ convocatoriaId }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);

  useEffect(() => {
    if (user?.role !== "jurado" || !convocatoriaId) return;
    api.get(`/dashboards/mi-timeline?convocatoria_id=${convocatoriaId}`)
      .then((r) => setData(r.data))
      .catch(() => setData(null));
  }, [user, convocatoriaId]);

  if (user?.role !== "jurado" || !data || !data.phases?.length) return null;

  const goAction = (extra) => {
    if (extra?.action === "mi_perfil") navigate("/mi-perfil");
    if (extra?.action === "actas") navigate("/actas");
  };

  return (
    <div className="rounded-xl border border-border bg-white p-5 mb-6" data-testid="jurado-timeline">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="font-display font-bold text-[15px] text-[#1A1F2C]">Tu progreso en la convocatoria</h3>
          <p className="text-[12.5px] text-[#5E6878] mt-0.5">
            {data.summary?.porcentaje_global ?? 0}% completado · {data.summary?.finalizadas ?? 0} de {data.summary?.total_asignadas ?? 0} evaluaciones finalizadas
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <div className="w-32 h-2 bg-[#F1F4F7] rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-[#14776A] to-[#1E6091] transition-all duration-500"
                 style={{ width: `${data.summary?.porcentaje_global ?? 0}%` }} />
          </div>
          <span className="text-[12px] font-mono font-bold text-[#0F5E54]">{data.summary?.porcentaje_global ?? 0}%</span>
        </div>
      </div>

      <div className="relative flex items-start justify-between gap-2">
        {data.phases.map((p, idx) => {
          const Icon = PHASE_ICONS[p.key] || Circle;
          const style = STATUS_STYLES[p.status] || STATUS_STYLES.pending;
          const isLast = idx === data.phases.length - 1;
          const isActionable = (p.status === "in_progress" || p.status === "pending") && p.extra?.action;
          return (
            <React.Fragment key={p.key}>
              <div className="flex-1 flex flex-col items-center text-center min-w-0">
                <div className={`w-12 h-12 rounded-full grid place-items-center border-2 ${style.ring} transition-all`}
                     data-testid={`timeline-phase-${p.key}`}
                     data-status={p.status}>
                  {p.status === "completed" ? <CheckCircle2 className="w-5 h-5" /> :
                   p.status === "in_progress" ? <Clock className="w-5 h-5" /> :
                   <Icon className="w-5 h-5" />}
                </div>
                <div className={`mt-2 text-[12px] font-display font-bold ${style.text}`}>
                  {p.label}
                </div>
                {p.counter && p.counter.total > 0 && (
                  <div className="text-[10.5px] font-mono text-[#5E6878] mt-0.5">
                    {p.counter.current}/{p.counter.total}
                  </div>
                )}
                <div className="text-[11px] text-[#5E6878] mt-1 leading-snug px-1 max-w-[180px]">
                  {p.description}
                </div>
                {isActionable && (
                  <button
                    onClick={() => goAction(p.extra)}
                    data-testid={`timeline-action-${p.key}`}
                    className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-[#14776A] hover:text-[#0F5E54] hover:underline"
                  >
                    Ir <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>
              {!isLast && (
                <div className="flex-1 max-w-[60px] h-0.5 mt-6 -mx-1" >
                  <div className={`h-full ${style.line}`} />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {data.summary?.acta_firmada && (
        <div className="mt-5 bg-emerald-50 border-l-4 border-emerald-500 text-emerald-900 rounded-r-md p-3 flex items-center gap-2 text-[12.5px]">
          <FileSignature className="w-4 h-4 shrink-0" />
          <span>¡Felicitaciones! Cerraste tu ciclo de evaluación con la firma del acta.</span>
        </div>
      )}
    </div>
  );
}
