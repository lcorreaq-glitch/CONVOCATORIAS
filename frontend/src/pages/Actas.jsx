import React, { useEffect, useState } from "react";
import { api, API_BASE, openPdf } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader, { Badge } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { FileText, Download } from "lucide-react";

export default function Actas() {
  const { activeConvocatoriaId } = useAuth();
  const [evals, setEvals] = useState([]);
  const [colectivas, setColectivas] = useState([]);
  const [propuestas, setPropuestas] = useState([]);

  useEffect(() => {
    if (!activeConvocatoriaId) return;
    api.get(`/evaluaciones-individuales?convocatoria_id=${activeConvocatoriaId}`).then((r) => setEvals(r.data));
    api.get(`/evaluaciones-colectivas?convocatoria_id=${activeConvocatoriaId}`).then((r) => setColectivas(r.data));
    api.get(`/propuestas?convocatoria_id=${activeConvocatoriaId}`).then((r) => setPropuestas(r.data));
  }, [activeConvocatoriaId]);

  const propMap = Object.fromEntries(propuestas.map((p) => [p.id, p]));

  if (!activeConvocatoriaId) return <div className="p-10 text-muted-foreground">Selecciona una convocatoria.</div>;

  const finalizadas = evals.filter((e) => ["Finalizada", "Firmada"].includes(e.estado));
  const colCerradas = colectivas.filter((e) => ["Cerrada", "Firmada"].includes(e.estado));

  return (
    <div className="flex-1 p-8 lg:p-10">
      <PageHeader
        eyebrow="Documentos oficiales"
        title="Actas"
        subtitle="Genera actas oficiales en PDF a partir de evaluaciones finalizadas, evaluaciones colectivas cerradas o rankings producidos."
      />

      <div className="grid lg:grid-cols-2 gap-6">
        <section>
          <h3 className="font-display font-bold text-lg mb-3">Actas individuales · disponibles ({finalizadas.length})</h3>
          <div className="border border-border rounded-sm bg-white overflow-hidden">
            <table className="w-full dense-table">
              <thead><tr><th>Propuesta</th><th>Estado</th><th>Puntaje</th><th></th></tr></thead>
              <tbody>
                {finalizadas.map((e) => {
                  const p = propMap[e.propuesta_id];
                  return (
                    <tr key={e.id}>
                      <td><div className="font-mono text-xs text-muted-foreground">{p?.codigo}</div><div className="font-semibold">{p?.nombre}</div></td>
                      <td><Badge tone="success">{e.estado}</Badge></td>
                      <td className="font-mono tabular-nums">{e.puntaje_total}</td>
                      <td className="text-right">
                        <Button size="sm" variant="outline" className="rounded-sm gap-1.5" onClick={() => openPdf(`/actas/individual/${e.id}`)} data-testid={`acta-ind-${e.id}`}>
                          <Download className="w-3.5 h-3.5" />PDF
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {!finalizadas.length && <tr><td colSpan={4} className="text-center text-sm text-muted-foreground py-6">No hay evaluaciones individuales finalizadas.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h3 className="font-display font-bold text-lg mb-3">Actas colectivas · disponibles ({colCerradas.length})</h3>
          <div className="border border-border rounded-sm bg-white overflow-hidden">
            <table className="w-full dense-table">
              <thead><tr><th>Propuesta</th><th>Estado</th><th>Puntaje colectivo</th><th></th></tr></thead>
              <tbody>
                {colCerradas.map((e) => {
                  const p = propMap[e.propuesta_id];
                  return (
                    <tr key={e.id}>
                      <td><div className="font-mono text-xs text-muted-foreground">{p?.codigo}</div><div className="font-semibold">{p?.nombre}</div></td>
                      <td><Badge tone="success">{e.estado}</Badge></td>
                      <td className="font-mono tabular-nums">{e.puntaje_final}</td>
                      <td className="text-right">
                        <Button size="sm" variant="outline" className="rounded-sm gap-1.5" onClick={() => openPdf(`/actas/colectiva/${e.id}`)} data-testid={`acta-col-${e.id}`}>
                          <Download className="w-3.5 h-3.5" />PDF
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {!colCerradas.length && <tr><td colSpan={4} className="text-center text-sm text-muted-foreground py-6">No hay evaluaciones colectivas cerradas.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
