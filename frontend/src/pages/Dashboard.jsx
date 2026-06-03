import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader, { EmptyState } from "@/components/PageHeader";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
  LineChart, Line, CartesianGrid,
} from "recharts";
import {
  Activity, Users, UsersRound, Map, Trophy, Target, Loader2, AlertCircle, Layers, Heart,
  Sparkles, Check, X, Settings, Eye, EyeOff, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

const ICONS = { Activity, Users, UsersRound, Map, Trophy, Target, Layers, Heart };

const KPI_COLORS = {
  verde: { bg: "from-[#F0F7F5] to-white", text: "text-[#0F5E54]" },
  amber: { bg: "from-[#FFFBEB] to-white", text: "text-[#92400E]" },
  azul:  { bg: "from-[#EFF6FF] to-white", text: "text-[#1E40AF]" },
};
const CHART_COLORS = ["#14776A", "#F59E0B", "#3B82F6", "#8B5CF6", "#EC4899", "#10B981", "#EF4444", "#06B6D4", "#84CC16", "#F97316"];

export default function Dashboard() {
  const { activeConvocatoriaId } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);

  const load = () => {
    if (!activeConvocatoriaId) return;
    setLoading(true);
    api.get(`/dashboards?convocatoria_id=${activeConvocatoriaId}`)
      .then((r) => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [activeConvocatoriaId]);

  const acceptSuggestion = async (s) => {
    try {
      await api.post(`/dashboards/suggestions/${s.id}/accept?convocatoria_id=${activeConvocatoriaId}`);
      toast.success("Widget agregado al dashboard");
      load();
    } catch { toast.error("No se pudo agregar"); }
  };
  const dismissSuggestion = async (s) => {
    try {
      await api.post(`/dashboards/suggestions/${s.id}/dismiss?convocatoria_id=${activeConvocatoriaId}`);
      toast.success("Sugerencia descartada");
      load();
    } catch { toast.error("Error"); }
  };

  if (!activeConvocatoriaId) return <div className="flex-1 p-10 text-muted-foreground">Selecciona una convocatoria.</div>;
  if (loading || !data) return <div className="flex-1 p-10 flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Cargando dashboards…</div>;

  return (
    <div className="flex-1 p-8 lg:p-10">
      <PageHeader
        eyebrow="Inteligencia operativa"
        title={`Dashboards · ${data.convocatoria?.codigo || ""}`}
        subtitle={`Vista personalizada según tu rol (${data.role}).`}
        actions={data.is_admin && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={load} className="rounded-sm gap-1.5" data-testid="dash-refresh-btn">
              <RefreshCw className="w-3.5 h-3.5" /> Actualizar
            </Button>
            <Button variant="outline" size="sm" onClick={() => setEditorOpen(true)} className="rounded-sm gap-1.5" data-testid="dash-editor-btn">
              <Settings className="w-3.5 h-3.5" /> Editar dashboards
            </Button>
          </div>
        )}
      />

      {/* SUGERENCIAS INTELIGENTES */}
      {data.is_admin && (data.suggestions?.length > 0) && (
        <div className="mb-6 rounded-xl border border-[#FDE68A] bg-gradient-to-br from-[#FFFBEB] to-white p-5">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-[#92400E]" />
            <h3 className="font-display font-bold text-[14px] text-[#92400E]">Sugerencias inteligentes ({data.suggestions.length})</h3>
            <span className="text-[11px] text-muted-foreground">KRINOS detectó campos configurados y sugiere widgets relevantes.</span>
          </div>
          <div className="space-y-2">
            {data.suggestions.map((s) => (
              <div key={s.id} className="flex items-start justify-between gap-3 p-3 bg-white border border-border rounded-lg">
                <div className="flex-1 min-w-0">
                  <div className="font-display font-bold text-[13px]">{s.widget.titulo}</div>
                  <div className="text-[11.5px] text-muted-foreground mt-0.5">{s.rationale}</div>
                  <div className="text-[10px] text-muted-foreground mt-1 font-mono">→ Dashboard: {s.dashboard_id} · Tipo: {s.widget.tipo}</div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" onClick={() => acceptSuggestion(s)} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-sm gap-1 h-7 text-[11px]" data-testid={`sug-accept-${s.id}`}>
                    <Check className="w-3 h-3" /> Aceptar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => dismissSuggestion(s)} className="rounded-sm gap-1 h-7 text-[11px]" data-testid={`sug-dismiss-${s.id}`}>
                    <X className="w-3 h-3" /> Descartar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.dashboards.length === 0 && (
        <EmptyState title="Sin dashboards visibles" hint="Tu rol no tiene dashboards habilitados." icon={AlertCircle} />
      )}

      <div className="space-y-10">
        {data.dashboards.map((dash) => <DashboardSection key={dash.id} dash={dash} />)}
      </div>

      {data.is_admin && <DashboardEditor open={editorOpen} onClose={() => setEditorOpen(false)} data={data} reload={load} convId={activeConvocatoriaId} />}
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
  // Widgets que necesitan más espacio horizontal
  let span = "";
  if (["bar", "comparativo"].includes(widget.tipo)) span = "lg:col-span-3 xl:col-span-4"; // full row
  else if (["ranking", "progress_multi", "pie", "time_series"].includes(widget.tipo)) span = "lg:col-span-2 xl:col-span-2";
  return (
    <div className={`bg-white border border-border rounded-xl p-4 ${span}`} data-testid={`widget-${widget.id}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[11px] uppercase tracking-[0.14em] font-display font-bold text-muted-foreground">{widget.titulo}</h3>
        {widget._custom && <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-[#F0F7F5] text-[#0F5E54] border border-[#CDE7E1]">Personalizado</span>}
      </div>
      <WidgetBody widget={widget} />
    </div>
  );
}

function WidgetBody({ widget }) {
  const { tipo, data, color } = widget;
  if (!data || data.error) return <div className="text-[12px] text-amber-700 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" /> {data?.error || "Sin datos"}</div>;

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
        <div className="h-2 w-full bg-secondary rounded-full overflow-hidden"><div className="h-full bg-[#14776A] transition-all" style={{ width: `${data.pct || 0}%` }}></div></div>
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
    const items = data.items || [];
    if (!items.length) return <div className="text-[12px] text-muted-foreground italic py-4">Sin datos</div>;
    return (
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={items} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={(e) => `${e.value}`}>
            {items.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
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
    const rowH = 30;
    return (
      <ResponsiveContainer width="100%" height={Math.max(240, items.length * rowH + 50)}>
        <BarChart data={items} layout="vertical" margin={{ left: 4, right: 30, top: 4, bottom: 4 }} barCategoryGap={6}>
          <CartesianGrid horizontal={false} stroke="#F1F4F7" />
          <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
          <YAxis type="category" dataKey="name" width={220} interval={0}
                 tick={{ fontSize: 11, fill: "#1A1F2C" }}
                 tickFormatter={(v) => (v && v.length > 30 ? v.slice(0, 28) + "…" : v)} />
          <Tooltip cursor={{ fill: "#F0F7F5" }} contentStyle={{ fontSize: "12px" }} />
          {hasDoneTotal ? (<>
            <Legend iconSize={10} wrapperStyle={{ fontSize: "11px", paddingTop: 6 }} />
            <Bar dataKey="done" stackId="a" fill="#14776A" name="Finalizadas" />
            <Bar dataKey="pending" stackId="a" fill="#FDE68A" name="Pendientes" />
          </>) : (
            <Bar dataKey={items[0]?.value !== undefined ? "value" : "total"} fill="#14776A"
                 label={{ position: "right", fontSize: 10, fill: "#0F5E54", fontWeight: 600 }} />
          )}
        </BarChart>
      </ResponsiveContainer>
    );
  }
  if (tipo === "comparativo") {
    const items = data.items || [];
    if (!items.length) return <div className="text-[12px] text-muted-foreground italic py-4">Aún sin evaluaciones cerradas</div>;
    const rowH = 30;
    return (
      <ResponsiveContainer width="100%" height={Math.max(240, items.length * rowH + 40)}>
        <BarChart data={items} layout="vertical" margin={{ left: 4, right: 40, top: 4, bottom: 4 }} barCategoryGap={6}>
          <CartesianGrid horizontal={false} stroke="#F1F4F7" />
          <XAxis type="number" tick={{ fontSize: 10 }} domain={[0, 100]} />
          <YAxis type="category" dataKey="name" width={220} interval={0}
                 tick={{ fontSize: 11, fill: "#1A1F2C" }}
                 tickFormatter={(v) => (v && v.length > 30 ? v.slice(0, 28) + "…" : v)} />
          <Tooltip cursor={{ fill: "#F0F7F5" }} contentStyle={{ fontSize: "12px" }} />
          <Bar dataKey="promedio" fill="#3B82F6" name="Promedio"
               label={{ position: "right", fontSize: 11, fill: "#1E40AF", fontWeight: 700 }} />
        </BarChart>
      </ResponsiveContainer>
    );
  }
  if (tipo === "time_series") {
    const items = data.items || [];
    return (
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={items} margin={{ left: 0, right: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
          <Tooltip />
          <Line type="monotone" dataKey="value" stroke="#14776A" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
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
              {isJurado ? <span className="truncate font-semibold">{it.nombre}</span> : (<>
                <span className="font-mono text-[11px] text-muted-foreground">{it.codigo}</span>
                <span className="truncate">{it.nombre}</span>
              </>)}
            </div>
            <span className="font-mono tabular-nums font-bold text-[#0F5E54] shrink-0">{isJurado ? `${it.pct}%` : (it.puntaje ?? "—")}</span>
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
            <div className="h-1.5 bg-secondary rounded-full overflow-hidden"><div className="h-full bg-[#14776A] transition-all" style={{ width: `${it.pct || 0}%` }}></div></div>
          </div>
        ))}
        {!items.length && <div className="text-[12px] text-muted-foreground italic py-4">Sin datos</div>}
      </div>
    );
  }
  return <div className="text-[12px] text-muted-foreground italic">Tipo no soportado: {tipo}</div>;
}

function Stat({ label, value, highlight }) {
  return (
    <div className={`p-2 rounded-md ${highlight ? "bg-[#F0F7F5] border border-[#CDE7E1]" : "bg-secondary"}`}>
      <div className="text-[10px] uppercase tracking-wider font-display font-bold text-muted-foreground">{label}</div>
      <div className={`font-display font-bold text-xl tabular-nums ${highlight ? "text-[#0F5E54]" : ""}`}>{value ?? "—"}</div>
    </div>
  );
}

// ============================================================
// EDITOR (Fase 3) — Mostrar/Ocultar dashboards y widgets
// ============================================================
function DashboardEditor({ open, onClose, data, reload, convId }) {
  const [busy, setBusy] = useState(false);
  const [overrides, setOverrides] = useState({ hidden_dashboards: [], hidden_widgets: [] });

  useEffect(() => {
    if (!open || !convId) return;
    api.get(`/dashboards/overrides?convocatoria_id=${convId}`).then((r) => setOverrides(r.data || {})).catch(() => {});
  }, [open, convId]);

  const toggleDash = async (dashId, currentlyHidden) => {
    setBusy(true);
    try {
      const payload = currentlyHidden ? { remove_hidden_dashboard: dashId } : { add_hidden_dashboard: dashId };
      const r = await api.patch(`/dashboards/overrides?convocatoria_id=${convId}`, payload);
      setOverrides(r.data.overrides || {});
      toast.success(currentlyHidden ? "Dashboard restaurado" : "Dashboard oculto");
      reload();
    } catch { toast.error("Error"); }
    finally { setBusy(false); }
  };

  const toggleWidget = async (widgetId, currentlyHidden) => {
    setBusy(true);
    try {
      const payload = currentlyHidden ? { remove_hidden_widget: widgetId } : { add_hidden_widget: widgetId };
      const r = await api.patch(`/dashboards/overrides?convocatoria_id=${convId}`, payload);
      setOverrides(r.data.overrides || {});
      reload();
    } catch { toast.error("Error"); }
    finally { setBusy(false); }
  };

  const resetAll = async () => {
    setBusy(true);
    try {
      await api.patch(`/dashboards/overrides?convocatoria_id=${convId}`, { reset: true });
      setOverrides({});
      toast.success("Configuración restaurada");
      reload();
      onClose();
    } catch { toast.error("Error"); }
    finally { setBusy(false); }
  };

  const hiddenDashSet = new Set(overrides.hidden_dashboards || []);
  const hiddenWidgetSet = new Set(overrides.hidden_widgets || []);

  // Combinar dashboards visibles + ocultos para mostrar todos en el editor
  // El backend solo devuelve visibles; reconstruimos los ocultos como solo encabezado
  const allDashIds = new Set([...data.dashboards.map((d) => d.id), ...(overrides.hidden_dashboards || [])]);
  const allDashboards = Array.from(allDashIds).map((id) => {
    const visible = data.dashboards.find((d) => d.id === id);
    return visible || { id, titulo: id, widgets: [] };
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Settings className="w-5 h-5 text-[#14776A]" /> Editor de Dashboards
          </DialogTitle>
        </DialogHeader>
        <p className="text-[12.5px] text-muted-foreground -mt-2 mb-3">
          Activa o desactiva dashboards y widgets para esta convocatoria. Los cambios afectan a todos los usuarios con permiso para verlos.
        </p>

        <div className="space-y-2">
          {allDashboards.map((dash) => {
            const isHidden = hiddenDashSet.has(dash.id);
            return (
              <div key={dash.id} className={`border rounded-lg p-3 ${isHidden ? "border-dashed border-amber-300 bg-amber-50/30 opacity-75" : "border-border bg-white"}`}>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div>
                    <div className="font-display font-bold text-[13px]">{dash.titulo}</div>
                    <div className="text-[10.5px] text-muted-foreground">{dash.widgets.length} widget(s){isHidden ? " · oculto" : ""}</div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => toggleDash(dash.id, isHidden)} disabled={busy}
                          className={`gap-1 rounded-sm text-[11px] h-7 ${isHidden ? "text-[#14776A] border-[#CDE7E1]" : ""}`} data-testid={`toggle-dash-${dash.id}`}>
                    {isHidden ? <><Eye className="w-3 h-3" /> Mostrar</> : <><EyeOff className="w-3 h-3" /> Ocultar</>}
                  </Button>
                </div>
                {!isHidden && dash.widgets.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {dash.widgets.map((w) => {
                      const wHidden = hiddenWidgetSet.has(w.id);
                      return (
                        <button key={w.id} onClick={() => toggleWidget(w.id, wHidden)} disabled={busy} data-testid={`toggle-widget-${w.id}`}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10.5px] border transition-colors ${wHidden ? "bg-amber-50 border-amber-200 text-amber-700 line-through" : "bg-secondary border-border hover:bg-[#F0F7F5] hover:border-[#CDE7E1]"}`}>
                          {wHidden ? <EyeOff className="w-2.5 h-2.5" /> : <Eye className="w-2.5 h-2.5 text-[#14776A]" />}
                          {w.titulo}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-5 pt-4 border-t border-border flex items-center justify-between">
          <Button variant="outline" onClick={resetAll} disabled={busy} className="rounded-sm gap-2 text-red-600 border-red-200 hover:bg-red-50" data-testid="dash-reset-btn">
            <RefreshCw className="w-3.5 h-3.5" /> Restaurar default
          </Button>
          <Button onClick={onClose} className="rounded-sm bg-[#14776A] hover:bg-[#0F5E54]">Cerrar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
