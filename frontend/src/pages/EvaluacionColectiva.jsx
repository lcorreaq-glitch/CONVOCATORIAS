import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, formatApiError, openPdf } from "@/lib/api";
import { Badge, estadoTone } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ArrowLeft, Save, FileText, CheckCircle2 } from "lucide-react";

export default function EvaluacionColectiva() {
  const { id } = useParams();
  const [ev, setEv] = useState(null);
  const [propuesta, setPropuesta] = useState(null);
  const [terna, setTerna] = useState(null);
  const [criterios, setCriterios] = useState([]);
  const [puntajes, setPuntajes] = useState({});
  const [obs, setObs] = useState("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await api.get(`/evaluaciones-colectivas/${id}`);
        if (!mounted) return;
        const data = r.data;
        setEv(data);
        setPuntajes(data.puntajes || {});
        setObs(data.observacion_consolidada || "");
        const [p, t, c] = await Promise.all([
          api.get(`/propuestas/${data.propuesta_id}`),
          api.get(`/ternas?convocatoria_id=${data.convocatoria_id}`),
          api.get(`/criterios?convocatoria_id=${data.convocatoria_id}`),
        ]);
        setPropuesta(p.data);
        setTerna(t.data.find((x) => x.id === data.terna_id));
        setCriterios(c.data);
      } catch (e) { toast.error("No se pudo cargar"); }
    })();
    return () => { mounted = false; };
  }, [id]);

  const save = async (cerrar = false) => {
    try {
      const r = await api.patch(`/evaluaciones-colectivas/${id}`, { puntajes, observacion_consolidada: obs, cerrar });
      setEv(r.data);
      toast.success(cerrar ? "Evaluación colectiva cerrada" : "Cambios guardados");
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const acta = () => openPdf(`/actas/colectiva/${id}`);

  if (!ev || !propuesta) return <div className="p-10 text-muted-foreground">Cargando…</div>;

  const isClosed = ["Cerrada", "Firmada"].includes(ev.estado);

  return (
    <div className="flex-1 p-8 lg:p-10">
      <div className="flex items-start justify-between mb-6">
        <div>
          <Link to="/evaluaciones" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-2"><ArrowLeft className="w-4 h-4 mr-1" />Volver</Link>
          <div className="text-[10px] uppercase tracking-[0.18em] font-display font-bold text-emerald-700">Evaluación colectiva</div>
          <h1 className="font-display font-black text-3xl lg:text-4xl tracking-tight">{propuesta.codigo} · {propuesta.nombre}</h1>
          <p className="text-sm text-muted-foreground mt-1">Terna <strong>{terna?.codigo} · {terna?.nombre}</strong></p>
        </div>
        <div className="flex items-center gap-3">
          <Badge tone={estadoTone(ev.estado)}>{ev.estado}</Badge>
          {!isClosed && <Button onClick={() => save(false)} variant="outline" className="rounded-sm gap-2"><Save className="w-4 h-4" />Guardar</Button>}
          {!isClosed && <Button onClick={() => save(true)} className="bg-[#059669] hover:bg-[#047857] rounded-sm gap-2"><CheckCircle2 className="w-4 h-4" />Cerrar</Button>}
          <Button onClick={acta} variant="outline" className="rounded-sm gap-2"><FileText className="w-4 h-4" />Acta PDF</Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        <div className="border border-border rounded-sm bg-white p-6">
          <h3 className="font-display font-bold mb-4">Puntajes consolidados</h3>
          <div className="space-y-3">
            {criterios.map((c) => (
              <div key={c.id} className="flex items-center gap-3 py-2 border-b border-border last:border-b-0">
                <div className="flex-1">
                  <div className="font-semibold text-sm">{c.nombre}</div>
                  <div className="text-xs text-muted-foreground">{c.diferencial ? "Diferencial" : "Oficial"} · 0–{c.puntaje_max}</div>
                </div>
                <Input type="number" step="0.1" disabled={isClosed} className="w-24 rounded-sm font-mono text-right tabular-nums"
                       value={puntajes[c.id] ?? ""}
                       onChange={(e) => setPuntajes({ ...puntajes, [c.id]: e.target.value === "" ? "" : parseFloat(e.target.value) })}
                       data-testid={`col-input-${c.id}`} />
              </div>
            ))}
          </div>
          <div className="mt-6">
            <label className="text-[10px] uppercase tracking-[0.16em] font-display font-bold text-muted-foreground mb-2 block">Observación consolidada</label>
            <Textarea rows={5} disabled={isClosed} value={obs} onChange={(e) => setObs(e.target.value)} className="rounded-sm" data-testid="col-obs" />
          </div>
        </div>

        <div className="space-y-4">
          <div className="border border-border rounded-sm bg-white p-5">
            <div className="text-[10px] uppercase tracking-wider font-display font-bold text-muted-foreground">Puntaje final colectivo</div>
            <div className="font-display font-black text-4xl tabular-nums mt-1">{ev.puntaje_final ?? 0}</div>
          </div>
          <div className="border border-border rounded-sm bg-white p-5">
            <div className="text-[10px] uppercase tracking-wider font-display font-bold text-muted-foreground mb-2">Integrantes de la terna</div>
            <div className="space-y-1.5">
              {terna?.integrantes?.map((i) => (
                <div key={i.jurado_id} className="text-sm flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-emerald-600 rounded-full" /> {i.nombre}
                </div>
              ))}
            </div>
          </div>
          <div className="border border-border rounded-sm bg-white p-5">
            <div className="text-[10px] uppercase tracking-wider font-display font-bold text-muted-foreground mb-1">Individuales relacionadas</div>
            <div className="text-2xl font-display font-black tabular-nums">{ev.individuales_relacionadas?.length || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">El puntaje fue calculado como promedio.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
