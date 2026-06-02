import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api, formatApiError, openPdf } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Badge, estadoTone } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ArrowLeft, Save, FileText, CheckCircle2, EyeOff, Sparkles, Lock, ArrowRight, Info } from "lucide-react";

export default function EvaluacionColectiva() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [ev, setEv] = useState(null);
  const [conv, setConv] = useState(null);
  const [propuesta, setPropuesta] = useState(null);
  const [terna, setTerna] = useState(null);
  const [criterios, setCriterios] = useState([]);
  const [puntajes, setPuntajes] = useState({});
  const [obs, setObs] = useState("");
  const [v2List, setV2List] = useState([]);
  const [ciego, setCiego] = useState(true);

  const reload = async () => {
    const r = await api.get(`/evaluaciones-colectivas/${id}`);
    setEv(r.data);
    setPuntajes(r.data.puntajes || {});
    setObs(r.data.observacion_consolidada || "");
    const [p, t, c, cv] = await Promise.all([
      api.get(`/propuestas/${r.data.propuesta_id}`),
      api.get(`/ternas?convocatoria_id=${r.data.convocatoria_id}`),
      api.get(`/criterios?convocatoria_id=${r.data.convocatoria_id}`),
      api.get(`/convocatorias/${r.data.convocatoria_id}`),
    ]);
    setPropuesta(p.data);
    setTerna(t.data.find((x) => x.id === r.data.terna_id));
    setCriterios(c.data);
    setConv(cv.data);
    try {
      const v2r = await api.get(`/evaluaciones-colectivas/${id}/v2`);
      setV2List(v2r.data.items || []);
      setCiego(v2r.data.ciego_activo);
    } catch { setV2List([]); }
  };
  useEffect(() => { reload(); }, [id]);

  if (!ev || !propuesta) return <div className="p-10 text-sm text-[#5E6878]">Cargando…</div>;

  const modalidad = conv?.modalidad_evaluacion_colectiva || "promedio_individuales";
  const isClosed = ["Cerrada", "Firmada"].includes(ev.estado);
  const isAdmin = ["admin_general", "admin_convocatoria"].includes(user?.role);
  const isModal2 = modalidad === "nueva_evaluacion";

  // ===== modalidad 1: promedio etapa individual =====
  const save = async (cerrar = false) => {
    try {
      const r = await api.patch(`/evaluaciones-colectivas/${id}`, { puntajes, observacion_consolidada: obs, cerrar });
      setEv(r.data);
      toast.success(cerrar ? "Cerrada" : "Guardado");
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  // ===== modalidad 2: nueva evaluación individual por la terna =====
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
  const acta = () => openPdf(`/actas/colectiva/${id}`);

  const myV2 = v2List.find((x) => terna?.integrantes?.some((i) => i.jurado_id === x.jurado_id && user?.email && i.nombre)); // simplistic
  const totals = (criterios, p, oficial = true) => criterios.filter((c) => oficial ? c.oficial : !c.oficial).reduce((s, c) => s + (parseFloat(p[c.id]) || 0), 0);

  return (
    <div className="flex-1 p-8 lg:p-10">
      <div className="flex items-start justify-between mb-6">
        <div>
          <Link to="/evaluaciones" className="inline-flex items-center text-sm text-[#5E6878] hover:text-[#1A1F2C] mb-2"><ArrowLeft className="w-4 h-4 mr-1" />Volver</Link>
          <div className="text-[10.5px] uppercase tracking-[0.18em] font-display font-bold text-[#14776A]">Evaluación colectiva</div>
          <h1 className="font-display font-extrabold text-[28px] lg:text-[36px] tracking-tight text-[#1A1F2C]">{propuesta.codigo} · {propuesta.nombre}</h1>
          <p className="text-sm text-[#5E6878] mt-1">Terna <strong>{terna?.codigo} · {terna?.nombre}</strong></p>
          <div className="mt-2 flex items-center gap-2 text-[12px]">
            <Badge tone={estadoTone(ev.estado)}>{ev.estado}</Badge>
            <Badge tone={isModal2 ? "info" : "muted"}>
              Modalidad: {isModal2 ? "Nueva evaluación por la terna (v2)" : "Promedio etapa individual"}
            </Badge>
            {ev.fuente_definitiva && <Badge tone="success">Fuente definitiva: {ev.fuente_definitiva.replace(/_/g, " ")}</Badge>}
          </div>
        </div>
        <Button onClick={acta} variant="outline" className="rounded-lg gap-2"><FileText className="w-4 h-4" />Acta PDF</Button>
      </div>

      {/* ============ MODALIDAD 2 ============ */}
      {isModal2 && (
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

          {/* Botón iniciar (solo si no se ha creado v2 todavía) */}
          {!v2List.length && (isAdmin || user?.role === "integrante_terna") && (
            <div className="border border-[#E2E7EC] rounded-xl bg-white p-6 shadow-card text-center">
              <Sparkles className="w-8 h-8 text-[#14776A] mx-auto mb-2" />
              <h3 className="font-display font-bold text-[16px]">Iniciar etapa colectiva</h3>
              <p className="text-[13px] text-[#5E6878] mt-1 max-w-md mx-auto">Se crearán evaluaciones individuales v2 para cada integrante de la terna, <strong>precargadas con sus puntajes y observaciones de la etapa individual (v1)</strong>. Cada jurado podrá ajustar tras la deliberación grupal.</p>
              <Button onClick={iniciarModalidad2} className="mt-4 bg-[#14776A] hover:bg-[#0F5E54] rounded-lg gap-2" data-testid="iniciar-modalidad-2-btn">
                <ArrowRight className="w-4 h-4" /> Iniciar etapa colectiva (crear v2)
              </Button>
            </div>
          )}

          {/* Lista de v2 */}
          {v2List.length > 0 && (
            <div className="border border-[#E2E7EC] rounded-xl bg-white p-5 shadow-card">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-display font-bold text-[16px]">Evaluaciones v2 (etapa colectiva)</h3>
                  <p className="text-[12.5px] text-[#5E6878]">{v2List.filter((x) => ["Finalizada", "Firmada"].includes(x.estado)).length} de {v2List.length} finalizadas</p>
                </div>
                {isAdmin && !isClosed && (
                  <Button onClick={cerrarConPromedioV2} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-lg gap-2" data-testid="cerrar-modal-2-btn">
                    <CheckCircle2 className="w-4 h-4" /> Cerrar y calcular promedio definitivo
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
                          {v.ciego ? <span className="text-[#9CA3AF] inline-flex items-center gap-1"><Lock className="w-3 h-3" />Ciego</span> : (v.puntaje_total ?? "—")}
                        </td>
                        <td className="text-xs text-[#5E6878]">{v.fecha_finalizacion ? new Date(v.fecha_finalizacion).toLocaleString("es-CO") : "—"}</td>
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

          {/* Resultado definitivo (cuando cerrada) */}
          {isClosed && (
            <div className="border-2 border-[#14776A] rounded-xl bg-[#F0F7F5] p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10.5px] uppercase tracking-[0.16em] font-display font-bold text-[#14776A]">Resultado definitivo</div>
                  <div className="text-[13px] text-[#5E6878] mt-1">Promedio de las {ev.v2_relacionadas?.length || 0} evaluaciones v2 finalizadas</div>
                </div>
                <div className="text-right">
                  <div className="font-display font-extrabold text-5xl tabular-nums text-[#1A1F2C] leading-none">{ev.puntaje_final ?? 0}</div>
                  <div className="text-[11px] text-[#5E6878] uppercase tracking-wider mt-1">de 100 oficial</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============ MODALIDAD 1 (promedio etapa individual) ============ */}
      {!isModal2 && (
        <div className="grid lg:grid-cols-[1fr_320px] gap-6">
          <div className="border border-[#E2E7EC] rounded-xl bg-white p-6 shadow-card">
            <div className="flex items-center gap-2 mb-1">
              <Info className="w-4 h-4 text-[#5E6878]" />
              <h3 className="font-display font-bold text-base">Puntajes (promedio de etapa individual)</h3>
            </div>
            <p className="text-[12.5px] text-[#5E6878] mb-4">Los puntajes se calcularon automáticamente como promedio de las evaluaciones individuales finalizadas. Puede ajustarlos antes de cerrar.</p>
            <div className="space-y-3">
              {criterios.map((c) => (
                <div key={c.id} className="flex items-center gap-3 py-2 border-b border-[#E2E7EC] last:border-b-0">
                  <div className="flex-1">
                    <div className="font-semibold text-sm">{c.nombre}</div>
                    <div className="text-xs text-[#5E6878]">{c.diferencial ? "Diferencial" : "Oficial"} · 0–{c.puntaje_max}</div>
                  </div>
                  <Input type="number" step="0.1" disabled={isClosed} className="w-24 rounded-lg font-mono text-right tabular-nums"
                         value={puntajes[c.id] ?? ""}
                         onChange={(e) => setPuntajes({ ...puntajes, [c.id]: e.target.value === "" ? "" : parseFloat(e.target.value) })} />
                </div>
              ))}
            </div>
            <div className="mt-6">
              <label className="text-[10.5px] uppercase tracking-[0.14em] font-display font-bold text-[#5E6878] mb-2 block">Observación consolidada</label>
              <Textarea rows={5} disabled={isClosed} value={obs} onChange={(e) => setObs(e.target.value)} className="rounded-lg" />
            </div>
            <div className="flex justify-end gap-2 mt-5">
              {!isClosed && <Button onClick={() => save(false)} variant="outline" className="rounded-lg gap-2"><Save className="w-4 h-4" />Guardar</Button>}
              {!isClosed && <Button onClick={() => save(true)} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-lg gap-2"><CheckCircle2 className="w-4 h-4" />Cerrar</Button>}
            </div>
          </div>

          <aside className="space-y-4">
            <div className="border border-[#E2E7EC] rounded-xl bg-white p-5 shadow-card">
              <div className="text-[10.5px] uppercase tracking-wider font-display font-bold text-[#5E6878]">Puntaje final colectivo</div>
              <div className="font-display font-extrabold text-[40px] tabular-nums mt-1 text-[#1A1F2C] leading-none">{ev.puntaje_final ?? 0}</div>
            </div>
            <div className="border border-[#E2E7EC] rounded-xl bg-white p-5 shadow-card">
              <div className="text-[10.5px] uppercase tracking-wider font-display font-bold text-[#5E6878] mb-2">Integrantes de la terna</div>
              <div className="space-y-1.5">
                {terna?.integrantes?.map((i) => (
                  <div key={i.jurado_id} className="text-sm flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-[#14776A] rounded-full" /> {i.nombre}
                  </div>
                ))}
              </div>
            </div>
            <div className="border border-[#E2E7EC] rounded-xl bg-white p-5 shadow-card">
              <div className="text-[10.5px] uppercase tracking-wider font-display font-bold text-[#5E6878] mb-1">Individuales relacionadas</div>
              <div className="text-3xl font-display font-extrabold tabular-nums">{ev.individuales_relacionadas?.length || 0}</div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
