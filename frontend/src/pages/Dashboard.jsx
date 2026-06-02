import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { TID } from "@/constants/testIds";
import {
  FileStack, Users, ClipboardCheck, ClipboardList, UsersRound,
  CheckCircle2, AlertCircle, TrendingUp, MapPin,
} from "lucide-react";

function Metric({ label, value, icon: Icon, tone = "default", tid, sub }) {
  const toneCls =
    tone === "primary" ? "bg-[#F0F7F5] border-[#CDE7E1]"
    : tone === "warning" ? "bg-[#FFFBEB] border-[#FDE68A]"
    : "bg-white border-[#E2E7EC]";
  const iconCls =
    tone === "primary" ? "text-[#14776A]"
    : tone === "warning" ? "text-[#B45309]"
    : "text-[#5E6878]";
  return (
    <div data-testid={tid} className={`border rounded-xl p-5 shadow-card transition-shadow hover:shadow-md ${toneCls}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10.5px] uppercase tracking-[0.14em] font-display font-bold text-[#5E6878]">
            {label}
          </div>
          <div className="font-display font-extrabold text-[36px] tracking-tight mt-2 tabular-nums text-[#1A1F2C] leading-none">
            {value ?? "—"}
          </div>
          {sub && <div className="text-xs text-[#5E6878] mt-2">{sub}</div>}
        </div>
        <Icon className={`w-5 h-5 stroke-[1.6] mt-1 ${iconCls}`} />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { activeConvocatoriaId } = useAuth();
  const [data, setData] = useState(null);
  const [conv, setConv] = useState(null);

  useEffect(() => {
    if (!activeConvocatoriaId) return;
    api.get(`/dashboard?convocatoria_id=${activeConvocatoriaId}`).then((r) => setData(r.data));
    api.get(`/convocatorias/${activeConvocatoriaId}`).then((r) => setConv(r.data));
  }, [activeConvocatoriaId]);

  if (!activeConvocatoriaId) {
    return (
      <div data-testid={TID.dashboardRoot} className="p-10">
        <p className="text-muted-foreground">Selecciona una convocatoria en el panel lateral.</p>
      </div>
    );
  }

  return (
    <div data-testid={TID.dashboardRoot} className="flex-1 p-8 lg:p-10 max-w-[1480px]">
      {/* Header */}
      <div className="flex items-start justify-between gap-6 mb-10 pb-6 border-b border-border">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] font-display font-bold text-[#14776A] mb-1.5">
            Tablero principal
          </div>
          <h1 className="font-display font-extrabold text-[36px] lg:text-[44px] tracking-tight text-[#1A1F2C] leading-tight">
            {conv?.nombre || "Dashboard"}
          </h1>
          <div className="flex items-center gap-2.5 text-[13px] text-[#5E6878] mt-2.5 flex-wrap">
            <span className="font-mono text-xs px-2 py-0.5 bg-[#F1F4F7] rounded text-[#3F4856]">{conv?.codigo}</span>
            <span>Vigencia {conv?.vigencia}</span>
            <span className="w-1 h-1 rounded-full bg-[#CBD2DA]" />
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#F0F7F5] text-[#0F5E54] border border-[#CDE7E1] text-[11.5px] font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-[#14776A]" />
              {conv?.estado}
            </span>
            {conv?.etapa_actual && (
              <>
                <span className="w-1 h-1 rounded-full bg-[#CBD2DA]" />
                <span>Etapa <strong className="text-[#1A1F2C] font-semibold">{conv.etapa_actual}</strong></span>
              </>
            )}
          </div>
        </div>
        <div className="text-right text-xs text-[#5E6878]">
          <div>{new Date().toLocaleDateString("es-CO", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</div>
        </div>
      </div>

      {/* Top metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <Metric tid={TID.metricTotalPropuestas} label="Total propuestas" value={data?.total_propuestas} icon={FileStack} tone="primary" />
        <Metric tid={TID.metricHabilitadas} label="Habilitadas" value={data?.habilitadas} icon={CheckCircle2} />
        <Metric label="No habilitadas" value={data?.no_habilitadas} icon={AlertCircle} tone="warning" />
        <Metric label="Asignadas" value={data?.asignadas} icon={ClipboardList} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <Metric tid={TID.metricEvalPendientes} label="Eval. individuales pendientes" value={data?.evaluaciones_individuales_pendientes} icon={ClipboardCheck} />
        <Metric tid={TID.metricEvalFinalizadas} label="Eval. individuales finalizadas" value={data?.evaluaciones_individuales_finalizadas} icon={CheckCircle2} tone="primary" />
        <Metric label="Colectivas abiertas" value={data?.evaluaciones_colectivas_abiertas} icon={ClipboardCheck} />
        <Metric label="Colectivas cerradas" value={data?.evaluaciones_colectivas_cerradas} icon={CheckCircle2} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-10">
        <Metric tid={TID.metricJurados} label="Jurados activos" value={data?.jurados_activos} icon={Users} />
        <Metric tid={TID.metricTernas} label="Ternas activas" value={data?.ternas_activas} icon={UsersRound} />
        <div className="border border-[#E2E7EC] bg-white rounded-xl p-5 shadow-card">
          <div className="text-[10.5px] uppercase tracking-[0.14em] font-display font-bold text-[#5E6878]">
            Tasa de avance
          </div>
          <div className="font-display font-extrabold text-[36px] mt-2 tabular-nums text-[#1A1F2C] leading-none">
            {data ? Math.round(
              (data.evaluaciones_individuales_finalizadas /
                Math.max(1, data.evaluaciones_individuales_finalizadas + data.evaluaciones_individuales_pendientes)) * 100
            ) : 0}<span className="text-2xl text-[#5E6878]">%</span>
          </div>
          <div className="text-xs text-[#5E6878] mt-2 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 stroke-[1.6]" /> sobre evaluaciones individuales
          </div>
        </div>
      </div>

      {/* Subregions */}
      <div className="border border-[#E2E7EC] rounded-xl bg-white p-6 shadow-card">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <MapPin className="w-4 h-4 stroke-[1.6] text-[#14776A]" />
            <h3 className="font-display font-bold text-base text-[#1A1F2C]">Distribución de propuestas por subregión</h3>
          </div>
          <span className="text-[11px] uppercase tracking-wider text-[#5E6878] font-semibold">
            Top 6
          </span>
        </div>
        {data?.avance_subregion?.length ? (
          <div className="space-y-3.5">
            {data.avance_subregion.map((s) => {
              const max = Math.max(...data.avance_subregion.map((x) => x.total), 1);
              const pct = (s.total / max) * 100;
              return (
                <div key={s.subregion} className="grid grid-cols-[180px_1fr_60px] gap-4 items-center">
                  <div className="text-[13.5px] font-medium text-[#3F4856]">{s.subregion}</div>
                  <div className="h-2 bg-[#F1F4F7] rounded-full overflow-hidden">
                    <div className="h-full bg-[#14776A] rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-[14px] tabular-nums text-right font-mono font-semibold text-[#1A1F2C]">{s.total}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Aún no hay propuestas cargadas en esta convocatoria.</p>
        )}
      </div>
    </div>
  );
}
