import React, { useEffect, useState, useMemo } from "react";
import { api, formatApiError, openPdf } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader, { Badge, EmptyState } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { Trophy, Sparkles, FileText, Crown, Eye, History, ChevronRight, Users, Layers } from "lucide-react";
import { TID } from "@/constants/testIds";

const FUENTE_LABEL = {
  colectiva: { label: "Colectiva", tone: "success" },
  promedio_individuales: { label: "Promedio individuales", tone: "info" },
  ninguna: { label: "Sin evaluación", tone: "warning" },
};

export default function Ranking() {
  const { activeConvocatoriaId } = useAuth();
  const [rankings, setRankings] = useState([]);
  const [active, setActive] = useState(null);
  const [agrupar, setAgrupar] = useState("subregion");
  const [modo, setModo] = useState("colectivo");
  const [criterios, setCriterios] = useState([]);
  const [desempates, setDesempates] = useState([]);
  const [detail, setDetail] = useState(null); // { item, group }

  const load = async () => {
    if (!activeConvocatoriaId) return;
    const r = await api.get(`/rankings?convocatoria_id=${activeConvocatoriaId}`);
    setRankings(r.data);
    if (r.data?.length && !active) setActive(r.data[0]);
  };
  useEffect(() => { load(); }, [activeConvocatoriaId]);

  useEffect(() => {
    if (!activeConvocatoriaId) return;
    Promise.all([
      api.get(`/criterios?convocatoria_id=${activeConvocatoriaId}`),
      api.get(`/desempates?convocatoria_id=${activeConvocatoriaId}`),
    ]).then(([c, d]) => {
      setCriterios(c.data || []);
      setDesempates((d.data || []).filter((x) => x.activo !== false).sort((a, b) => (a.orden || 0) - (b.orden || 0)));
    }).catch(() => { /* noop */ });
  }, [activeConvocatoriaId]);

  const generar = async () => {
    try {
      const r = await api.post(`/rankings/generar?convocatoria_id=${activeConvocatoriaId}&agrupar_por=${agrupar}&modo=${modo}`);
      toast.success("Ranking generado");
      setActive(r.data);
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const acta = () => active && openPdf(`/actas/ranking/${active.id}`);

  const deleteRanking = async (r) => {
    if (!confirm(`¿Eliminar este ranking generado el ${new Date(r.fecha_generacion).toLocaleString("es-CO")}?\n\nEsta acción no se puede deshacer.`)) return;
    try {
      await api.delete(`/admin/rankings/${r.id}`);
      toast.success("Ranking eliminado");
      if (active?.id === r.id) setActive(null);
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const agrupacionLabel = (key) => ({
    subregion: "Por subregión", linea: "Por línea",
    tipo_organizacion: "Por tipo organización", __general__: "General",
  }[key] || key);

  if (!activeConvocatoriaId) return <div className="p-10 text-muted-foreground">Selecciona una convocatoria.</div>;

  const methodologyText = modo === "colectivo"
    ? "El ranking se construye sobre la evaluación colectiva de cada terna (promedio de los jurados). Si una propuesta aún no tiene evaluación colectiva, cae al promedio de sus individuales finalizadas."
    : "El ranking se construye sobre el promedio de las evaluaciones individuales finalizadas de cada propuesta.";

  return (
    <div className="flex-1 p-8 lg:p-10">
      <PageHeader
        eyebrow="Clasificación final"
        title="Ranking & Desempates"
        subtitle="Genera la clasificación de propuestas por grupo. Los desempates se aplican automáticamente en cascada siguiendo las reglas configuradas en la convocatoria."
        actions={
          rankings.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="rounded-sm gap-2" data-testid="ranking-historial-btn">
                  <History className="w-4 h-4" /> Historial ({rankings.length})
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[420px] p-0">
                <div className="px-4 py-3 border-b border-border">
                  <div className="text-[10px] uppercase tracking-[0.16em] font-display font-bold text-[#0F5E54]">Generaciones previas</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">Selecciona una para ver su tabla.</div>
                </div>
                <div className="max-h-[360px] overflow-y-auto divide-y divide-border">
                  {rankings.map((r) => (
                    <div key={r.id} className={`w-full px-4 py-2.5 hover:bg-secondary transition-colors flex items-center justify-between gap-3 ${active?.id === r.id ? "bg-[#F0F7F5]" : ""}`}>
                      <button onClick={() => setActive(r)} className="flex-1 text-left min-w-0">
                        <div className="font-mono text-[11px] text-[#1A1F2C] truncate">{new Date(r.fecha_generacion).toLocaleString("es-CO")}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {agrupacionLabel(r.agrupacion)} · modo {r.modo || "colectivo"}
                        </div>
                      </button>
                      {active?.id === r.id && <Badge tone="success">Activo</Badge>}
                      <button onClick={() => deleteRanking(r)} className="text-muted-foreground hover:text-red-600 p-1" data-testid={`ranking-delete-${r.id}`} title="Eliminar"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )
        }
      />

      {/* Panel: Cómo se calcula + Generar */}
      <div className="mb-8 rounded-lg border border-[#CDE7E1] bg-gradient-to-br from-[#F0F7F5] to-white p-5">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="flex-1 min-w-[280px]">
            <div className="flex items-center gap-2 mb-2">
              <Layers className="w-4 h-4 text-[#0F5E54]" />
              <div className="text-[10px] uppercase tracking-[0.18em] font-display font-bold text-[#0F5E54]">Cómo se calcula este ranking</div>
            </div>
            <p className="text-[13px] text-[#1A1F2C] leading-relaxed">{methodologyText}</p>
            {desempates.length > 0 && (
              <div className="mt-3 flex items-start gap-2 flex-wrap">
                <span className="text-[10.5px] uppercase tracking-wider font-bold text-[#5E6878] mt-1">Desempates en cascada:</span>
                {desempates.map((d, idx) => (
                  <span key={d.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-white border border-[#CDE7E1]">
                    <span className="font-mono text-[10px] text-[#14776A] font-bold">{idx + 1}</span>
                    <span>{d.nombre}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={modo} onValueChange={setModo}>
              <SelectTrigger className="rounded-sm w-48 bg-white" data-testid="ranking-modo-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="colectivo">Modo colectivo</SelectItem>
                <SelectItem value="individual">Promedio individuales</SelectItem>
              </SelectContent>
            </Select>
            <Select value={agrupar} onValueChange={setAgrupar}>
              <SelectTrigger className="rounded-sm w-44 bg-white" data-testid="ranking-agrupar-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="subregion">Por subregión</SelectItem>
                <SelectItem value="linea">Por línea</SelectItem>
                <SelectItem value="tipo_organizacion">Por tipo organización</SelectItem>
                <SelectItem value="__general__">General</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={generar} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-sm gap-2" data-testid={TID.generarRankingBtn}>
              <Sparkles className="w-4 h-4" /> Generar
            </Button>
            {active && <Button onClick={acta} variant="outline" className="rounded-sm gap-2" data-testid="ranking-acta-btn"><FileText className="w-4 h-4" />Acta PDF</Button>}
          </div>
        </div>
      </div>

      {!active ? (
        <EmptyState title="Sin rankings generados" hint="Selecciona la agrupación y el modo, luego presiona Generar." icon={Trophy} />
      ) : (
        <div className="space-y-6">
          <div className="flex items-center gap-3 text-[12px] text-muted-foreground flex-wrap">
            <span className="inline-flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Agrupado: <strong className="text-[#1A1F2C]">{agrupacionLabel(active.agrupacion)}</strong></span>
            <span>·</span>
            <span>Modo: <strong className="text-[#1A1F2C]">{active.modo || "colectivo"}</strong></span>
            <span>·</span>
            <span>Generado: <span className="font-mono text-[11px]">{new Date(active.fecha_generacion).toLocaleString("es-CO")}</span></span>
            {active.total_cupos_configurados && (
              <>
                <span>·</span>
                <span>Cupos: <strong className="text-[#0F5E54]">{active.total_ganadores_asignados} / {active.total_cupos_configurados}</strong> asignados</span>
              </>
            )}
          </div>

          {/* INFORME DE INCENTIVOS NO ASIGNADOS */}
          {active.incentivos_no_asignados?.length > 0 && (
            <div className="rounded-xl border border-[#FDE68A] bg-gradient-to-br from-[#FFFBEB] to-white p-5">
              <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]"></span>
                    <h3 className="font-display font-bold text-[14px] text-[#92400E]">Informe de incentivos no asignados</h3>
                  </div>
                  <p className="text-[11.5px] text-muted-foreground mt-1">
                    Algunas subregiones tienen menos propuestas habilitadas que el cupo configurado. Los incentivos sobrantes deberán ser reasignados conforme a las políticas de la convocatoria.
                  </p>
                </div>
                <div className="text-right">
                  <div className="font-display font-black text-3xl tabular-nums text-[#92400E]">{active.total_incentivos_sobrantes}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">incentivos sin asignar</div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full dense-table">
                  <thead><tr><th>Subregión</th><th className="text-right">Cupo</th><th className="text-right">Propuestas</th><th className="text-right">Ganadores asignados</th><th className="text-right">Sobrantes</th></tr></thead>
                  <tbody>
                    {active.incentivos_no_asignados.map((x) => (
                      <tr key={x.grupo}>
                        <td className="font-semibold">{x.grupo}</td>
                        <td className="text-right font-mono">{x.cupo_configurado}</td>
                        <td className="text-right font-mono">{x.propuestas_disponibles}</td>
                        <td className="text-right font-mono text-[#0F5E54] font-bold">{x.ganadores_asignados}</td>
                        <td className="text-right font-mono text-[#92400E] font-bold">{x.incentivos_sobrantes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {active.grupos.map((g) => (
            <GroupTable key={g.grupo} group={g} agrupacion={active.agrupacion} onDetail={(it) => setDetail({ item: it, group: g.grupo })} />
          ))}
        </div>
      )}

      <DetailDialog
        detail={detail}
        onClose={() => setDetail(null)}
        criterios={criterios}
        desempates={desempates}
      />
    </div>
  );
}

function GroupTable({ group, agrupacion, onDetail }) {
  // Detectar empates: pares consecutivos con mismo puntaje_total
  const tieMap = useMemo(() => {
    const map = {};
    for (let i = 0; i < group.items.length - 1; i++) {
      const a = group.items[i], b = group.items[i + 1];
      if (a.puntaje_total === b.puntaje_total) {
        map[a.propuesta_id] = true;
        map[b.propuesta_id] = true;
      }
    }
    return map;
  }, [group.items]);

  const hasCupo = group.cupo_ganadores != null;
  const sobrantes = hasCupo ? (group.cupo_ganadores - group.ganadores_asignados) : 0;

  return (
    <div className="border border-border rounded-sm bg-white overflow-hidden">
      <div className="px-5 py-3 border-b border-border bg-secondary flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] font-display font-bold text-muted-foreground">{agrupacion}</div>
          <div className="font-display font-bold text-lg">{group.grupo}</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge tone="muted">{group.total} propuestas</Badge>
          {hasCupo && (
            <Badge tone={sobrantes > 0 ? "warning" : "success"}>
              {group.ganadores_asignados} / {group.cupo_ganadores} ganadores
              {sobrantes > 0 ? ` (${sobrantes} cupos vacantes)` : ""}
            </Badge>
          )}
        </div>
      </div>
      <table className="w-full dense-table" data-testid={TID.rankingTable}>
        <thead>
          <tr>
            <th>Puesto</th>
            <th>Resultado</th>
            <th>Código</th>
            <th>Propuesta</th>
            <th>Organización</th>
            <th>Fuente</th>
            <th>Puntaje</th>
            <th>Diferencial</th>
            <th>Desempate</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {group.items.map((it) => {
            const fuente = FUENTE_LABEL[it.fuente] || { label: it.fuente || "—", tone: "default" };
            const isTied = tieMap[it.propuesta_id];
            const isGanador = it.resultado === "ganador";
            const isEspera = it.resultado === "lista_espera";
            return (
              <tr key={it.propuesta_id} className={isTied ? "bg-[#FFFBEB]/40" : (isGanador && it.puesto <= (group.cupo_ganadores || 9999) ? "bg-[#F0F7F5]/40" : "")}>
                <td className="font-display font-black text-lg tabular-nums">
                  {it.puesto === 1 ? (
                    <span className="inline-flex items-center gap-1 text-[#0F5E54]"><Crown className="w-4 h-4" />{it.puesto}</span>
                  ) : it.puesto}
                </td>
                <td>
                  {isGanador ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-[#0F5E54] text-white">
                      <Crown className="w-3 h-3" /> GANADOR
                    </span>
                  ) : isEspera ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]">
                      Lista de espera
                    </span>
                  ) : it.resultado === "elegible" ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-[#EFF6FF] text-[#1E40AF] border border-[#BFDBFE]">
                      Elegible
                    </span>
                  ) : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="font-mono text-xs">{it.codigo}</td>
                <td className="font-semibold">{it.nombre}</td>
                <td className="text-muted-foreground">{it.organizacion || "—"}</td>
                <td><Badge tone={fuente.tone}>{fuente.label}</Badge></td>
                <td className="font-mono tabular-nums font-bold">{it.puntaje_total}</td>
                <td className="font-mono tabular-nums text-muted-foreground">{it.puntaje_diferencial || 0}</td>
                <td className="text-xs">
                  {it.desempate_regla ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] font-semibold">
                      {it.desempate_regla}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="text-right">
                  <button
                    onClick={() => onDetail(it)}
                    data-testid={`ranking-detail-${it.codigo}`}
                    className="inline-flex items-center gap-1 text-[11px] text-[#14776A] hover:text-[#0F5E54] font-semibold">
                    <Eye className="w-3.5 h-3.5" /> Detalle <ChevronRight className="w-3 h-3" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DetailDialog({ detail, onClose, criterios, desempates }) {
  const criteriosByNombre = useMemo(() => {
    const m = {}; criterios.forEach((c) => { m[c.nombre] = c; }); return m;
  }, [criterios]);
  if (!detail) return null;
  const { item, group } = detail;

  const oficiales = criterios.filter((c) => c.oficial !== false);
  const diferenciales = criterios.filter((c) => c.oficial === false);
  const totalOf = oficiales.reduce((s, c) => s + (parseFloat(item.criterios_detalle?.[c.id]) || 0), 0);
  const totalMaxOf = oficiales.reduce((s, c) => s + (c.puntaje_max || 0), 0);
  const totalDif = diferenciales.reduce((s, c) => s + (parseFloat(item.criterios_detalle?.[c.id]) || 0), 0);

  // Resolver valor de cada regla de desempate para esta propuesta
  const desempatesEval = desempates.map((d) => {
    let valor = null;
    if (d.campo?.startsWith("criterio:")) {
      const nombre = d.campo.split(":", 2)[1].trim();
      const c = criteriosByNombre[nombre];
      if (c) valor = item.criterios_detalle?.[c.id] ?? 0;
    } else if (d.campo === "fecha_radicacion") {
      valor = item.datos?.fecha_radicacion || null;
    } else if (d.campo === "hora_radicacion") {
      valor = item.datos?.hora_radicacion || null;
    } else if (d.campo === "sorteo") {
      valor = "Aleatorio";
    } else if (d.campo) {
      valor = item.datos?.[d.campo] ?? null;
    }
    return { ...d, valor };
  });

  return (
    <Dialog open={!!detail} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="text-[10px] uppercase tracking-[0.18em] font-display font-bold text-[#0F5E54]">Detalle de ranking · {group}</div>
          <DialogTitle className="font-display font-bold text-xl">
            <span className="font-mono text-base mr-2 text-muted-foreground">{item.codigo}</span>
            {item.nombre}
          </DialogTitle>
          <div className="text-[12px] text-muted-foreground">{item.organizacion || "—"}</div>
        </DialogHeader>

        {/* Stats top */}
        <div className="grid grid-cols-3 gap-3 mt-2">
          <StatCard label="Puesto" value={item.puesto === 1 ? <span className="inline-flex items-center gap-1 text-[#0F5E54]"><Crown className="w-5 h-5" />{item.puesto}</span> : item.puesto} />
          <StatCard label="Puntaje oficial" value={`${item.puntaje_total} / ${totalMaxOf || 100}`} highlight />
          <StatCard label="Diferencial" value={item.puntaje_diferencial || 0} />
        </div>

        {/* Fuente */}
        <div className="mt-3 text-[12px] text-muted-foreground">
          Fuente del puntaje: <Badge tone={(FUENTE_LABEL[item.fuente] || {}).tone || "default"}>{(FUENTE_LABEL[item.fuente] || {}).label || item.fuente}</Badge>
        </div>

        {/* Criterios oficiales */}
        <section className="mt-5">
          <div className="text-[10px] uppercase tracking-[0.16em] font-display font-bold text-muted-foreground mb-2">Criterios oficiales (suman al total)</div>
          <div className="border border-border rounded-sm overflow-hidden">
            <table className="w-full dense-table">
              <thead><tr><th>Criterio</th><th className="text-right">Puntaje</th><th className="text-right">Máximo</th><th className="text-right">%</th></tr></thead>
              <tbody>
                {oficiales.map((c) => {
                  const v = parseFloat(item.criterios_detalle?.[c.id]) || 0;
                  const pct = c.puntaje_max ? Math.round((v / c.puntaje_max) * 100) : 0;
                  return (
                    <tr key={c.id}>
                      <td>{c.nombre}</td>
                      <td className="text-right font-mono tabular-nums font-bold">{v}</td>
                      <td className="text-right font-mono tabular-nums text-muted-foreground">{c.puntaje_max}</td>
                      <td className="text-right font-mono text-xs">{pct}%</td>
                    </tr>
                  );
                })}
                <tr className="bg-[#F0F7F5]">
                  <td className="font-bold">Total oficial</td>
                  <td className="text-right font-mono tabular-nums font-black">{totalOf.toFixed(1)}</td>
                  <td className="text-right font-mono tabular-nums">{totalMaxOf}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Diferenciales */}
        {diferenciales.length > 0 && (
          <section className="mt-5">
            <div className="text-[10px] uppercase tracking-[0.16em] font-display font-bold text-muted-foreground mb-2">
              Criterios diferenciales <span className="text-[#92400E] normal-case tracking-normal font-normal">(no suman al total · solo para desempate)</span>
            </div>
            <div className="border border-[#FDE68A] rounded-sm overflow-hidden bg-[#FFFBEB]/40">
              <table className="w-full dense-table">
                <thead><tr><th>Criterio</th><th className="text-right">Puntaje</th><th className="text-right">Máximo</th></tr></thead>
                <tbody>
                  {diferenciales.map((c) => (
                    <tr key={c.id}>
                      <td>{c.nombre}</td>
                      <td className="text-right font-mono tabular-nums font-bold">{parseFloat(item.criterios_detalle?.[c.id]) || 0}</td>
                      <td className="text-right font-mono tabular-nums text-muted-foreground">{c.puntaje_max}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Desempates aplicados */}
        <section className="mt-5">
          <div className="text-[10px] uppercase tracking-[0.16em] font-display font-bold text-muted-foreground mb-2">Reglas de desempate (orden de aplicación)</div>
          {desempatesEval.length === 0 ? (
            <div className="text-[12px] text-muted-foreground italic">No hay reglas de desempate configuradas.</div>
          ) : (
            <ol className="space-y-2">
              {desempatesEval.map((d, idx) => {
                const aplicada = item.desempate_regla === d.nombre;
                return (
                  <li key={d.id} className={`flex items-center justify-between gap-3 p-3 rounded-sm border ${aplicada ? "bg-[#FFFBEB] border-[#FDE68A]" : "bg-white border-border"}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full font-mono text-xs font-bold ${aplicada ? "bg-[#F59E0B] text-white" : "bg-secondary text-muted-foreground"}`}>{idx + 1}</span>
                      <div className="min-w-0">
                        <div className="font-semibold text-[13px]">{d.nombre}</div>
                        <div className="text-[11px] text-muted-foreground">
                          Campo: <span className="font-mono">{d.campo}</span> · Comparación: <span className="font-mono">{d.tipo_comparacion}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Valor</div>
                      <div className="font-mono tabular-nums font-bold text-sm">{d.valor === null || d.valor === undefined || d.valor === "" ? "—" : String(d.valor)}</div>
                      {aplicada && <div className="text-[10px] mt-0.5 font-semibold text-[#92400E]">↑ Aplicada</div>}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}

function StatCard({ label, value, highlight }) {
  return (
    <div className={`rounded-sm border p-3 ${highlight ? "border-[#CDE7E1] bg-[#F0F7F5]" : "border-border bg-white"}`}>
      <div className="text-[10px] uppercase tracking-wider font-display font-bold text-muted-foreground">{label}</div>
      <div className="font-display font-black text-2xl tabular-nums mt-0.5">{value}</div>
    </div>
  );
}
