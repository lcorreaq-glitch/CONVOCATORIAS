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
    tone === "primary" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : tone === "warning" ? "bg-amber-50 text-amber-700 border-amber-200"
    : "bg-white text-foreground border-border";
  return (
    <div data-testid={tid} className={`border rounded-sm p-5 ${toneCls}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] font-display font-bold text-muted-foreground">
            {label}
          </div>
          <div className="font-display font-black text-4xl tracking-tight mt-2 tabular-nums">
            {value ?? "—"}
          </div>
          {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
        </div>
        <Icon className="w-5 h-5 stroke-[1.5] opacity-50 mt-1" />
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
    <div data-testid={TID.dashboardRoot} className="flex-1 p-8 lg:p-10">
      {/* Header */}
      <div className="flex items-start justify-between gap-6 mb-10 pb-6 border-b border-border">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] font-display font-bold text-emerald-700 mb-1.5">
            Tablero de control
          </div>
          <h1 className="font-display font-black text-4xl lg:text-5xl tracking-tight">
            {conv?.nombre || "Dashboard"}
          </h1>
          <p className="text-muted-foreground text-sm mt-2">
            <span className="font-mono text-xs">{conv?.codigo}</span> · {conv?.vigencia} · Estado{" "}
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold">
              {conv?.estado}
            </span>
            {conv?.etapa_actual && <> · Etapa <strong className="text-foreground">{conv.etapa_actual}</strong></>}
          </p>
        </div>
        <div className="text-right text-xs text-muted-foreground font-mono">
          <div>{new Date().toLocaleDateString("es-CO", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</div>
          <div className="mt-1">{(conv?.entidades?.[0]?.nombre) || ""}</div>
        </div>
      </div>

      {/* Top metrics: control room grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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
        <div className="border rounded-sm p-5 bg-white border-border">
          <div className="text-[10px] uppercase tracking-[0.16em] font-display font-bold text-muted-foreground">
            Tasa de avance
          </div>
          <div className="font-display font-black text-4xl mt-2 tabular-nums">
            {data ? Math.round(
              (data.evaluaciones_individuales_finalizadas /
                Math.max(1, data.evaluaciones_individuales_finalizadas + data.evaluaciones_individuales_pendientes)) * 100
            ) : 0}%
          </div>
          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> sobre evaluaciones individuales
          </div>
        </div>
      </div>

      {/* Subregiones */}
      <div className="border border-border rounded-sm bg-white p-6">
        <div className="flex items-center gap-2 mb-5">
          <MapPin className="w-4 h-4 stroke-[1.5] text-muted-foreground" />
          <h3 className="font-display font-bold text-base">Distribución por subregión</h3>
        </div>
        {data?.avance_subregion?.length ? (
          <div className="space-y-3">
            {data.avance_subregion.map((s) => {
              const max = Math.max(...data.avance_subregion.map((x) => x.total), 1);
              const pct = (s.total / max) * 100;
              return (
                <div key={s.subregion} className="grid grid-cols-[180px_1fr_60px] gap-4 items-center">
                  <div className="text-sm">{s.subregion}</div>
                  <div className="h-2 bg-secondary rounded-sm overflow-hidden">
                    <div className="h-full bg-emerald-600 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-sm tabular-nums text-right font-mono">{s.total}</div>
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
