import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader, { EmptyState } from "@/components/PageHeader";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  Activity, Users, UsersRound, Map, Trophy, Target, Loader2, AlertCircle,
} from "lucide-react";

const ICONS = { Activity, Users, UsersRound, Map, Trophy, Target };

const KPI_COLORS = {
  verde: { bg: "from-[#F0F7F5] to-white", border: "border-[#CDE7E1]", text: "text-[#0F5E54]", bar: "bg-[#14776A]" },
  amber: { bg: "from-[#FFFBEB] to-white", border: "border-[#FDE68A]", text: "text-[#92400E]", bar: "bg-[#F59E0B]" },
  azul:  { bg: "from-[#EFF6FF] to-white", border: "border-[#BFDBFE]", text: "text-[#1E40AF]", bar: "bg-[#3B82F6]" },
};

const CHART_COLORS = ["#14776A", "#F59E0B", "#3B82F6", "#8B5CF6", "#EC4899", "#10B981", "#EF4444", "#06B6D4", "#84CC16", "#F97316"];

export default function Dashboard() {
  const { activeConvocatoriaId } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeConvocatoriaId) return;
    setLoading(true);
    api.get(`/dashboards?convocatoria_id=${activeConvocatoriaId}`)
      .then((r) => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [activeConvocatoriaId]);

  if (!activeConvocatoriaId) {
    return <div className="flex-1 p-10 text-muted-foreground">Selecciona una convocatoria para ver sus dashboards.</div>;
  }
  if (loading || !data) {
    return <div className="flex-1 p-10 flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Cargando dashboards…</div>;
  }

  return (
    <div className="flex-1 p-8 lg:p-10">
      <PageHeader
        eyebrow="Inteligencia operativa"
        title={`Dashboards · ${data.convocatoria?.codigo || ""}`}
        subtitle={`Vista personalizada según tu rol (${data.role}). Los widgets se actualizan en tiempo real al recargar.`}
      />

      {data.dashboards.length === 0 && (
        <EmptyState title="Sin dashboards visibles" hint="Tu rol no tiene dashboards asignados en esta convocatoria." icon={AlertCircle} />
      )}

      <div className="space-y-10">
        {data.dashboards.map((dash) => (
          <DashboardSection key={dash.id} dash={dash} />
        ))}
      </div>
    </div>
  );
}

function DashboardSection({ dash }) {
  const Icon = ICONS[dash.icon] || Activity;
  return (
    <section data-testid={`dashboard-${dash.id}`}>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-[#F0F7F5] border border-[#CDE7E1] flex items-center justify-center">
          <Icon className="w-4 h-4 text-[#0F5E54]" />
        </div>
        <div>
          <h2 className="font-display font-bold text-lg leading-tight">{dash.titulo}</h2>
          <p className="text-[12px] text-muted-foreground">{dash.subtitulo}</p>
        </div>
      </div>
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 auto-rows-min">
        {dash.widgets.map((w) => <WidgetCard key={w.id} widget={w} />)}
      </div>
    </section>
  );
}

function WidgetCard({ widget }) {
  // Span según tipo
  const span = ["bar", "ranking", "progress_multi", "pie"].includes(widget.tipo) ? "lg:col-span-2 xl:col-span-2" : "";
  return (
    <div className={`bg-white border border-border rounded-xl p-4 ${span}`} data-testid={`widget-${widget.id}`}>
      <h3 className="text-[11px] uppercase tracking-[0.14em] font-display font-bold text-muted-foreground mb-3">{widget.titulo}</h3>
      <WidgetBody widget={widget} />
    </div>
  );
}

function WidgetBody({ widget }) {
  const { tipo, data, color } = widget;
  if (!data || data.error) {
    return <div className="text-[12px] text-amber-700 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" /> {data?.error || "Sin datos"}</div>;
  }

  if (tipo === "kpi") {
    const c = KPI_COLORS[color] || KPI_COLORS.verde;
    return (
      <div className={`-mx-4 -mb-4 mt-1 px-4 pb-4 pt-3 rounded-b-xl bg-gradient-to-br ${c.bg}`}>
        <div className={`font-display font-black text-5xl tabular-nums leading-none ${c.text}`}>{data.value ?? 0}</div>
      </div>
    );
  }

  if (tipo === "progress") {
    return (
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <div className="font-display font-black text-3xl tabular-nums text-[#0F5E54]">{data.pct ?? 0}<span className="text-base text-muted-foreground">%</span></div>
          <div className="text-[11px] text-muted-foreground font-mono">{data.done ?? 0} / {data.total ?? 0}</div>
        </div>
        <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
          <div className="h-full bg-[#14776A] transition-all" style={{ width: `${data.pct || 0}%` }}></div>
        </div>
      </div>
    );
  }

  if (tipo === "stats") {
    return (
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Promedio" value={data.promedio} highlight />
        <Stat label="N" value={data.n} />
        <Stat label="Mínimo" value={data.min} />
        <Stat label="Máximo" value={data.max} />
      </div>
    );
  }

  if (tipo === "pie") {
    return (
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={data.items} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={(e) => `${e.value}`}>
            {data.items.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
          </Pie>
          <Tooltip />
          <Legend iconSize={8} wrapperStyle={{ fontSize: "11px" }} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (tipo === "bar") {
    const items = data.items || [];
    if (!items.length) return <div className="text-[12px] text-muted-foreground italic py-4">Sin datos</div>;
    const hasDoneTotal = items[0]?.total !== undefined && items[0]?.done !== undefined;
    return (
      <ResponsiveContainer width="100%" height={Math.max(220, items.length * 22)}>
        <BarChart data={items} layout="vertical" margin={{ left: 10, right: 20 }}>
          <XAxis type="number" tick={{ fontSize: 10 }} />
          <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10 }} />
          <Tooltip cursor={{ fill: "#F0F7F5" }} />
          {hasDoneTotal ? (
            <>
              <Bar dataKey="done" stackId="a" fill="#14776A" name="Finalizadas" />
              <Bar dataKey="pending" stackId="a" fill="#FDE68A" name="Pendientes" />
            </>
          ) : (
            <Bar dataKey={items[0]?.value !== undefined ? "value" : "total"} fill="#14776A" />
          )}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (tipo === "ranking") {
    const items = data.items || [];
    if (!items.length) return <div className="text-[12px] text-muted-foreground italic py-4">Aún sin clasificación</div>;
    const isJurado = items[0]?.nombre !== undefined && items[0]?.pct !== undefined;
    return (
      <ol className="space-y-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex items-center justify-between gap-2 py-1 border-b border-border last:border-0 text-[12.5px]">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${i < 3 ? "bg-[#14776A] text-white" : "bg-secondary text-muted-foreground"}`}>{i + 1}</span>
              {isJurado ? (
                <span className="truncate font-semibold">{it.nombre}</span>
              ) : (
                <>
                  <span className="font-mono text-[11px] text-muted-foreground">{it.codigo}</span>
                  <span className="truncate">{it.nombre}</span>
                </>
              )}
            </div>
            <span className="font-mono tabular-nums font-bold text-[#0F5E54] shrink-0">
              {isJurado ? `${it.pct}%` : (it.puntaje ?? "—")}
            </span>
          </li>
        ))}
      </ol>
    );
  }

  if (tipo === "progress_multi") {
    const items = data.items || [];
    return (
      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={i}>
            <div className="flex items-center justify-between text-[12px] mb-0.5">
              <span className="font-mono font-semibold">{it.name}</span>
              <span className="text-muted-foreground font-mono">{it.done}/{it.total} · {it.pct}%</span>
            </div>
            <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-[#14776A] transition-all" style={{ width: `${it.pct || 0}%` }}></div>
            </div>
          </div>
        ))}
        {!items.length && <div className="text-[12px] text-muted-foreground italic py-4">Sin datos</div>}
      </div>
    );
  }

  return <div className="text-[12px] text-muted-foreground italic">Tipo de widget no soportado: {tipo}</div>;
}

function Stat({ label, value, highlight }) {
  return (
    <div className={`p-2 rounded-md ${highlight ? "bg-[#F0F7F5] border border-[#CDE7E1]" : "bg-secondary"}`}>
      <div className="text-[10px] uppercase tracking-wider font-display font-bold text-muted-foreground">{label}</div>
      <div className={`font-display font-bold text-xl tabular-nums ${highlight ? "text-[#0F5E54]" : ""}`}>{value ?? "—"}</div>
    </div>
  );
}
