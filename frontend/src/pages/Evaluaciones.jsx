import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader, { Badge, estadoTone, EmptyState } from "@/components/PageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ClipboardCheck, ArrowRight } from "lucide-react";

export default function Evaluaciones() {
  const { activeConvocatoriaId, user } = useAuth();
  const [individuales, setIndividuales] = useState([]);
  const [colectivas, setColectivas] = useState([]);
  const [propuestas, setPropuestas] = useState([]);
  const [jurados, setJurados] = useState([]);
  const [ternas, setTernas] = useState([]);

  useEffect(() => {
    if (!activeConvocatoriaId) return;
    const url = user?.role === "jurado"
      ? `/evaluaciones-individuales?convocatoria_id=${activeConvocatoriaId}&mias=true`
      : `/evaluaciones-individuales?convocatoria_id=${activeConvocatoriaId}`;
    api.get(url).then((r) => setIndividuales(r.data));
    api.get(`/evaluaciones-colectivas?convocatoria_id=${activeConvocatoriaId}`).then((r) => setColectivas(r.data));
    api.get(`/propuestas?convocatoria_id=${activeConvocatoriaId}`).then((r) => setPropuestas(r.data));
    api.get(`/jurados?convocatoria_id=${activeConvocatoriaId}`).then((r) => setJurados(r.data));
    api.get(`/ternas?convocatoria_id=${activeConvocatoriaId}`).then((r) => setTernas(r.data));
  }, [activeConvocatoriaId, user]);

  const propMap = Object.fromEntries(propuestas.map((p) => [p.id, p]));
  const jurMap = Object.fromEntries(jurados.map((j) => [j.id, j]));
  const ternaMap = Object.fromEntries(ternas.map((t) => [t.id, t]));

  if (!activeConvocatoriaId) return <div className="p-10 text-muted-foreground">Selecciona una convocatoria.</div>;

  return (
    <div className="flex-1 p-8 lg:p-10">
      <PageHeader
        eyebrow="Proceso evaluador"
        title="Evaluaciones"
        subtitle={user?.role === "jurado" ? "Tus evaluaciones individuales asignadas." : "Seguimiento de todas las evaluaciones individuales y colectivas."}
      />

      <Tabs defaultValue="individuales">
        <TabsList className="rounded-sm bg-secondary p-1">
          <TabsTrigger value="individuales" className="rounded-sm" data-testid="tab-eval-individuales">Individuales ({individuales.length})</TabsTrigger>
          <TabsTrigger value="colectivas" className="rounded-sm" data-testid="tab-eval-colectivas">Colectivas ({colectivas.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="individuales" className="mt-6">
          <div className="border border-border rounded-sm bg-white overflow-x-auto">
            <table className="w-full dense-table">
              <thead><tr><th>Propuesta</th><th>Jurado</th><th>Estado</th><th>Puntaje</th><th>Última edición</th><th></th></tr></thead>
              <tbody>
                {individuales.map((e) => {
                  const p = propMap[e.propuesta_id];
                  const j = jurMap[e.jurado_id];
                  return (
                    <tr key={e.id} data-testid={`eval-row-${e.id}`}>
                      <td><div className="font-mono text-xs text-muted-foreground">{p?.codigo}</div><div className="font-semibold">{p?.nombre}</div></td>
                      <td>{j?.nombre || "—"}</td>
                      <td><Badge tone={estadoTone(e.estado)}>{e.estado}</Badge></td>
                      <td className="font-mono tabular-nums">{e.puntaje_total ?? 0} / 100</td>
                      <td className="text-xs text-muted-foreground">{e.fecha_ultima_edicion ? new Date(e.fecha_ultima_edicion).toLocaleString("es-CO") : "—"}</td>
                      <td className="text-right">
                        <Link to={`/evaluaciones/individual/${e.id}`} data-testid={`open-eval-${e.id}`} className="inline-flex items-center gap-1 text-emerald-700 hover:underline text-xs">
                          Abrir <ArrowRight className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {!individuales.length && <tr><td colSpan={6}><EmptyState title="Sin evaluaciones individuales" icon={ClipboardCheck} /></td></tr>}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="colectivas" className="mt-6">
          <div className="border border-border rounded-sm bg-white overflow-x-auto">
            <table className="w-full dense-table">
              <thead><tr><th>Propuesta</th><th>Terna</th><th>Estado</th><th>Puntaje colectivo</th><th></th></tr></thead>
              <tbody>
                {colectivas.map((e) => {
                  const p = propMap[e.propuesta_id];
                  const t = ternaMap[e.terna_id];
                  return (
                    <tr key={e.id}>
                      <td><div className="font-mono text-xs text-muted-foreground">{p?.codigo}</div><div className="font-semibold">{p?.nombre}</div></td>
                      <td>{t?.codigo} · {t?.nombre}</td>
                      <td><Badge tone={estadoTone(e.estado)}>{e.estado}</Badge></td>
                      <td className="font-mono tabular-nums">{e.puntaje_final ?? 0} / 100</td>
                      <td className="text-right">
                        <Link to={`/evaluaciones/colectiva/${e.id}`} className="inline-flex items-center gap-1 text-emerald-700 hover:underline text-xs">
                          Abrir <ArrowRight className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {!colectivas.length && <tr><td colSpan={5}><EmptyState title="Sin evaluaciones colectivas" hint="Asigna propuestas a ternas para iniciar la deliberación colectiva." icon={ClipboardCheck} /></td></tr>}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
