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
  const [puntajes, setPuntajes] = useState({});
  const [observaciones, setObservaciones] = useState({});
  const [obsFinal, setObsFinal] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get(`/evaluaciones-individuales/${id}`).then((r) => {
      setEv(r.data);
      setPuntajes(r.data.puntajes || {});
      setObservaciones(r.data.observaciones || {});
      setObsFinal(r.data.observacion_final || "");
      return api.get(`/propuestas/${r.data.propuesta_id}`).then((p) => setPropuesta(p.data))
        .then(() => api.get(`/criterios?convocatoria_id=${r.data.convocatoria_id}`).then((c) => setCriterios(c.data)));
    }).catch(() => toast.error("No se pudo cargar la evaluación"));
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
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right mr-3">
            <div className="text-[10px] uppercase tracking-wider font-display font-bold text-muted-foreground">Total oficial</div>
            <div className="font-display font-black text-2xl tabular-nums">{total(true).toFixed(1)} <span className="text-base text-muted-foreground">/ 100</span></div>
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
          <div className="text-[10px] uppercase tracking-[0.18em] font-display font-bold text-muted-foreground mb-3">
            Expediente documental
          </div>
          <div className="bg-white border border-border rounded-sm p-5 space-y-4">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 font-display font-bold">Organización</div>
              <div className="font-semibold">{propuesta.organizacion || "—"}</div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 font-display font-bold">Subregión</div>
                <div>{propuesta.datos?.subregion || "—"}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 font-display font-bold">Municipio</div>
                <div>{propuesta.datos?.municipio || "—"}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 font-display font-bold">Línea</div>
                <div>{propuesta.datos?.linea || "—"}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 font-display font-bold">Temática</div>
                <div>{propuesta.datos?.tematica || "—"}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 font-display font-bold">Representante</div>
                <div>{propuesta.datos?.representante_legal || "—"}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 font-display font-bold">Radicación</div>
                <div className="font-mono text-xs">{propuesta.datos?.fecha_radicacion} {propuesta.datos?.hora_radicacion}</div>
              </div>
            </div>
            <div className="pt-3 border-t border-border">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 font-display font-bold">Documentos</div>
              {propuesta.datos?.link_expediente ? (
                <a href={propuesta.datos.link_expediente} target="_blank" rel="noreferrer"
                   className="inline-flex items-center gap-2 px-3 py-2 bg-[#14776A] hover:bg-[#0F5E54] text-white rounded-sm text-sm font-semibold transition-colors w-full justify-center">
                  <ExternalLink className="w-4 h-4" /> Abrir expediente (Google Drive)
                </a>
              ) : (
                <p className="text-xs text-muted-foreground">Sin link de expediente registrado.</p>
              )}
            </div>
          </div>
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
          <div className="space-y-4">
            {criterios.map((c) => (
              <div key={c.id} className="border border-border rounded-sm p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <div className="font-display font-bold text-sm">{c.nombre}</div>
                      {c.diferencial ? <Badge tone="warning">diferencial</Badge> : <Badge tone="success">oficial</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{c.descripcion}</p>
                  </div>
                  <div className="text-right">
                    <Input
                      type="number"
                      data-testid={`eval-input-${c.id}`}
                      disabled={isLocked}
                      min={c.puntaje_min}
                      max={c.puntaje_max}
                      step="0.1"
                      value={puntajes[c.id] ?? ""}
                      onChange={(e) => setPunt(c.id, e.target.value)}
                      className="w-24 rounded-sm font-mono text-right tabular-nums"
                      placeholder={`${c.puntaje_min}–${c.puntaje_max}`}
                    />
                    <div className="text-[10px] mt-1 text-muted-foreground font-mono">máx {c.puntaje_max}</div>
                  </div>
                </div>
                <Textarea
                  data-testid={`eval-obs-${c.id}`}
                  disabled={isLocked}
                  rows={2}
                  placeholder="Observación (opcional)"
                  value={observaciones[c.id] || ""}
                  onChange={(e) => setObs(c.id, e.target.value)}
                  className="rounded-sm text-sm"
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
            ))}
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
