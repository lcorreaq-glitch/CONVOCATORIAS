import React, { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Badge, estadoTone } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ArrowLeft, ExternalLink, Save, CheckCircle2, PenLine, Lock, Sparkles, RefreshCw,
  Building2, MapPin, Calendar, Layers, Eye, ChevronDown, Eye as EyeIcon,
} from "lucide-react";
import { TID } from "@/constants/testIds";

// Iconos por nombre interno (fallback Layers)
const CAMPO_ICON = {
  organizacion: Building2, nombre_organizacion: Building2,
  subregion: MapPin, municipio: MapPin, departamento: MapPin,
  fecha_radicacion: Calendar, fecha_presentacion: Calendar,
  linea: Layers, tematica: Layers, tipo_organizacion: Building2,
};

export default function EvaluacionIndividual() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isJurado = user?.role === "jurado";
  const [ev, setEv] = useState(null);
  const [propuesta, setPropuesta] = useState(null);
  const [criterios, setCriterios] = useState([]);
  const [campos, setCampos] = useState([]);
  const [conv, setConv] = useState(null);
  const [puntajes, setPuntajes] = useState({});
  const [observaciones, setObservaciones] = useState({});
  const [obsFinal, setObsFinal] = useState("");
  const [saving, setSaving] = useState(false);
  const [v1Ref, setV1Ref] = useState(null);
  const [showFicha, setShowFicha] = useState(false);
  const [showCelebracion, setShowCelebracion] = useState(false);

  useEffect(() => {
    api.get(`/evaluaciones-individuales/${id}`).then(async (r) => {
      setEv(r.data);
      setPuntajes(r.data.puntajes || {});
      setObservaciones(r.data.observaciones || {});
      setObsFinal(r.data.observacion_final || "");
      const p = await api.get(`/propuestas/${r.data.propuesta_id}`);
      setPropuesta(p.data);
      const cid = p.data.convocatoria_id;
      const [c, cv] = await Promise.all([
        api.get(`/campos?convocatoria_id=${cid}&aplica_a=propuesta`),
        api.get(`/convocatorias/${cid}`),
      ]);
      setCampos(c.data); setConv(cv.data);
      const crit = await api.get(`/criterios?convocatoria_id=${r.data.convocatoria_id}`);
      setCriterios(crit.data);
    }).catch(() => toast.error("No se pudo cargar la evaluación"));
    api.get(`/evaluaciones-individuales/${id}/referencia-v1`).then((r) => setV1Ref(r.data)).catch(() => setV1Ref(null));
  }, [id]);

  const setPunt = (c, raw) => {
    if (raw === "" || raw === null || raw === undefined) {
      setPuntajes({ ...puntajes, [c.id]: "" });
      return;
    }
    let v = parseFloat(raw);
    if (isNaN(v)) return;  // ignora caracteres no numéricos
    const max = c.puntaje_max ?? 100;
    const min = c.puntaje_min ?? 0;
    let warned = false;
    if (v > max) {
      v = max;
      toast.warning(`'${c.nombre}': valor ajustado al máximo permitido (${max} pts)`);
      warned = true;
    }
    if (v < min) {
      v = min;
      if (!warned) toast.warning(`'${c.nombre}': valor ajustado al mínimo permitido (${min} pts)`);
    }
    setPuntajes({ ...puntajes, [c.id]: v });
  };
  const setObs = (cid, v) => setObservaciones({ ...observaciones, [cid]: v });

  const isCritPriorizacion = (c) => ((c.nombre_interno || c.nombre || "").toLowerCase()).includes("prioriz");
  const valorAuto = (c) => (propuesta?.datos?.priorizada ? c.puntaje_max : 0);

  const total = (oficial = true) =>
    criterios.filter((c) => (oficial ? c.oficial !== false : c.oficial === false))
      .reduce((s, c) => {
        const v = isCritPriorizacion(c) ? valorAuto(c) : parseFloat(puntajes[c.id]) || 0;
        return s + (v || 0);
      }, 0);

  const save = async (finalize = false) => {
    if (finalize) {
      // Pre-validación local (UX): mismas reglas que el backend para evitar viaje innecesario
      const obsFaltantes = criterios
        .filter((c) => c.observacion_obligatoria && !((observaciones[c.id] || "").trim()))
        .map((c) => c.nombre);
      if (obsFaltantes.length) {
        toast.error(`Faltan observaciones obligatorias en: ${obsFaltantes.join(" · ")}`);
        return;
      }
      const obsFinalObligatoria = conv?.observacion_final_obligatoria !== false;
      if (obsFinalObligatoria && !obsFinal.trim()) {
        toast.error("La observación final / conclusiones es obligatoria. Escribe una síntesis antes de finalizar.");
        return;
      }
    }
    setSaving(true);
    try {
      const r = await api.patch(`/evaluaciones-individuales/${id}`, {
        puntajes, observaciones, observacion_final: obsFinal, finalizar: finalize,
      });
      setEv(r.data);
      toast.success(finalize ? "Evaluación finalizada" : "Cambios guardados");
      // Si finalizó y es jurado, verificar si completó TODAS sus evaluaciones para celebrar + ir a firmar
      if (finalize && isJurado) {
        try {
          const myEvs = await api.get(`/evaluaciones-individuales?convocatoria_id=${ev.convocatoria_id}&jurado_id=${ev.jurado_id}`);
          const items = myEvs.data || [];
          const todasFinalizadas = items.length > 0 && items.every((e) => ["Finalizada", "Firmada"].includes(e.estado));
          if (todasFinalizadas) {
            setShowCelebracion(true);
          }
        } catch (err) { console.warn("[EvaluacionIndividual] No se pudo verificar progreso global:", err?.message); }
      }
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    setSaving(false);
  };

  const sugerirObs = async (criterioId) => {
    try {
      const punt = puntajes[criterioId];
      if (punt === "" || punt === undefined) { toast.error("Asigne primero un puntaje al criterio."); return; }
      const r = await api.post("/ai/sugerencia-observacion", {
        evaluacion_id: id, criterio_id: criterioId, puntaje: parseFloat(punt),
      });
      setObservaciones((prev) => ({ ...prev, [criterioId]: r.data.observacion_sugerida }));
      toast.success("Sugerencia de IA aplicada (puedes editarla)");
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  // Campos resumen (uso_actas o uso_lista, excluyendo organizacion + link)
  const camposResumen = useMemo(() => campos
    .filter((c) => (c.uso_actas || c.uso_lista) && !["nombre_organizacion", "link_expediente"].includes(c.nombre_interno))
    .slice(0, 6), [campos]);

  // Campos completos para la ficha (drawer)
  const camposFicha = useMemo(() => campos
    .filter((c) => c.uso_propuesta || c.uso_actas || c.uso_lista)
    .filter((c) => !["link_expediente"].includes(c.nombre_interno)), [campos]);

  if (!ev || !propuesta) return <div className="p-10 text-muted-foreground">Cargando…</div>;
  // Bloqueo: para jurado, Finalizada también es de solo lectura (debe solicitar reapertura).
  // Para admin/super, Finalizada permite editar para correcciones puntuales.
  const isLocked = ["Bloqueada", "Firmada", "Anulada"].includes(ev.estado) ||
                   (isJurado && ev.estado === "Finalizada");
  const totalOf = total(true);
  const maxOf = conv?.configuracion?.puntaje_max_evaluacion || 100;
  const totalDif = total(false);
  const pctTotal = Math.min(100, (totalOf / maxOf) * 100);

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-[#FAFBFC]">
      {/* HEADER STICKY */}
      <div className="sticky top-0 z-30 border-b border-border bg-white px-6 lg:px-8 py-3.5 flex items-center justify-between gap-4 flex-wrap shadow-sm">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Link to="/evaluaciones" className="text-muted-foreground hover:text-foreground shrink-0" data-testid="eval-back-btn">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.16em] font-display font-bold text-[#0F5E54]">
              Evaluación individual {ev.etapa === "colectiva" && `· v${ev.version || 2}`}
            </div>
            <div className="font-display font-bold text-lg leading-tight truncate">
              {propuesta.codigo} · {propuesta.nombre}
            </div>
          </div>
          <Badge tone={estadoTone(ev.estado)}>{ev.estado}</Badge>
          {ev.etapa === "colectiva" && <Badge tone="info">Etapa colectiva</Badge>}
          {ev.ciego_hasta_cierre && !["Cerrada", "Firmada"].includes(ev.estado) && (
            <Badge tone="warning">CIEGO</Badge>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right mr-1">
            <div className="text-[10px] uppercase tracking-wider font-display font-bold text-muted-foreground">Total oficial</div>
            <div className="font-display font-black text-2xl tabular-nums leading-none">
              {totalOf.toFixed(1)} <span className="text-base text-muted-foreground">/ {maxOf}</span>
            </div>
            <div className="mt-1 h-1 w-32 bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-[#14776A] transition-all" style={{ width: `${pctTotal}%` }}></div>
            </div>
          </div>
          {!isLocked && (
            <Button onClick={() => save(false)} disabled={saving} variant="outline" className="rounded-sm gap-2" data-testid="save-eval-btn">
              <Save className="w-4 h-4" />Guardar
            </Button>
          )}
          {ev.estado !== "Finalizada" && !isLocked && (
            <Button onClick={() => save(true)} disabled={saving} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-sm gap-2" data-testid={TID.finalizarEvalBtn}>
              <CheckCircle2 className="w-4 h-4" />Finalizar
            </Button>
          )}
          {/* IMPORTANTE: la FIRMA y el ACTA PDF individual NO se manejan por propuesta.
             Existe UN único acta consolidada por jurado al terminar TODAS sus evaluaciones
             individuales, que se firma desde /actas. Por eso aquí no aparecen ni para admin. */}
          {/* Reabrir (solo admin, evaluación Finalizada — no Firmada) */}
          {ev.estado === "Finalizada" && !isJurado && (
            <Button
              onClick={async () => {
                const motivo = window.prompt("Motivo de la reapertura (queda en auditoría):");
                if (!motivo || !motivo.trim()) return;
                try {
                  await api.post(`/evaluaciones-individuales/${ev.id}/reabrir`, { motivo });
                  toast.success("Evaluación reabierta. El jurado puede modificarla.");
                  const r = await api.get(`/evaluaciones-individuales/${ev.id}`);
                  setEv(r.data);
                } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
              }}
              variant="outline"
              className="rounded-sm gap-2 text-amber-700 border-amber-300 hover:bg-amber-50"
              data-testid="eval-reabrir-btn"
            >
              <RefreshCw className="w-4 h-4" />Reabrir
            </Button>
          )}
          {/* Solicitar reapertura (solo jurado, evaluación Finalizada) */}
          {ev.estado === "Finalizada" && isJurado && (
            <Button
              onClick={async () => {
                const motivo = window.prompt("¿Por qué necesitas modificar esta evaluación finalizada? (el admin debe aprobar)");
                if (!motivo || !motivo.trim()) return;
                try {
                  await api.post(`/evaluaciones-individuales/${ev.id}/solicitar-reapertura`, { motivo });
                  toast.success("Solicitud enviada al administrador. Espera su aprobación.");
                } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
              }}
              variant="outline"
              className="rounded-sm gap-2 text-amber-700 border-amber-300 hover:bg-amber-50"
              data-testid="eval-solicitar-reapertura-btn"
            >
              <RefreshCw className="w-4 h-4" />Solicitar reapertura
            </Button>
          )}
        </div>
      </div>

      {/* BANDA RESUMEN PROPUESTA (HORIZONTAL) */}
      <div className="border-b border-border bg-white px-6 lg:px-8 py-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          {/* Organización principal */}
          <div className="flex-1 min-w-[220px]">
            <div className="text-[10px] uppercase tracking-[0.16em] font-display font-bold text-muted-foreground">Organización</div>
            <div className="font-display font-bold text-[15px] mt-0.5 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[#14776A] shrink-0" />
              {propuesta.organizacion || propuesta.datos?.nombre_organizacion || "—"}
            </div>
            {conv && (
              <div className="text-[11px] text-muted-foreground mt-1 font-mono">
                {conv.codigo} · {conv.nombre}
              </div>
            )}
          </div>

          {/* Grid de chips de metadatos */}
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

          {/* Acciones */}
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => setShowFicha(true)} className="gap-1.5 rounded-sm" data-testid="eval-ver-ficha-btn">
              <EyeIcon className="w-3.5 h-3.5" /> Ficha completa
            </Button>
            {propuesta.datos?.link_expediente && (
              <a href={propuesta.datos.link_expediente} target="_blank" rel="noreferrer"
                 className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#14776A] hover:bg-[#0F5E54] text-white rounded-sm text-[12px] font-semibold transition-colors"
                 data-testid="eval-expediente-btn">
                <ExternalLink className="w-3.5 h-3.5" /> Expediente
              </a>
            )}
          </div>
        </div>
      </div>

      {/* CONTENT: CRITERIOS FULL WIDTH */}
      <div className="flex-1 px-6 lg:px-8 py-6 max-w-[1280px] w-full mx-auto">
        {isLocked && (
          <div className="mb-5 p-3 bg-amber-50 border border-amber-200 rounded-sm flex items-center gap-2 text-sm">
            <Lock className="w-4 h-4 text-amber-700" /> Esta evaluación está en estado <strong>{ev.estado}</strong> y no puede editarse.
          </div>
        )}

        {/* Banner v1 reference si aplica */}
        {v1Ref && ev.etapa === "colectiva" && (
          <div className="mb-5 bg-gradient-to-r from-[#F0F7F5] to-white border border-[#14776A]/30 rounded-lg p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-[10px] uppercase tracking-[0.16em] font-display font-bold text-[#14776A]">Referencia · Tu evaluación individual (v1)</div>
                <p className="text-[11.5px] text-[#5E6878] mt-0.5">Estos puntajes fueron precargados. Ajusta tras la deliberación grupal.</p>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase font-bold text-muted-foreground">Total v1</div>
                <div className="font-display font-black text-xl tabular-nums">{v1Ref.puntaje_total ?? 0} / {maxOf}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 mt-3">
              {criterios.map((c) => (
                <div key={c.id} className="bg-white border border-[#E0EEEA] rounded-sm px-2.5 py-1.5">
                  <div className="text-[10px] text-muted-foreground truncate">{c.nombre}</div>
                  <div className="font-mono tabular-nums font-bold text-sm">{v1Ref.puntajes?.[c.id] ?? "—"}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] uppercase tracking-[0.18em] font-display font-bold text-muted-foreground">
            Criterios de evaluación
          </div>
          <div className="text-[11.5px] text-muted-foreground">
            {criterios.filter((c) => c.oficial).length} oficiales · {criterios.filter((c) => !c.oficial).length} diferenciales
          </div>
        </div>

        {/* Criterios cards */}
        <div className="space-y-3">
          {criterios.map((c) => {
            const sumaRanking = !c.diferencial && c.oficial !== false;
            const isPriorizacion = ((c.nombre_interno || c.nombre || "").toLowerCase()).includes("prioriz");
            const isAuto = isPriorizacion; // Solo lectura, valor automático
            const autoValue = isAuto ? (propuesta.datos?.priorizada ? c.puntaje_max : 0) : null;
            const v = isAuto ? autoValue : puntajes[c.id];
            const hasValue = v !== "" && v !== undefined && v !== null;
            const pct = hasValue && c.puntaje_max ? Math.min(100, Math.max(0, (Number(v) / c.puntaje_max) * 100)) : 0;
            return (
              <div key={c.id} className={`rounded-lg border bg-white overflow-hidden shadow-sm ${isAuto ? "border-[#3B82F6]/40" : sumaRanking ? "border-[#CDE7E1]" : "border-[#FDE68A]"}`}>
                <div className={`h-1 w-full ${isAuto ? "bg-[#3B82F6]" : sumaRanking ? "bg-[#14776A]" : "bg-[#F59E0B]"}`}></div>
                <div className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-display font-bold text-[14.5px] text-[#1A1F2C]">{c.nombre}</h4>
                        {isAuto ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-[#EFF6FF] text-[#1E40AF] border border-[#BFDBFE]">
                            <Lock className="w-2.5 h-2.5" /> Automático · {propuesta.datos?.priorizada ? `+${c.puntaje_max} pts (priorizada)` : "0 pts (no priorizada)"}
                          </span>
                        ) : sumaRanking ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-[#E8F3F0] text-[#0F5E54] border border-[#CDE7E1]">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#14776A]"></span>
                            Suma al ranking · hasta {c.puntaje_max} pts
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]"></span>
                            Solo desempate (no suma)
                          </span>
                        )}
                      </div>
                      {isAuto ? (
                        <p className="text-[12px] text-[#1E40AF] mt-1 leading-snug">
                          Puntaje asignado automáticamente por el sistema según marcación de la propuesta (PDET / Sentencia Río Atrato / Río Cauca). <strong>El jurado no puede modificarlo.</strong>
                        </p>
                      ) : c.descripcion && <p className="text-[12px] text-muted-foreground mt-1 leading-snug">{c.descripcion}</p>}
                    </div>

                    <div className="shrink-0 text-right">
                      <Input
                        type="number"
                        data-testid={`eval-input-${c.id}`}
                        disabled={isLocked || isAuto}
                        readOnly={isAuto}
                        min={c.puntaje_min} max={c.puntaje_max} step="0.1"
                        value={isAuto ? autoValue : (puntajes[c.id] ?? "")}
                        onChange={(e) => !isAuto && setPunt(c, e.target.value)}
                        onKeyDown={(e) => {
                          // Bloquear "e", "+", "-" para evitar exponenciales y signos
                          if (["e", "E", "+"].includes(e.key)) e.preventDefault();
                        }}
                        onBlur={(e) => {
                          // Forzar reclamping en blur (por si el browser dejó pasar algo)
                          if (!isAuto && e.target.value !== "") setPunt(c, e.target.value);
                        }}
                        className={`w-28 rounded-lg text-right font-display font-extrabold text-[20px] tabular-nums pr-3 ${isAuto ? "border-[#BFDBFE] bg-[#EFF6FF]/60 text-[#1E40AF] cursor-not-allowed" : sumaRanking ? "border-[#CDE7E1] focus-visible:ring-[#14776A]" : "border-[#FDE68A] focus-visible:ring-[#F59E0B]"}`}
                        placeholder="—"
                      />
                      <div className="text-[10px] mt-1 text-muted-foreground font-mono">rango {c.puntaje_min}–{c.puntaje_max}</div>
                    </div>
                  </div>

                  {hasValue && (
                    <div className="mt-3 h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                      <div className={`h-full transition-all ${isAuto ? "bg-[#3B82F6]" : sumaRanking ? "bg-[#14776A]" : "bg-[#F59E0B]"}`} style={{ width: `${pct}%` }}></div>
                    </div>
                  )}

                  <div className="mt-3 grid lg:grid-cols-[1fr_auto] gap-2 items-end">
                    <Textarea
                      data-testid={`eval-obs-${c.id}`}
                      disabled={isLocked}
                      rows={2}
                      placeholder={c.observacion_obligatoria ? "Observación obligatoria * — sustenta tu puntaje…" : "Observación (opcional) — sustenta tu puntaje…"}
                      value={observaciones[c.id] || ""}
                      onChange={(e) => setObs(c.id, e.target.value)}
                      className={`rounded-lg text-[13px] resize-none ${c.observacion_obligatoria && !((observaciones[c.id] || "").trim()) ? "border-amber-400 ring-1 ring-amber-200" : ""}`}
                    />
                    {!isLocked && (
                      <button type="button" onClick={() => sugerirObs(c.id)} data-testid={`ai-suggest-${c.id}`}
                              className="inline-flex items-center gap-1.5 text-[11px] text-[#14776A] hover:text-[#0F5E54] font-semibold whitespace-nowrap self-end mb-2">
                        <Sparkles className="w-3 h-3" /> Sugerir con IA
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Observación final + Totales */}
        <div className="mt-6 grid lg:grid-cols-[2fr_1fr] gap-4">
          <div className={`rounded-lg border bg-white p-4 ${(conv?.observacion_final_obligatoria !== false) && !obsFinal.trim() && !isLocked ? "border-amber-300 ring-1 ring-amber-100" : "border-border"}`}>
            <label className="text-[10px] uppercase tracking-[0.16em] font-display font-bold text-muted-foreground mb-2 block flex items-center gap-1">
              Observación final / Conclusiones
              {(conv?.observacion_final_obligatoria !== false) && <span className="text-red-500" title="Obligatoria">*</span>}
            </label>
            <Textarea
              data-testid="eval-obs-final"
              disabled={isLocked}
              rows={5}
              value={obsFinal}
              onChange={(e) => setObsFinal(e.target.value)}
              placeholder={(conv?.observacion_final_obligatoria !== false)
                ? "Obligatorio — Resume tus conclusiones, fortalezas, debilidades y recomendaciones de la evaluación…"
                : "Conclusiones y observaciones generales de la evaluación…"}
              className="rounded-sm"
            />
            {(conv?.observacion_final_obligatoria !== false) && (
              <p className="text-[10.5px] text-amber-700 mt-1.5 italic">
                Esta convocatoria exige conclusiones obligatorias antes de finalizar la evaluación.
              </p>
            )}
          </div>
          <div className="space-y-3">
            <div className="rounded-lg border border-[#CDE7E1] bg-gradient-to-br from-[#F0F7F5] to-white p-4">
              <div className="text-[10px] uppercase tracking-wider font-display font-bold text-[#0F5E54]">Total oficial</div>
              <div className="font-display font-black text-3xl tabular-nums mt-1">
                {totalOf.toFixed(1)} <span className="text-lg text-muted-foreground">/ {maxOf}</span>
              </div>
              <div className="mt-2 h-1.5 w-full bg-white rounded-full overflow-hidden border border-[#CDE7E1]">
                <div className="h-full bg-[#14776A]" style={{ width: `${pctTotal}%` }}></div>
              </div>
            </div>
            {propuesta.datos?.priorizada && (
              <div className="rounded-lg border border-[#3B82F6]/30 bg-[#EFF6FF] p-3 flex items-start gap-2">
                <Lock className="w-3.5 h-3.5 text-[#1E40AF] mt-0.5 shrink-0" />
                <div className="text-[11.5px] text-[#1E40AF] leading-snug">
                  Esta propuesta es <strong>priorizada</strong> (PDET / Río Atrato / Río Cauca). El sistema asignó automáticamente el puntaje máximo en el criterio <strong>Priorización</strong> y bloqueó su edición.
                </div>
              </div>
            )}
            <div className="rounded-lg border border-[#FDE68A] bg-[#FFFBEB]/40 p-4">
              <div className="text-[10px] uppercase tracking-wider font-display font-bold text-[#92400E]">Total diferencial</div>
              <div className="font-display font-black text-3xl tabular-nums mt-1 text-[#92400E]">{totalDif.toFixed(1)}</div>
              <div className="text-[10.5px] text-muted-foreground mt-1">No suma — solo desempate</div>
            </div>
          </div>
        </div>
      </div>

      {/* FICHA COMPLETA DRAWER */}
      <Drawer open={showFicha} onOpenChange={setShowFicha}>
        <DrawerContent className="max-w-2xl ml-auto">
          <DrawerHeader>
            <DrawerTitle className="font-display flex items-center gap-2">
              <Eye className="w-5 h-5 text-[#14776A]" />
              Ficha completa · {propuesta.codigo}
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

      {/* Modal de celebración al completar todas las evaluaciones */}
      <Dialog open={showCelebracion} onOpenChange={setShowCelebracion}>
        <DialogContent className="rounded-xl max-w-md p-0 overflow-hidden">
          <div className="bg-gradient-to-br from-[#14776A] to-[#0F5E54] text-white px-7 py-8 text-center">
            <div className="text-5xl mb-2">🎉</div>
            <DialogTitle className="font-display text-2xl font-bold mb-1">¡Felicitaciones!</DialogTitle>
            <p className="text-[13.5px] opacity-90">
              Has finalizado <strong>todas tus evaluaciones individuales</strong> en esta convocatoria.
            </p>
          </div>
          <div className="px-7 py-5 bg-white">
            <p className="text-[13px] text-[#1A1F2C] mb-4">
              El siguiente paso es <strong>firmar tu acta individual</strong>, que consolida todas tus evaluaciones en un único documento oficial con tu firma para los registros institucionales.
            </p>
            <ol className="text-[12.5px] text-muted-foreground space-y-1.5 mb-5 list-decimal pl-5">
              <li>Asegúrate de tener tu firma cargada en <strong>Mi Perfil</strong>.</li>
              <li>Dirígete a <strong>Actas</strong> y firma tu acta consolidada.</li>
              <li>Descarga el PDF para tu archivo personal.</li>
            </ol>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowCelebracion(false)} className="flex-1 rounded-md">Más tarde</Button>
              <Button onClick={() => { setShowCelebracion(false); navigate("/actas"); }} className="flex-1 bg-[#14776A] hover:bg-[#0F5E54] rounded-md gap-2" data-testid="celebracion-ir-actas">
                <PenLine className="w-4 h-4" /> Firmar mi acta
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
