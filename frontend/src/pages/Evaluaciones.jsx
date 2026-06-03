import React, { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader, { Badge, estadoTone, EmptyState } from "@/components/PageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ClipboardCheck, ArrowRight, Clock, CheckCircle2, Lock, Hourglass, Search,
  Sparkles, AlertCircle, Target, TrendingUp,
} from "lucide-react";

const PENDIENTE_STATES = ["Pendiente", "En progreso", "Borrador"];
const TERMINADAS_STATES = ["Finalizada", "Firmada", "Bloqueada", "Cerrada"];

export default function Evaluaciones() {
  const { activeConvocatoriaId, user } = useAuth();
  const isJurado = user?.role === "jurado";
  const [individuales, setIndividuales] = useState([]);
  const [colectivas, setColectivas] = useState([]);
  const [propuestas, setPropuestas] = useState([]);
  const [jurados, setJurados] = useState([]);
  const [ternas, setTernas] = useState([]);
  const [filtroEstado, setFiltroEstado] = useState(isJurado ? "pendientes" : "todas");
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!activeConvocatoriaId) return;
    const url = isJurado
      ? `/evaluaciones-individuales?convocatoria_id=${activeConvocatoriaId}&mias=true`
      : `/evaluaciones-individuales?convocatoria_id=${activeConvocatoriaId}`;
    api.get(url).then((r) => setIndividuales(r.data));
    const urlCol = isJurado
      ? `/evaluaciones-colectivas?convocatoria_id=${activeConvocatoriaId}&mias=true`
      : `/evaluaciones-colectivas?convocatoria_id=${activeConvocatoriaId}`;
    api.get(urlCol).then((r) => setColectivas(r.data)).catch(() => setColectivas([]));
    api.get(`/propuestas?convocatoria_id=${activeConvocatoriaId}`).then((r) => setPropuestas(r.data));
    if (!isJurado) {
      api.get(`/jurados?convocatoria_id=${activeConvocatoriaId}`).then((r) => setJurados(r.data));
    }
    api.get(`/ternas?convocatoria_id=${activeConvocatoriaId}`).then((r) => setTernas(r.data));
  }, [activeConvocatoriaId, user, isJurado]);

  const propMap = useMemo(() => Object.fromEntries(propuestas.map((p) => [p.id, p])), [propuestas]);
  const jurMap = useMemo(() => Object.fromEntries(jurados.map((j) => [j.id, j])), [jurados]);
  const ternaMap = useMemo(() => Object.fromEntries(ternas.map((t) => [t.id, t])), [ternas]);

  // Contadores para jurado
  const counts = useMemo(() => {
    const indPend = individuales.filter((e) => PENDIENTE_STATES.includes(e.estado)).length;
    const indDone = individuales.filter((e) => TERMINADAS_STATES.includes(e.estado)).length;
    const colPend = colectivas.filter((e) => PENDIENTE_STATES.includes(e.estado)).length;
    const colDone = colectivas.filter((e) => TERMINADAS_STATES.includes(e.estado)).length;
    return {
      indPend, indDone, indTotal: individuales.length,
      colPend, colDone, colTotal: colectivas.length,
      indPct: individuales.length ? Math.round((indDone / individuales.length) * 100) : 0,
      colPct: colectivas.length ? Math.round((colDone / colectivas.length) * 100) : 0,
    };
  }, [individuales, colectivas]);

  const filterEval = (list) => {
    let f = list;
    if (filtroEstado === "pendientes") f = f.filter((e) => PENDIENTE_STATES.includes(e.estado));
    else if (filtroEstado === "terminadas") f = f.filter((e) => TERMINADAS_STATES.includes(e.estado));
    if (q.trim()) {
      const needle = q.toLowerCase();
      f = f.filter((e) => {
        const p = propMap[e.propuesta_id];
        return (p?.codigo || "").toLowerCase().includes(needle) || (p?.nombre || "").toLowerCase().includes(needle);
      });
    }
    return f;
  };

  if (!activeConvocatoriaId) return <div className="p-10 text-muted-foreground">Selecciona una convocatoria.</div>;

  return (
    <div className="flex-1 p-8 lg:p-10">
      <PageHeader
        eyebrow={isJurado ? "Mi panel de trabajo" : "Proceso evaluador"}
        title={isJurado ? "Mis Evaluaciones" : "Evaluaciones"}
        subtitle={isJurado ? "Aquí encuentras todas las propuestas asignadas. Empieza por las pendientes."
                            : "Seguimiento de todas las evaluaciones individuales y colectivas."}
      />

      {/* PANEL HEROICO PARA JURADO */}
      {isJurado && (
        <div className="mb-6 grid md:grid-cols-2 gap-4">
          <ProgresoCard
            tone="individual"
            icon={Target}
            titulo="Etapa Individual"
            pendientes={counts.indPend}
            terminadas={counts.indDone}
            total={counts.indTotal}
            pct={counts.indPct}
          />
          <ProgresoCard
            tone="colectivo"
            icon={TrendingUp}
            titulo="Etapa Colectiva"
            pendientes={counts.colPend}
            terminadas={counts.colDone}
            total={counts.colTotal}
            pct={counts.colPct}
          />
        </div>
      )}

      {/* Filtros */}
      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar propuesta por código o nombre…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-8 w-72 rounded-sm h-9"
            data-testid="eval-search"
          />
        </div>
        <Select value={filtroEstado} onValueChange={setFiltroEstado}>
          <SelectTrigger className="w-44 rounded-sm h-9" data-testid="eval-filter-estado"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas</SelectItem>
            <SelectItem value="pendientes">Solo pendientes</SelectItem>
            <SelectItem value="terminadas">Solo terminadas</SelectItem>
          </SelectContent>
        </Select>
        {filtroEstado !== "todas" && (
          <button onClick={() => setFiltroEstado("todas")} className="text-[11px] text-muted-foreground hover:text-[#14776A]">
            Limpiar filtro
          </button>
        )}
      </div>

      <Tabs defaultValue="individuales">
        <TabsList className="rounded-sm bg-secondary p-1">
          <TabsTrigger value="individuales" className="rounded-sm gap-1.5" data-testid="tab-eval-individuales">
            <ClipboardCheck className="w-3.5 h-3.5" /> Individuales
            <span className="font-mono text-[10.5px] opacity-70">({filterEval(individuales).length})</span>
          </TabsTrigger>
          <TabsTrigger value="colectivas" className="rounded-sm gap-1.5" data-testid="tab-eval-colectivas">
            <Sparkles className="w-3.5 h-3.5" /> Colectivas
            <span className="font-mono text-[10.5px] opacity-70">({filterEval(colectivas).length})</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="individuales" className="mt-6">
          <EvalTable
            evaluaciones={filterEval(individuales)}
            isJurado={isJurado}
            propMap={propMap}
            jurMap={jurMap}
            tipo="individual"
            emptyHint={isJurado ? "No tienes evaluaciones individuales asignadas en esta convocatoria." : "Sin evaluaciones individuales."}
          />
        </TabsContent>

        <TabsContent value="colectivas" className="mt-6">
          <EvalTableColectiva
            evaluaciones={filterEval(colectivas)}
            propMap={propMap}
            ternaMap={ternaMap}
            isJurado={isJurado}
            emptyHint={isJurado ? "Aún no tienes deliberaciones colectivas asignadas." : "Asigna propuestas a ternas para iniciar la deliberación colectiva."}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ProgresoCard({ tone, icon: Icon, titulo, pendientes, terminadas, total, pct }) {
  const colors = tone === "individual"
    ? { bg: "from-[#F0F7F5] to-white", border: "border-[#CDE7E1]", bar: "bg-[#14776A]", icon: "text-[#0F5E54]" }
    : { bg: "from-[#FFFBEB] to-white", border: "border-[#FDE68A]", bar: "bg-[#F59E0B]", icon: "text-[#92400E]" };
  const sinAsignar = total === 0;
  return (
    <div className={`rounded-xl border ${colors.border} bg-gradient-to-br ${colors.bg} p-5`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className={`w-9 h-9 rounded-lg bg-white border ${colors.border} flex items-center justify-center`}>
            <Icon className={`w-4 h-4 ${colors.icon}`} />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.16em] font-display font-bold text-muted-foreground">{titulo}</div>
            <div className="font-display font-bold text-lg">{sinAsignar ? "Sin asignaciones" : `${terminadas} de ${total} listas`}</div>
          </div>
        </div>
        {!sinAsignar && (
          <div className="text-right">
            <div className="font-display font-black text-3xl tabular-nums">{pct}<span className="text-base text-muted-foreground">%</span></div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">avance</div>
          </div>
        )}
      </div>
      {!sinAsignar && (
        <>
          <div className="mt-3 h-2 w-full bg-white rounded-full overflow-hidden border border-border">
            <div className={`h-full ${colors.bar} transition-all`} style={{ width: `${pct}%` }}></div>
          </div>
          <div className="mt-3 flex items-center gap-4 text-[12px]">
            <span className="inline-flex items-center gap-1.5 text-amber-700">
              <Hourglass className="w-3 h-3" /> {pendientes} pendientes
            </span>
            <span className="inline-flex items-center gap-1.5 text-[#14776A]">
              <CheckCircle2 className="w-3 h-3" /> {terminadas} terminadas
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function EstadoBadge({ estado }) {
  if (PENDIENTE_STATES.includes(estado)) {
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
      <Clock className="w-3 h-3" /> {estado}
    </span>;
  }
  if (estado === "Firmada" || estado === "Bloqueada") {
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-secondary text-muted-foreground border border-border">
      <Lock className="w-3 h-3" /> {estado}
    </span>;
  }
  if (TERMINADAS_STATES.includes(estado)) {
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-[#E8F3F0] text-[#0F5E54] border border-[#CDE7E1]">
      <CheckCircle2 className="w-3 h-3" /> {estado}
    </span>;
  }
  return <Badge tone={estadoTone(estado)}>{estado}</Badge>;
}

function EvalTable({ evaluaciones, isJurado, propMap, jurMap, tipo, emptyHint }) {
  if (!evaluaciones.length) {
    return <div className="border border-dashed border-border rounded-lg p-12">
      <EmptyState title="Sin resultados" hint={emptyHint} icon={ClipboardCheck} />
    </div>;
  }
  return (
    <div className="border border-border rounded-sm bg-white overflow-x-auto">
      <table className="w-full dense-table">
        <thead>
          <tr>
            <th>Propuesta</th>
            {!isJurado && <th>Jurado</th>}
            <th>Estado</th>
            <th>Puntaje</th>
            <th>Última edición</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {evaluaciones.map((e) => {
            const p = propMap[e.propuesta_id];
            const j = !isJurado ? jurMap[e.jurado_id] : null;
            return (
              <tr key={e.id} data-testid={`eval-row-${e.id}`}>
                <td>
                  <div className="font-mono text-xs text-muted-foreground">{p?.codigo || "—"}</div>
                  <div className="font-semibold">{p?.nombre || "Propuesta sin nombre"}</div>
                </td>
                {!isJurado && <td>{j?.nombre || "—"}</td>}
                <td><EstadoBadge estado={e.estado} /></td>
                <td className="font-mono tabular-nums">{e.puntaje_total ?? 0} <span className="text-muted-foreground">/ 100</span></td>
                <td className="text-xs text-muted-foreground font-mono">{e.fecha_ultima_edicion ? new Date(e.fecha_ultima_edicion).toLocaleString("es-CO") : "—"}</td>
                <td className="text-right">
                  <Link to={`/evaluaciones/${tipo}/${e.id}`} data-testid={`open-eval-${e.id}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-sm text-[11px] font-semibold bg-[#14776A] text-white hover:bg-[#0F5E54] transition-colors">
                    {PENDIENTE_STATES.includes(e.estado) ? "Continuar" : "Abrir"} <ArrowRight className="w-3 h-3" />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EvalTableColectiva({ evaluaciones, propMap, ternaMap, isJurado, emptyHint }) {
  if (!evaluaciones.length) {
    return <div className="border border-dashed border-border rounded-lg p-12">
      <EmptyState title="Sin resultados" hint={emptyHint} icon={Sparkles} />
    </div>;
  }
  return (
    <div className="border border-border rounded-sm bg-white overflow-x-auto">
      <table className="w-full dense-table">
        <thead>
          <tr><th>Propuesta</th><th>Terna</th><th>Estado</th><th>Puntaje colectivo</th><th></th></tr>
        </thead>
        <tbody>
          {evaluaciones.map((e) => {
            const p = propMap[e.propuesta_id];
            const t = ternaMap[e.terna_id];
            return (
              <tr key={e.id}>
                <td>
                  <div className="font-mono text-xs text-muted-foreground">{p?.codigo || "—"}</div>
                  <div className="font-semibold">{p?.nombre || "Propuesta sin nombre"}</div>
                </td>
                <td>
                  <div className="font-mono text-xs text-muted-foreground">{t?.codigo || "—"}</div>
                  <div>{t?.nombre || "—"}</div>
                </td>
                <td><EstadoBadge estado={e.estado} /></td>
                <td className="font-mono tabular-nums">{e.puntaje_final ?? 0} <span className="text-muted-foreground">/ 100</span></td>
                <td className="text-right">
                  <Link to={`/evaluaciones/colectiva/${e.id}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-sm text-[11px] font-semibold bg-[#14776A] text-white hover:bg-[#0F5E54] transition-colors">
                    {PENDIENTE_STATES.includes(e.estado) ? "Continuar" : "Abrir"} <ArrowRight className="w-3 h-3" />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
