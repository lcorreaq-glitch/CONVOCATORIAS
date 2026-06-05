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
  const [actasInfo, setActasInfo] = useState(null);

  useEffect(() => {
    if (user?.role !== "jurado" || !convocatoriaId) return;
    api.get(`/dashboards/mi-timeline?convocatoria_id=${convocatoriaId}`)
      .then((r) => setData(r.data))
      .catch(() => setData(null));
    // Cargar info de actas para detectar firma pendiente/re-firma
    api.get(`/actas?convocatoria_id=${convocatoriaId}`)
      .then((r) => setActasInfo(r.data))
      .catch(() => setActasInfo(null));
  }, [user, convocatoriaId]);

  if (user?.role !== "jurado" || !data || !data.phases?.length) return null;

  // Banner CTA de firma: detecta acta del jurado actual
  const miActa = actasInfo?.individual?.find((r) => r.jurado_id === user?.jurado_id);
  const necesitaFirma = miActa && (
    (miActa.finalizadas === miActa.total && miActa.total > 0 && !miActa.firma_acta_at) ||
    miActa.estado === "Re-firma pendiente" ||
    miActa.acta_invalidada
  );
  const esRefirma = miActa && (miActa.estado === "Re-firma pendiente" || miActa.acta_invalidada);

  const goAction = (extra) => {
    if (extra?.action === "mi_perfil") navigate("/mi-perfil");
    if (extra?.action === "actas") navigate("/actas");
  };

  return (
    <>
      {necesitaFirma && (
        <div className={`rounded-xl border-2 p-4 mb-4 flex items-start gap-3 ${esRefirma ? "border-amber-300 bg-amber-50" : "border-emerald-300 bg-emerald-50"}`}
             data-testid="jurado-firma-banner">
          <div className={`shrink-0 w-10 h-10 rounded-full grid place-items-center ${esRefirma ? "bg-amber-200 text-amber-800" : "bg-emerald-200 text-emerald-800"}`}>
            {esRefirma ? <Clock className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
          </div>
          <div className="flex-1">
            <div className={`font-display font-bold text-[14px] ${esRefirma ? "text-amber-900" : "text-emerald-900"}`}>
              {esRefirma
                ? "Tu acta requiere re-firma"
                : "¡Felicitaciones! Has finalizado todas tus evaluaciones"}
            </div>
            <p className={`text-[12.5px] mt-0.5 ${esRefirma ? "text-amber-800" : "text-emerald-800"}`}>
              {esRefirma
                ? "Has reabierto evaluaciones después de haber firmado. Por favor vuelve a firmar tu acta para que refleje los puntajes actualizados."
                : `Firma tu acta consolidada (${miActa.finalizadas} de ${miActa.total} evaluaciones) para completar el proceso institucional.`}
            </p>
          </div>
          <button
            onClick={() => navigate("/actas")}
            data-testid="jurado-firma-cta"
            className={`shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-md font-display font-bold text-[12.5px] transition-colors text-white ${esRefirma ? "bg-amber-600 hover:bg-amber-700" : "bg-[#14776A] hover:bg-[#0F5E54]"}`}
          >
            {esRefirma ? "Re-firmar ahora" : "Firmar mi acta"} <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
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
    </>
  );
}
