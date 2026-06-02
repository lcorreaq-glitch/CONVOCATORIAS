import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api, formatApiError, openPdf } from "@/lib/api";
import { Badge, estadoTone } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ArrowLeft, ExternalLink, Save, CheckCircle2, PenLine, FileText, Lock, Sparkles } from "lucide-react";
import { TID } from "@/constants/testIds";

export default function EvaluacionIndividual() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [ev, setEv] = useState(null);
  const [propuesta, setPropuesta] = useState(null);
  const [criterios, setCriterios] = useState([]);
  const [campos, setCampos] = useState([]);
  const [catalogos, setCatalogos] = useState([]);
  const [conv, setConv] = useState(null);
  const [puntajes, setPuntajes] = useState({});
  const [observaciones, setObservaciones] = useState({});
  const [obsFinal, setObsFinal] = useState("");
  const [saving, setSaving] = useState(false);
  const [v1Ref, setV1Ref] = useState(null);

  useEffect(() => {
    api.get(`/evaluaciones-individuales/${id}`).then(async (r) => {
      setEv(r.data);
      setPuntajes(r.data.puntajes || {});
      setObservaciones(r.data.observaciones || {});
      setObsFinal(r.data.observacion_final || "");
      const p = await api.get(`/propuestas/${r.data.propuesta_id}`);
      setPropuesta(p.data);
      const cid = p.data.convocatoria_id;
      const [c, ca, cv] = await Promise.all([
        api.get(`/campos?convocatoria_id=${cid}&aplica_a=propuesta`),
        api.get(`/catalogos?convocatoria_id=${cid}`),
        api.get(`/convocatorias/${cid}`),
      ]);
      setCampos(c.data); setCatalogos(ca.data); setConv(cv.data);
      const crit = await api.get(`/criterios?convocatoria_id=${r.data.convocatoria_id}`);
      setCriterios(crit.data);
    }).catch(() => toast.error("No se pudo cargar la evaluación"));
    // Cargar referencia v1 si esta es una v2 (etapa colectiva)
    api.get(`/evaluaciones-individuales/${id}/referencia-v1`).then((r) => setV1Ref(r.data)).catch(() => setV1Ref(null));
  }, [id]);

  const setPunt = (cid, v) => setPuntajes({ ...puntajes, [cid]: v === "" ? "" : parseFloat(v) });
  const setObs = (cid, v) => setObservaciones({ ...observaciones, [cid]: v });

  const total = (oficial = true) =>
    criterios
      .filter((c) => (oficial ? c.oficial : !c.oficial))
      .reduce((s, c) => s + (parseFloat(puntajes[c.id]) || 0), 0);

  const save = async (finalize = false) => {
    setSaving(true);
    try {
      const r = await api.patch(`/evaluaciones-individuales/${id}`, {
        puntajes, observaciones, observacion_final: obsFinal, finalizar: finalize,
      });
      setEv(r.data);
      toast.success(finalize ? "Evaluación finalizada" : "Cambios guardados");
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    setSaving(false);
  };

  const firmar = async () => {
    try {
      await api.post(`/evaluaciones-individuales/${id}/firmar`);
      const r = await api.get(`/evaluaciones-individuales/${id}`);
      setEv(r.data);
      toast.success("Evaluación firmada");
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const downloadActa = () => openPdf(`/actas/individual/${id}`);

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

  if (!ev || !propuesta) return <div className="p-10 text-muted-foreground">Cargando…</div>;

  const isLocked = ["Bloqueada", "Firmada", "Anulada"].includes(ev.estado);

  return (
    <div className="flex-1 flex flex-col h-screen">
      <div className="border-b border-border bg-white px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/evaluaciones" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /></Link>
          <div>
            <div className="text-[10px] uppercase tracking-[0.16em] font-display font-bold text-[#0F5E54]">Evaluación individual</div>
            <div className="font-display font-bold text-lg leading-tight">{propuesta.codigo} · {propuesta.nombre}</div>
          </div>
          <Badge tone={estadoTone(ev.estado)}>{ev.estado}</Badge>
          {ev.etapa === "colectiva" && (
            <Badge tone="info">Etapa colectiva · v{ev.version || 2}</Badge>
          )}
          {ev.ciego_hasta_cierre && !["Cerrada", "Firmada"].includes(ev.estado) && (
            <Badge tone="warning">CIEGO · puntajes ocultos a pares</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right mr-3">
            <div className="text-[10px] uppercase tracking-wider font-display font-bold text-muted-foreground">Total oficial</div>
            <div className="font-display font-black text-2xl tabular-nums">{total(true).toFixed(1)} <span className="text-base text-muted-foreground">/ {conv?.configuracion?.puntaje_max_evaluacion || 100}</span></div>
          </div>
          {!isLocked && <Button onClick={() => save(false)} disabled={saving} variant="outline" className="rounded-sm gap-2" data-testid="save-eval-btn"><Save className="w-4 h-4" />Guardar</Button>}
          {ev.estado !== "Finalizada" && !isLocked && (
            <Button onClick={() => save(true)} disabled={saving} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-sm gap-2" data-testid={TID.finalizarEvalBtn}>
              <CheckCircle2 className="w-4 h-4" />Finalizar
            </Button>
          )}
          {ev.estado === "Finalizada" && (
            <Button onClick={firmar} className="bg-[#0F5E54] hover:bg-[#0B4A42] rounded-sm gap-2" data-testid={TID.firmarEvalBtn}><PenLine className="w-4 h-4" />Firmar</Button>
          )}
          {(ev.estado === "Firmada" || ev.estado === "Finalizada") && (
            <Button onClick={downloadActa} variant="outline" className="rounded-sm gap-2" data-testid="download-acta-btn"><FileText className="w-4 h-4" />Acta PDF</Button>
          )}
        </div>
      </div>

      {/* Split pane */}
      <div className="flex-1 grid lg:grid-cols-2 overflow-hidden">
        {/* Left: Expediente */}
        <div className="border-r border-border bg-secondary/30 overflow-y-auto p-6">
          <div className="text-[10px] uppercase tracking-[0.18em] font-display font-bold text-muted-foreground mb-2">
            Convocatoria
          </div>
          {conv && (
            <div className="bg-gradient-to-br from-[#F0F7F5] to-white border border-[#CDE7E1] rounded-lg p-3 mb-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge tone="muted">{conv.codigo}</Badge>
                <span className="font-display font-bold text-[14px]">{conv.nombre}</span>
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">{conv.estado} · {conv.etapa_actual || "—"}</div>
            </div>
          )}
          <div className="text-[10px] uppercase tracking-[0.18em] font-display font-bold text-muted-foreground mb-3">
            Información de la propuesta
          </div>
          <div className="bg-white border border-border rounded-sm p-5 space-y-4">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 font-display font-bold">Organización</div>
              <div className="font-semibold">{propuesta.organizacion || propuesta.datos?.nombre_organizacion || "—"}</div>
            </div>
            {/* Campos dinámicos con uso_actas o uso_lista */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              {campos.filter((c) => (c.uso_actas || c.uso_lista) && !["nombre_organizacion", "link_expediente"].includes(c.nombre_interno)).map((c) => {
                const v = propuesta.datos?.[c.nombre_interno];
                let display = v === null || v === undefined || v === "" ? "—" : v;
                if (Array.isArray(v)) display = v.join(", ");
                if (c.tipo === "si_no") display = v ? "Sí" : "No";
                return (
                  <div key={c.id}>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 font-display font-bold">{c.nombre_visible}</div>
                    <div className={c.tipo === "fecha" || c.tipo === "hora" ? "font-mono text-xs" : ""}>{display}</div>
                  </div>
                );
              })}
            </div>
            {propuesta.datos?.link_expediente && (
              <div className="pt-3 border-t border-border">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 font-display font-bold">Documentos</div>
                <a href={propuesta.datos.link_expediente} target="_blank" rel="noreferrer"
                   className="inline-flex items-center gap-2 px-3 py-2 bg-[#14776A] hover:bg-[#0F5E54] text-white rounded-sm text-sm font-semibold transition-colors w-full justify-center">
                  <ExternalLink className="w-4 h-4" /> Abrir expediente
                </a>
              </div>
            )}
          </div>
          {v1Ref && ev.etapa === "colectiva" && (
            <div className="bg-white border border-[#14776A]/30 rounded-sm p-4 mt-4">
              <div className="text-[10px] uppercase tracking-[0.16em] font-display font-bold text-[#14776A] mb-2">
                Referencia · Tu evaluación de la etapa individual (v1)
              </div>
              <p className="text-[11px] text-[#5E6878] mb-3">Esta evaluación fue precargada con estos valores. Ajusta tras la deliberación grupal.</p>
              <div className="space-y-1.5">
                {criterios.map((c) => (
                  <div key={c.id} className="flex justify-between text-[12px] py-1 border-b border-[#F1F4F7] last:border-b-0">
                    <span className="text-[#3F4856]">{c.nombre}</span>
                    <span className="font-mono tabular-nums font-semibold">{v1Ref.puntajes?.[c.id] ?? "—"}</span>
                  </div>
                ))}
                <div className="flex justify-between text-[12.5px] pt-2 mt-2 border-t border-[#14776A]/30 font-bold">
                  <span>Total v1</span>
                  <span className="font-mono tabular-nums">{v1Ref.puntaje_total ?? 0} / {conv?.configuracion?.puntaje_max_evaluacion || 100}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right: Form */}
        <div className="overflow-y-auto p-6 bg-white">
          <div className="text-[10px] uppercase tracking-[0.18em] font-display font-bold text-muted-foreground mb-3">
            Criterios de evaluación
          </div>
          {isLocked && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-sm flex items-center gap-2 text-sm">
              <Lock className="w-4 h-4 text-amber-700" /> Esta evaluación está en estado <strong>{ev.estado}</strong> y no puede editarse.
            </div>
          )}
          <div className="space-y-3">
            {criterios.map((c) => {
              const sumaRanking = !c.diferencial;
              const v = puntajes[c.id];
              const hasValue = v !== "" && v !== undefined && v !== null;
              const pct = hasValue && c.puntaje_max ? Math.min(100, Math.max(0, (Number(v) / c.puntaje_max) * 100)) : 0;
              return (
                <div key={c.id} className={`rounded-lg border bg-white overflow-hidden shadow-sm ${sumaRanking ? "border-[#CDE7E1]" : "border-[#FDE68A]"}`}>
                  {/* Header bar coloreado */}
                  <div className={`h-1 w-full ${sumaRanking ? "bg-[#14776A]" : "bg-[#F59E0B]"}`}></div>
                  <div className="p-4">
                    <div className="flex items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-display font-bold text-[14.5px] text-[#1A1F2C]">{c.nombre}</h4>
                          {sumaRanking ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-[#E8F3F0] text-[#0F5E54] border border-[#CDE7E1]" title="Este criterio suma al puntaje total y afecta el ranking final">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#14776A]"></span>
                              Suma al ranking · hasta {c.puntaje_max} pts
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]" title="Este criterio NO suma al puntaje total. Solo se usa para resolver empates en el ranking.">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]"></span>
                              Solo para desempate (no suma)
                            </span>
                          )}
                        </div>
                        {c.descripcion && <p className="text-[12px] text-muted-foreground mt-1 leading-snug">{c.descripcion}</p>}
                      </div>

                      {/* Input puntaje grande y visible */}
                      <div className="shrink-0 text-right">
                        <div className="relative">
                          <Input
                            type="number"
                            data-testid={`eval-input-${c.id}`}
                            disabled={isLocked}
                            min={c.puntaje_min} max={c.puntaje_max} step="0.1"
                            value={puntajes[c.id] ?? ""}
                            onChange={(e) => setPunt(c.id, e.target.value)}
                            className={`w-28 rounded-lg text-right font-display font-extrabold text-[20px] tabular-nums pr-3 ${sumaRanking ? "border-[#CDE7E1] focus-visible:ring-[#14776A]" : "border-[#FDE68A] focus-visible:ring-[#F59E0B]"}`}
                            placeholder="—"
                          />
                        </div>
                        <div className="text-[10px] mt-1 text-muted-foreground font-mono">rango {c.puntaje_min}–{c.puntaje_max}</div>
                      </div>
                    </div>

                    {/* Barra de progreso */}
                    {hasValue && (
                      <div className="mt-3 h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                        <div className={`h-full transition-all ${sumaRanking ? "bg-[#14776A]" : "bg-[#F59E0B]"}`} style={{ width: `${pct}%` }}></div>
                      </div>
                    )}

                    {/* Observación */}
                    <div className="mt-3">
                      <Textarea
                        data-testid={`eval-obs-${c.id}`}
                        disabled={isLocked}
                        rows={2}
                        placeholder="Observación (opcional) — sustenta tu puntaje…"
                        value={observaciones[c.id] || ""}
                        onChange={(e) => setObs(c.id, e.target.value)}
                        className="rounded-lg text-[13px] resize-none"
                      />
                      {!isLocked && (
                        <div className="flex justify-end mt-1.5">
                          <button type="button" onClick={() => sugerirObs(c.id)} data-testid={`ai-suggest-${c.id}`}
                                  className="inline-flex items-center gap-1.5 text-[11px] text-[#14776A] hover:text-[#0F5E54] font-semibold">
                            <Sparkles className="w-3 h-3" /> Sugerir con IA
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-6">
            <label className="text-[10px] uppercase tracking-[0.16em] font-display font-bold text-muted-foreground mb-2 block">
              Observación final
            </label>
            <Textarea
              data-testid="eval-obs-final"
              disabled={isLocked}
              rows={4}
              value={obsFinal}
              onChange={(e) => setObsFinal(e.target.value)}
              placeholder="Conclusiones y observaciones generales de la evaluación…"
              className="rounded-sm"
            />
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="border border-border rounded-sm p-4">
              <div className="text-[10px] uppercase tracking-wider font-display font-bold text-muted-foreground">Total oficial</div>
              <div className="font-display font-black text-3xl tabular-nums mt-1">{total(true).toFixed(1)} <span className="text-lg text-muted-foreground">/ 100</span></div>
            </div>
            <div className="border border-border rounded-sm p-4">
              <div className="text-[10px] uppercase tracking-wider font-display font-bold text-muted-foreground">Total diferencial</div>
              <div className="font-display font-black text-3xl tabular-nums mt-1">{total(false).toFixed(1)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
