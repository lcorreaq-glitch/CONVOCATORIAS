import React, { useEffect, useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { api, formatApiError, openPdf } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Badge, estadoTone } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { toast } from "sonner";
import {
  ArrowLeft, Save, FileText, CheckCircle2, EyeOff, Sparkles, Lock, ArrowRight,
  Info, Building2, MapPin, Calendar, Layers, Eye as EyeIcon, ExternalLink, Users, RefreshCw,
} from "lucide-react";

const CAMPO_ICON = {
  organizacion: Building2, nombre_organizacion: Building2,
  subregion: MapPin, municipio: MapPin, departamento: MapPin,
  fecha_radicacion: Calendar, fecha_presentacion: Calendar,
  linea: Layers, tematica: Layers, tipo_organizacion: Building2,
};

export default function EvaluacionColectiva() {
  const { id } = useParams();
  const { user } = useAuth();
  const [ev, setEv] = useState(null);
  const [conv, setConv] = useState(null);
  const [propuesta, setPropuesta] = useState(null);
  const [terna, setTerna] = useState(null);
  const [criterios, setCriterios] = useState([]);
  const [campos, setCampos] = useState([]);
  const [puntajes, setPuntajes] = useState({});
  const [obs, setObs] = useState("");
  const [v2List, setV2List] = useState([]);
  const [ciego, setCiego] = useState(true);
  const [showFicha, setShowFicha] = useState(false);

  const reload = async () => {
    const r = await api.get(`/evaluaciones-colectivas/${id}`);
    setEv(r.data);
    setPuntajes(r.data.puntajes || {});
    setObs(r.data.observacion_consolidada || "");
    const [p, t, c, cv, ca] = await Promise.all([
      api.get(`/propuestas/${r.data.propuesta_id}`),
      api.get(`/ternas?convocatoria_id=${r.data.convocatoria_id}`),
      api.get(`/criterios?convocatoria_id=${r.data.convocatoria_id}`),
      api.get(`/convocatorias/${r.data.convocatoria_id}`),
      api.get(`/campos?convocatoria_id=${r.data.convocatoria_id}&aplica_a=propuesta`),
    ]);
    setPropuesta(p.data);
    setTerna(t.data.find((x) => x.id === r.data.terna_id));
    setCriterios(c.data);
    setConv(cv.data);
    setCampos(ca.data);
    try {
      const v2r = await api.get(`/evaluaciones-colectivas/${id}/v2`);
      setV2List(v2r.data.items || []);
      setCiego(v2r.data.ciego_activo);
    } catch { setV2List([]); }
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [id]);

  const camposResumen = useMemo(() => campos
    .filter((c) => (c.uso_actas || c.uso_lista) && !["nombre_organizacion", "link_expediente"].includes(c.nombre_interno))
    .slice(0, 6), [campos]);
  const camposFicha = useMemo(() => campos
    .filter((c) => c.uso_propuesta || c.uso_actas || c.uso_lista)
    .filter((c) => !["link_expediente"].includes(c.nombre_interno)), [campos]);

  if (!ev || !propuesta) return <div className="p-10 text-sm text-[#5E6878]">Cargando…</div>;

  const modalidad = conv?.modalidad_evaluacion_colectiva || "promedio_individuales";
  const isClosed = ["Cerrada", "Firmada"].includes(ev.estado);
  const isCerrada = ev.estado === "Cerrada"; // reabrible (Firmada NO)
  const isAdmin = ["admin_general", "admin_convocatoria"].includes(user?.role);
  const isModal2 = modalidad === "nueva_evaluacion";
  // ¿El usuario es integrante de esta terna? (para botón Solicitar reapertura)
  const userJuradoId = user?.jurado_id;
  const isIntegrante = !!(userJuradoId && terna?.integrantes?.some((i) => i.jurado_id === userJuradoId));

  const reabrirColectiva = async () => {
    const motivo = window.prompt("Motivo de la reapertura (queda en auditoría):");
    if (!motivo || !motivo.trim()) return;
    try {
      await api.post(`/evaluaciones-colectivas/${id}/reabrir`, { motivo });
      toast.success("Evaluación colectiva reabierta. La terna puede modificarla.");
      reload();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const solicitarReaperturaColectiva = async () => {
    const motivo = window.prompt("¿Por qué necesitan reabrir esta evaluación colectiva? (el admin debe aprobar)");
    if (!motivo || !motivo.trim()) return;
    try {
      await api.post(`/evaluaciones-colectivas/${id}/solicitar-reapertura`, { motivo });
      toast.success("Solicitud enviada al administrador. Espera su aprobación.");
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const save = async (cerrar = false) => {
    try {
      const r = await api.patch(`/evaluaciones-colectivas/${id}`, { puntajes, observacion_consolidada: obs, cerrar });
      setEv(r.data);
      toast.success(cerrar ? "Evaluación colectiva cerrada" : "Cambios guardados");
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const iniciarModalidad2 = async () => {
    try {
      const r = await api.post(`/evaluaciones-colectivas/${id}/iniciar-modalidad-nueva`);
      toast.success(`Etapa colectiva iniciada · ${r.data.v2_creadas} evaluaciones v2 precargadas`);
      reload();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  const cerrarConPromedioV2 = async () => {
    try {
      await api.post(`/evaluaciones-colectivas/${id}/cerrar-con-promedio-v2`);
      toast.success("Colectiva cerrada con promedio definitivo");
      reload();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  const downloadActa = () => openPdf(`/actas/colectiva/${id}`);

  const totalOf = criterios.filter((c) => c.oficial !== false)
    .reduce((s, c) => s + (parseFloat(puntajes[c.id]) || 0), 0);
  const maxOf = conv?.configuracion?.puntaje_max_evaluacion || 100;
  const pctTotal = Math.min(100, (totalOf / maxOf) * 100);

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-[#FAFBFC]">
      {/* HEADER STICKY */}
      <div className="sticky top-0 z-30 border-b border-border bg-white px-6 lg:px-8 py-3.5 flex items-center justify-between gap-4 flex-wrap shadow-sm">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Link to="/evaluaciones" className="text-muted-foreground hover:text-foreground shrink-0" data-testid="eval-col-back-btn">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.16em] font-display font-bold text-[#0F5E54]">
              Evaluación colectiva · {isModal2 ? "Modalidad: nueva evaluación por terna" : "Modalidad: promedio individuales"}
            </div>
            <div className="font-display font-bold text-lg leading-tight truncate">
              {propuesta.codigo} · {propuesta.nombre}
            </div>
          </div>
          <Badge tone={estadoTone(ev.estado)}>{ev.estado}</Badge>
          {ev.fuente_definitiva && <Badge tone="success">Fuente: {ev.fuente_definitiva.replace(/_/g, " ")}</Badge>}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {!isModal2 && (
            <div className="text-right mr-1">
              <div className="text-[10px] uppercase tracking-wider font-display font-bold text-muted-foreground">Total oficial</div>
              <div className="font-display font-black text-2xl tabular-nums leading-none">
                {totalOf.toFixed(1)} <span className="text-base text-muted-foreground">/ {maxOf}</span>
              </div>
              <div className="mt-1 h-1 w-32 bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-[#14776A] transition-all" style={{ width: `${pctTotal}%` }}></div>
              </div>
            </div>
          )}
          {!isClosed && !isModal2 && (
            <Button onClick={() => save(false)} variant="outline" className="rounded-sm gap-2" data-testid="save-col-btn">
              <Save className="w-4 h-4" />Guardar
            </Button>
          )}
          {!isClosed && !isModal2 && (
            <Button onClick={() => save(true)} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-sm gap-2" data-testid="cerrar-col-btn">
              <CheckCircle2 className="w-4 h-4" />Cerrar
            </Button>
          )}
          {isClosed && (
            <Button onClick={downloadActa} variant="outline" className="rounded-sm gap-2" data-testid="download-acta-col-btn">
              <FileText className="w-4 h-4" />Acta PDF
            </Button>
          )}
          {/* Reabrir colectiva (solo admin, estado Cerrada — no Firmada) */}
          {isCerrada && isAdmin && (
            <Button
              onClick={reabrirColectiva}
              variant="outline"
              className="rounded-sm gap-2 text-amber-700 border-amber-300 hover:bg-amber-50"
              data-testid="eval-col-reabrir-btn"
            >
              <RefreshCw className="w-4 h-4" />Reabrir
            </Button>
          )}
          {/* Solicitar reapertura (integrante de la terna, estado Cerrada) */}
          {isCerrada && !isAdmin && isIntegrante && (
            <Button
              onClick={solicitarReaperturaColectiva}
              variant="outline"
              className="rounded-sm gap-2 text-amber-700 border-amber-300 hover:bg-amber-50"
              data-testid="eval-col-solicitar-reapertura-btn"
            >
              <RefreshCw className="w-4 h-4" />Solicitar reapertura
            </Button>
          )}
        </div>
      </div>

      {/* BANDA RESUMEN PROPUESTA + TERNA */}
      <div className="border-b border-border bg-white px-6 lg:px-8 py-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <div className="text-[10px] uppercase tracking-[0.16em] font-display font-bold text-muted-foreground">Organización</div>
            <div className="font-display font-bold text-[15px] mt-0.5 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[#14776A] shrink-0" />
              {propuesta.organizacion || propuesta.datos?.nombre_organizacion || "—"}
            </div>
            {conv && (
              <div className="text-[11px] text-muted-foreground mt-1 font-mono">{conv.codigo} · {conv.nombre}</div>
            )}
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2 flex-[2_1_500px]">
            {camposResumen.map((c) => {
              const v = propuesta.datos?.[c.nombre_interno];
              let display = v === null || v === undefined || v === "" ? "—" : v;
              if (Array.isArray(v)) display = v.join(", ");
              if (c.tipo === "si_no") display = v ? "Sí" : "No";
              const Icon = CAMPO_ICON[c.nombre_interno] || Layers;
              return (
                <div key={c.id} className="min-w-[110px]">
                  <div className="text-[9.5px] uppercase tracking-wider text-muted-foreground font-display font-bold flex items-center gap-1">
                    <Icon className="w-2.5 h-2.5" />{c.nombre_visible}
                  </div>
                  <div className={`text-[13px] font-semibold mt-0.5 ${(c.tipo === "fecha" || c.tipo === "hora") ? "font-mono" : ""}`}>
                    {display}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => setShowFicha(true)} className="gap-1.5 rounded-sm" data-testid="eval-col-ficha-btn">
              <EyeIcon className="w-3.5 h-3.5" /> Ficha completa
            </Button>
            {propuesta.datos?.link_expediente && (
              <a href={propuesta.datos.link_expediente} target="_blank" rel="noreferrer"
                 className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#14776A] hover:bg-[#0F5E54] text-white rounded-sm text-[12px] font-semibold transition-colors">
                <ExternalLink className="w-3.5 h-3.5" /> Expediente
              </a>
            )}
          </div>
        </div>

        {/* Sub-banda con terna */}
        <div className="mt-3 pt-3 border-t border-border flex items-center justify-between gap-3 flex-wrap text-[12px]">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="w-3.5 h-3.5 text-[#14776A]" />
            <span>Terna:</span>
            <span className="font-mono text-[#1A1F2C] font-semibold">{terna?.codigo}</span>
            <span>·</span>
            <span className="text-[#1A1F2C] font-semibold">{terna?.nombre}</span>
            {terna?.subregion && <><span>·</span><span>{terna.subregion}</span></>}
          </div>
          <div className="flex items-center gap-2">
            {(terna?.integrantes || []).map((i) => (
              <span key={i.jurado_id || i.nombre} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] bg-secondary border border-border">
                <span className="w-1.5 h-1.5 rounded-full bg-[#14776A]"></span>{i.nombre}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* CONTENIDO */}
      <div className="flex-1 px-6 lg:px-8 py-6 max-w-[1280px] w-full mx-auto">
        {/* ===== Modalidad 2: nueva evaluación por terna ===== */}
        {isModal2 ? (
          <div className="space-y-6">
            {ciego && !isClosed && (
              <div className="border-l-4 border-[#14776A] bg-[#F0F7F5] rounded-r-lg p-4 flex items-start gap-3">
                <EyeOff className="w-5 h-5 text-[#14776A] mt-0.5" />
                <div className="text-[13px]">
                  <strong className="font-display">Etapa colectiva en modo CIEGO</strong>
                  <p className="text-[#5E6878] mt-1">Cada jurado registra su evaluación v2 sin ver los puntajes de los demás. Los resultados se revelarán al cerrar la etapa y se calculará el promedio definitivo automáticamente.</p>
                </div>
              </div>
            )}

            {!v2List.length && (isAdmin || user?.role === "integrante_terna") && (
              <div className="rounded-xl border border-[#CDE7E1] bg-gradient-to-br from-[#F0F7F5] to-white p-8 text-center">
                <Sparkles className="w-10 h-10 text-[#14776A] mx-auto mb-3" />
                <h3 className="font-display font-bold text-lg">Iniciar etapa colectiva</h3>
                <p className="text-[13px] text-[#5E6878] mt-2 max-w-md mx-auto">Se crearán evaluaciones individuales v2 para cada integrante de la terna, <strong>precargadas con sus puntajes y observaciones de la etapa individual (v1)</strong>. Cada jurado podrá ajustar tras la deliberación grupal.</p>
                <Button onClick={iniciarModalidad2} className="mt-4 bg-[#14776A] hover:bg-[#0F5E54] rounded-sm gap-2" data-testid="iniciar-modalidad-2-btn">
                  <ArrowRight className="w-4 h-4" /> Iniciar etapa colectiva (crear v2)
                </Button>
              </div>
            )}

            {v2List.length > 0 && (
              <div className="border border-border rounded-lg bg-white p-5">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                  <div>
                    <h3 className="font-display font-bold text-base">Evaluaciones v2 de la terna</h3>
                    <p className="text-[12px] text-muted-foreground mt-0.5">{v2List.filter((x) => ["Finalizada", "Firmada"].includes(x.estado)).length} de {v2List.length} finalizadas</p>
                  </div>
                  {isAdmin && !isClosed && (
                    <Button onClick={cerrarConPromedioV2} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-sm gap-2" data-testid="cerrar-modal-2-btn">
                      <CheckCircle2 className="w-4 h-4" /> Cerrar y calcular promedio
                    </Button>
                  )}
                </div>
                <table className="w-full dense-table">
                  <thead><tr><th>Jurado</th><th>Estado</th><th>Puntaje oficial</th><th>Finalizada</th><th></th></tr></thead>
                  <tbody>
                    {v2List.map((v) => {
                      const jur = terna?.integrantes?.find((i) => i.jurado_id === v.jurado_id);
                      return (
                        <tr key={v.id}>
                          <td className="font-semibold">{jur?.nombre || v.jurado_id?.slice(0, 8)}</td>
                          <td><Badge tone={estadoTone(v.estado)}>{v.estado}</Badge></td>
                          <td className="font-mono tabular-nums">
                            {v.ciego ? <span className="text-muted-foreground inline-flex items-center gap-1"><Lock className="w-3 h-3" />Ciego</span> : (v.puntaje_total ?? "—")}
                          </td>
                          <td className="text-xs text-muted-foreground font-mono">{v.fecha_finalizacion ? new Date(v.fecha_finalizacion).toLocaleString("es-CO") : "—"}</td>
                          <td className="text-right">
                            <Link to={`/evaluaciones/individual/${v.id}`} data-testid={`open-v2-${v.id}`} className="text-[#14776A] hover:underline text-xs inline-flex items-center gap-1">
                              Abrir <ArrowRight className="w-3 h-3" />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {isClosed && (
              <div className="rounded-xl border border-[#CDE7E1] bg-gradient-to-br from-[#F0F7F5] to-white p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.16em] font-display font-bold text-[#0F5E54]">Resultado definitivo</div>
                    <div className="text-[13px] text-muted-foreground mt-1">Promedio de las {ev.v2_relacionadas?.length || 0} evaluaciones v2 finalizadas</div>
                  </div>
                  <div className="text-right">
                    <div className="font-display font-extrabold text-5xl tabular-nums text-[#1A1F2C] leading-none">{ev.puntaje_final ?? 0}</div>
                    <div className="text-[11px] text-muted-foreground uppercase tracking-wider mt-1">de {maxOf} oficial</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ===== Modalidad 1: promedio individuales ===== */
          <div className="space-y-4">
            <div className="rounded-lg border border-[#CDE7E1] bg-gradient-to-r from-[#F0F7F5] to-white p-4 flex items-start gap-3">
              <Info className="w-4 h-4 text-[#0F5E54] mt-0.5 shrink-0" />
              <div className="text-[12.5px]">
                <strong className="text-[#0F5E54]">Modalidad promedio:</strong> los puntajes se calcularon automáticamente como promedio de las evaluaciones individuales finalizadas. Puedes ajustarlos antes de cerrar.{ev.individuales_relacionadas?.length ? ` ${ev.individuales_relacionadas.length} evaluaciones individuales relacionadas.` : ""}
              </div>
            </div>

            <div className="flex items-center justify-between mb-1">
              <div className="text-[10px] uppercase tracking-[0.18em] font-display font-bold text-muted-foreground">Puntajes consolidados</div>
              <div className="text-[11.5px] text-muted-foreground">
                {criterios.filter((c) => c.oficial !== false).length} oficiales · {criterios.filter((c) => c.oficial === false).length} diferenciales
              </div>
            </div>

            <div className="space-y-3">
              {criterios.map((c) => {
                const sumaRanking = !c.diferencial && c.oficial !== false;
                const v = puntajes[c.id];
                const hasValue = v !== "" && v !== undefined && v !== null;
                const pct = hasValue && c.puntaje_max ? Math.min(100, Math.max(0, (Number(v) / c.puntaje_max) * 100)) : 0;
                return (
                  <div key={c.id} className={`rounded-lg border bg-white overflow-hidden shadow-sm ${sumaRanking ? "border-[#CDE7E1]" : "border-[#FDE68A]"}`}>
                    <div className={`h-1 w-full ${sumaRanking ? "bg-[#14776A]" : "bg-[#F59E0B]"}`}></div>
                    <div className="p-4 flex items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-display font-bold text-[14.5px]">{c.nombre}</h4>
                          {sumaRanking ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-[#E8F3F0] text-[#0F5E54] border border-[#CDE7E1]">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#14776A]"></span>Oficial · hasta {c.puntaje_max} pts
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]"></span>Solo desempate (no suma)
                            </span>
                          )}
                        </div>
                        {c.descripcion && <p className="text-[12px] text-muted-foreground mt-1 leading-snug">{c.descripcion}</p>}
                        {hasValue && (
                          <div className="mt-3 h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                            <div className={`h-full transition-all ${sumaRanking ? "bg-[#14776A]" : "bg-[#F59E0B]"}`} style={{ width: `${pct}%` }}></div>
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <Input type="number" step="0.1" disabled={isClosed}
                               min={c.puntaje_min} max={c.puntaje_max}
                               className={`w-28 rounded-lg text-right font-display font-extrabold text-[20px] tabular-nums pr-3 ${sumaRanking ? "border-[#CDE7E1] focus-visible:ring-[#14776A]" : "border-[#FDE68A] focus-visible:ring-[#F59E0B]"}`}
                               placeholder="—"
                               value={puntajes[c.id] ?? ""}
                               data-testid={`eval-col-input-${c.id}`}
                               onKeyDown={(e) => { if (["e","E","+"].includes(e.key)) e.preventDefault(); }}
                               onChange={(e) => {
                                 const raw = e.target.value;
                                 if (raw === "") { setPuntajes({ ...puntajes, [c.id]: "" }); return; }
                                 let v = parseFloat(raw);
                                 if (isNaN(v)) return;
                                 const mx = c.puntaje_max ?? 100;
                                 const mn = c.puntaje_min ?? 0;
                                 if (v > mx) { v = mx; toast.warning(`'${c.nombre}': valor ajustado al máximo permitido (${mx} pts)`); }
                                 else if (v < mn) { v = mn; toast.warning(`'${c.nombre}': valor ajustado al mínimo permitido (${mn} pts)`); }
                                 setPuntajes({ ...puntajes, [c.id]: v });
                               }} />
                        <div className="text-[10px] mt-1 text-muted-foreground font-mono">rango {c.puntaje_min}–{c.puntaje_max}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Observación consolidada */}
            <div className="rounded-lg border border-border bg-white p-4">
              <label className="text-[10px] uppercase tracking-[0.16em] font-display font-bold text-muted-foreground mb-2 block">
                Observación consolidada de la terna
              </label>
              <p className="text-[11px] text-muted-foreground mb-2">Este texto aparecerá en el acta colectiva PDF como observación oficial.</p>
              <Textarea rows={5} disabled={isClosed} value={obs} onChange={(e) => setObs(e.target.value)} className="rounded-sm" data-testid="eval-col-obs" />
            </div>
          </div>
        )}
      </div>

      {/* DRAWER FICHA */}
      <Drawer open={showFicha} onOpenChange={setShowFicha}>
        <DrawerContent className="max-w-2xl ml-auto">
          <DrawerHeader>
            <DrawerTitle className="font-display flex items-center gap-2">
              <EyeIcon className="w-5 h-5 text-[#14776A]" /> Ficha completa · {propuesta.codigo}
            </DrawerTitle>
            <div className="text-[12px] text-muted-foreground">{propuesta.nombre}</div>
          </DrawerHeader>
          <div className="px-6 pb-6 overflow-y-auto">
            <div className="grid sm:grid-cols-2 gap-3">
              {camposFicha.map((c) => {
                const v = propuesta.datos?.[c.nombre_interno];
                let display = v === null || v === undefined || v === "" ? "—" : v;
                if (Array.isArray(v)) display = v.join(", ");
                if (c.tipo === "si_no") display = v ? "Sí" : "No";
                return (
                  <div key={c.id} className="border border-border rounded-sm p-3 bg-white">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-display font-bold">{c.nombre_visible}</div>
                    <div className={`text-[13px] mt-1 ${(c.tipo === "fecha" || c.tipo === "hora") ? "font-mono" : ""}`}>{display}</div>
                  </div>
                );
              })}
            </div>
            {propuesta.datos?.link_expediente && (
              <a href={propuesta.datos.link_expediente} target="_blank" rel="noreferrer"
                 className="mt-4 inline-flex items-center gap-2 px-3 py-2 bg-[#14776A] hover:bg-[#0F5E54] text-white rounded-sm text-sm font-semibold transition-colors">
                <ExternalLink className="w-4 h-4" /> Abrir expediente externo
              </a>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
