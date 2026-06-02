import React, { useEffect, useState } from "react";
import { api, downloadFile } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader from "@/components/PageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { TID } from "@/constants/testIds";

const REPORTES = [
  { key: "avance-jurado", label: "Avance por jurado", cols: ["jurado", "correo", "propuestas_asignadas", "evaluaciones_iniciadas", "evaluaciones_finalizadas", "evaluaciones_firmadas", "pendientes", "porcentaje_avance"] },
  { key: "avance-terna", label: "Avance por terna", cols: ["codigo", "nombre", "integrantes", "propuestas_asignadas", "colectivas_abiertas", "colectivas_cerradas", "porcentaje_avance"] },
  { key: "consolidado-individual", label: "Consolidado evaluación individual", cols: ["propuesta_codigo", "propuesta_nombre", "organizacion", "jurado", "puntaje_total", "observacion_final", "estado", "fecha_finalizacion"] },
];

export default function Reportes() {
  const { activeConvocatoriaId } = useAuth();
  const [active, setActive] = useState("avance-jurado");
  const [data, setData] = useState({});

  useEffect(() => {
    if (!activeConvocatoriaId) return;
    REPORTES.forEach((r) =>
      api.get(`/reportes/${r.key}?convocatoria_id=${activeConvocatoriaId}`).then((res) => setData((d) => ({ ...d, [r.key]: res.data })))
    );
  }, [activeConvocatoriaId]);

  const exportX = (key) => downloadFile(`/reportes/export-excel?reporte=${key}&convocatoria_id=${activeConvocatoriaId}`, `${key}.xlsx`);

  if (!activeConvocatoriaId) return <div className="p-10 text-muted-foreground">Selecciona una convocatoria.</div>;

  return (
    <div className="flex-1 p-8 lg:p-10">
      <PageHeader
        eyebrow="Tableros operativos"
        title="Reportes"
        subtitle="Consulta y exporta reportes predefinidos para seguimiento, control y toma de decisiones."
      />
      <Tabs value={active} onValueChange={setActive}>
        <TabsList className="rounded-sm bg-secondary p-1">
          {REPORTES.map((r) => (
            <TabsTrigger key={r.key} value={r.key} className="rounded-sm" data-testid={`report-tab-${r.key}`}>{r.label}</TabsTrigger>
          ))}
        </TabsList>

        {REPORTES.map((r) => (
          <TabsContent key={r.key} value={r.key} className="mt-5">
            <div className="flex justify-end mb-3">
              <Button onClick={() => exportX(r.key)} variant="outline" className="rounded-sm gap-2" data-testid={`${TID.exportExcelBtn}-${r.key}`}>
                <Download className="w-4 h-4" /> Exportar Excel
              </Button>
            </div>
            <div className="border border-border rounded-sm bg-white overflow-x-auto">
              <table className="w-full dense-table">
                <thead><tr>{r.cols.map((c) => <th key={c}>{c.replace(/_/g, " ")}</th>)}</tr></thead>
                <tbody>
                  {(data[r.key] || []).map((row, i) => {
                    const k = row.id || row.codigo || row.email || `${r.key}-${i}`;
                    return (
                      <tr key={k}>{r.cols.map((c) => <td key={c} className={typeof row[c] === "number" ? "font-mono tabular-nums" : ""}>{row[c] ?? "—"}</td>)}</tr>
                    );
                  })}
                  {!data[r.key]?.length && <tr><td colSpan={r.cols.length} className="text-center text-sm text-muted-foreground py-8">Sin datos</td></tr>}
                </tbody>
              </table>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
