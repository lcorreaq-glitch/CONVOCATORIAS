import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/PageHeader";
import { toast } from "sonner";
import { Database, Boxes, ClipboardList, Trophy, ChevronRight, ChevronLeft, CheckCircle2, AlertTriangle, Sparkles, FileText } from "lucide-react";

/**
 * Wizard amigable de 3 pasos para reusar la configuración de otra convocatoria.
 *
 * Props:
 *  - open, onOpenChange: control del Dialog
 *  - targetConvId, targetConvNombre: convocatoria destino
 *  - onDone: callback al terminar (recargar)
 *  - preselectedSourceId: si viene, salta al paso 2 con esa convocatoria
 */
export default function PlantillaWizard({ open, onOpenChange, targetConvId, targetConvNombre, onDone, preselectedSourceId }) {
  const [step, setStep] = useState(1);
  const [convs, setConvs] = useState([]);
  const [resumenes, setResumenes] = useState({}); // {convId: {counts: {...}}}
  const [sourceId, setSourceId] = useState("");
  const [incluir, setIncluir] = useState({ campos: true, catalogos: true, criterios: true, desempates: true });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [modo, setModo] = useState("agregar");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  // Reset al abrir
  useEffect(() => {
    if (!open) return;
    setStep(preselectedSourceId ? 2 : 1);
    setSourceId(preselectedSourceId || "");
    setIncluir({ campos: true, catalogos: true, criterios: true, desempates: true });
    setShowAdvanced(false);
    setModo("agregar");
    setResult(null);

    api.get("/convocatorias").then(async (r) => {
      const otras = r.data.filter((c) => c.id !== targetConvId);
      setConvs(otras);
      // Cargar resumen de cada una en paralelo para mostrar conteos
      const resumenesPorConv = await Promise.all(
        otras.map((c) => api.get(`/convocatorias/${c.id}/configuracion/resumen`).then((rr) => [c.id, rr.data]).catch(() => [c.id, null]))
      );
      setResumenes(Object.fromEntries(resumenesPorConv));
    });
  }, [open, targetConvId, preselectedSourceId]);

  const source = convs.find((c) => c.id === sourceId);
  const sourceCounts = resumenes[sourceId]?.counts || { campos: 0, catalogos: 0, criterios: 0, desempates: 0 };

  const totalACopiar =
    (incluir.campos ? sourceCounts.campos : 0) +
    (incluir.catalogos ? sourceCounts.catalogos : 0) +
    (incluir.criterios ? sourceCounts.criterios : 0) +
    (incluir.desempates ? sourceCounts.desempates : 0);

  const submit = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/convocatorias/${targetConvId}/configuracion/clonar`, {
        source_convocatoria_id: sourceId,
        modo,
        incluir_campos: incluir.campos,
        incluir_catalogos: incluir.catalogos,
        incluir_criterios: incluir.criterios,
        incluir_desempates: incluir.desempates,
      });
      setResult(data);
      onDone && onDone();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Error al copiar"); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-lg max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#14776A]" />
            <DialogTitle className="font-display">Usar otra convocatoria como plantilla</DialogTitle>
          </div>
          <p className="text-[12.5px] text-muted-foreground mt-1">
            Vas a copiar la configuración a <strong className="text-[#1A1F2C]">"{targetConvNombre}"</strong>.
            Esto NO copia propuestas ni evaluaciones — solo la <em>estructura</em> (campos, criterios, etc.).
          </p>
        </DialogHeader>

        {!result && (
          <Stepper step={step} />
        )}

        {/* PASO 1: elegir convocatoria origen */}
        {!result && step === 1 && (
          <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
            {convs.length === 0 && (
              <div className="text-center py-10 text-sm text-muted-foreground">
                No hay otras convocatorias disponibles para usar como plantilla.
              </div>
            )}
            {convs.map((c) => {
              const counts = resumenes[c.id]?.counts;
              const total = counts ? counts.campos + counts.catalogos + counts.criterios + counts.desempates : 0;
              const isSelected = sourceId === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => { setSourceId(c.id); setStep(2); }}
                  className={`w-full text-left border-2 ${isSelected ? "border-[#14776A] bg-[#F0F7F5]" : "border-border hover:border-[#CDE7E1]"} rounded-xl p-4 transition-colors`}
                  data-testid={`plantilla-source-${c.codigo}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge tone="muted">{c.codigo}</Badge>
                        <span className="font-display font-bold text-[15px]">{c.nombre}</span>
                      </div>
                      {c.descripcion && <p className="text-[12px] text-muted-foreground mt-1 line-clamp-2">{c.descripcion}</p>}
                    </div>
                    {total === 0 ? (
                      <Badge tone="warning">vacía</Badge>
                    ) : (
                      <div className="text-right shrink-0">
                        <div className="text-[24px] font-display font-extrabold text-[#14776A] tabular-nums leading-none">{total}</div>
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground mt-1">items</div>
                      </div>
                    )}
                  </div>
                  {counts && total > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                      <CountChip icon={Database} label="campos" value={counts.campos} color="#14776A" />
                      <CountChip icon={Boxes} label="catálogos" value={counts.catalogos} color="#1D4ED8" />
                      <CountChip icon={ClipboardList} label="criterios" value={counts.criterios} color="#B45309" />
                      <CountChip icon={Trophy} label="desempates" value={counts.desempates} color="#B42318" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* PASO 2: vista previa */}
        {!result && step === 2 && source && (
          <div className="space-y-3">
            <div className="text-[13px]">
              <span className="text-muted-foreground">Vas a copiar desde </span>
              <Badge tone="info">{source.codigo}</Badge>
              <span className="ml-1 font-semibold">{source.nombre}</span>
            </div>

            <div className="rounded-xl border border-border bg-white divide-y divide-border">
              <PreviewRow
                icon={Database} color="#14776A"
                title="Campos del formulario" count={sourceCounts.campos}
                desc="Lo que se pregunta al registrar una propuesta."
                checked={incluir.campos} onToggle={(v) => setIncluir({ ...incluir, campos: v })}
                testId="preview-campos"
              />
              <PreviewRow
                icon={Boxes} color="#1D4ED8"
                title="Listas reutilizables (catálogos)" count={sourceCounts.catalogos}
                desc="Opciones que alimentan los campos tipo lista."
                checked={incluir.catalogos} onToggle={(v) => setIncluir({ ...incluir, catalogos: v })}
                testId="preview-catalogos"
              />
              <PreviewRow
                icon={ClipboardList} color="#B45309"
                title="Criterios de evaluación" count={sourceCounts.criterios}
                desc="Lo que los jurados puntúan en cada propuesta."
                checked={incluir.criterios} onToggle={(v) => setIncluir({ ...incluir, criterios: v })}
                testId="preview-criterios"
              />
              <PreviewRow
                icon={Trophy} color="#B42318"
                title="Reglas de desempate" count={sourceCounts.desempates}
                desc="Cómo se resuelven empates en el ranking final."
                checked={incluir.desempates} onToggle={(v) => setIncluir({ ...incluir, desempates: v })}
                testId="preview-desempates"
              />
            </div>

            {/* Opciones avanzadas colapsadas */}
            <button
              onClick={() => setShowAdvanced((v) => !v)}
              className="text-[11.5px] text-[#5E6878] hover:text-[#14776A] underline underline-offset-2"
              data-testid="toggle-advanced"
            >
              {showAdvanced ? "▾" : "▸"} Opciones avanzadas (solo si sabes lo que haces)
            </button>
            {showAdvanced && (
              <div className="border border-border rounded-lg p-3 space-y-2 bg-secondary/30">
                <Label className="text-xs">¿Cómo manejar conflictos si ya existe un item con el mismo nombre?</Label>
                <div className="space-y-2">
                  <label className="flex items-start gap-2 cursor-pointer p-2 rounded-md hover:bg-white">
                    <input type="radio" checked={modo === "agregar"} onChange={() => setModo("agregar")} className="mt-1" />
                    <div>
                      <div className="text-[12.5px] font-semibold">Agregar solo lo nuevo <Badge tone="success">recomendado</Badge></div>
                      <div className="text-[11px] text-muted-foreground">No toca lo que ya existe. Solo trae items con nombres nuevos.</div>
                    </div>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer p-2 rounded-md hover:bg-white">
                    <input type="radio" checked={modo === "reemplazar"} onChange={() => setModo("reemplazar")} className="mt-1" />
                    <div>
                      <div className="text-[12.5px] font-semibold text-[#B42318] flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Reemplazar todo lo existente
                      </div>
                      <div className="text-[11px] text-muted-foreground">Borra los items actuales del tipo seleccionado y los reemplaza con los de la plantilla. <strong>Peligroso</strong> si ya tienes propuestas o evaluaciones.</div>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {/* Caja resumen */}
            <div className="rounded-xl bg-[#F0F7F5] border border-[#CDE7E1] p-3 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-[#14776A] shrink-0" />
              <div className="text-[13px]">
                Se copiarán <strong className="text-[#14776A] tabular-nums">{totalACopiar}</strong> items de "{source.nombre}" a "{targetConvNombre}".
                {modo === "agregar" && <span className="text-muted-foreground"> Items con el mismo nombre serán omitidos.</span>}
              </div>
            </div>
          </div>
        )}

        {/* RESULTADO */}
        {result && (
          <div className="space-y-3 py-2">
            <div className="rounded-xl bg-[#F0F7F5] border border-[#CDE7E1] p-4 flex items-start gap-3">
              <CheckCircle2 className="w-6 h-6 text-[#14776A] shrink-0" />
              <div>
                <div className="font-display font-bold text-[#0F5E54] text-[15px]">¡Listo! Plantilla aplicada</div>
                <div className="text-[12.5px] text-[#1A1F2C] mt-1">Se copió desde {result.origen} a {result.destino}.</div>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <StatBox icon={Database} color="#14776A" label="Campos" value={result.resultado.campos} />
              <StatBox icon={Boxes} color="#1D4ED8" label="Catálogos" value={result.resultado.catalogos} />
              <StatBox icon={ClipboardList} color="#B45309" label="Criterios" value={result.resultado.criterios} />
              <StatBox icon={Trophy} color="#B42318" label="Desempates" value={result.resultado.desempates} />
            </div>
            {result.resultado.saltados?.length > 0 && (
              <details className="text-xs text-muted-foreground border border-border rounded-lg p-2">
                <summary className="cursor-pointer font-semibold">
                  {result.resultado.saltados.length} item(s) omitidos por nombre duplicado
                </summary>
                <div className="mt-2 leading-relaxed">{result.resultado.saltados.join(" · ")}</div>
              </details>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {!result && step === 2 && !preselectedSourceId && (
            <Button variant="outline" onClick={() => setStep(1)} className="rounded-lg gap-1 mr-auto" data-testid="wizard-back">
              <ChevronLeft className="w-4 h-4" />Volver
            </Button>
          )}
          {!result ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-lg">Cancelar</Button>
              {step === 2 && (
                <Button
                  onClick={submit}
                  disabled={busy || totalACopiar === 0}
                  className="bg-[#14776A] hover:bg-[#0F5E54] rounded-lg gap-2"
                  data-testid="wizard-confirm"
                >
                  {busy ? "Copiando…" : <>Sí, copiar {totalACopiar} items <ChevronRight className="w-4 h-4" /></>}
                </Button>
              )}
            </>
          ) : (
            <Button onClick={() => onOpenChange(false)} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-lg" data-testid="wizard-close">Terminar</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stepper({ step }) {
  const steps = ["Elegir plantilla", "Vista previa", "Listo"];
  return (
    <div className="flex items-center gap-2 px-1 -mt-1 mb-2">
      {steps.map((s, i) => {
        const stepNum = i + 1;
        const isActive = stepNum === step;
        const isDone = stepNum < step;
        return (
          <React.Fragment key={s}>
            <div className={`flex items-center gap-1.5 text-[11.5px] font-semibold ${isActive ? "text-[#14776A]" : isDone ? "text-[#0F5E54]" : "text-muted-foreground"}`}>
              <span className={`w-5 h-5 rounded-full grid place-items-center text-[10px] font-bold ${isActive ? "bg-[#14776A] text-white" : isDone ? "bg-[#0F5E54] text-white" : "bg-secondary text-muted-foreground"}`}>{isDone ? "✓" : stepNum}</span>
              {s}
            </div>
            {stepNum < steps.length && <div className={`h-px flex-1 ${isDone ? "bg-[#0F5E54]" : "bg-border"}`} />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function CountChip({ icon: Icon, label, value, color }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-border text-[11px]">
      <Icon className="w-3 h-3" style={{ color }} />
      <strong className="tabular-nums">{value}</strong>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

function PreviewRow({ icon: Icon, color, title, count, desc, checked, onToggle, testId }) {
  return (
    <div className="p-3 flex items-center gap-3" data-testid={testId}>
      <div className="w-8 h-8 rounded-lg grid place-items-center shrink-0" style={{ background: `${color}15`, color }}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[13.5px] flex items-center gap-2">
          {title}
          <span className="text-[11px] font-mono text-muted-foreground tabular-nums">×{count}</span>
        </div>
        <div className="text-[11.5px] text-muted-foreground leading-snug">{desc}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onToggle} disabled={count === 0} />
    </div>
  );
}

function StatBox({ icon: Icon, color, label, value }) {
  return (
    <div className="rounded-lg border border-border bg-white p-2.5 text-center">
      <Icon className="w-4 h-4 mx-auto" style={{ color }} />
      <div className="text-[22px] font-display font-extrabold tabular-nums mt-1" style={{ color }}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
