import React, { useEffect, useMemo, useState } from "react";
import { api, downloadFile } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader from "@/components/PageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, Search } from "lucide-react";
import { TID } from "@/constants/testIds";

// Reportes con columnas FIJAS (no dependen de criterios dinámicos)
const REPORTES_FIJOS = [
  { key: "avance-jurado", label: "Avance por jurado",
    cols: ["jurado", "correo", "propuestas_asignadas", "evaluaciones_iniciadas", "evaluaciones_finalizadas", "evaluaciones_firmadas", "pendientes", "porcentaje_avance"] },
  { key: "avance-terna", label: "Avance por terna",
    cols: ["codigo", "nombre", "integrantes", "propuestas_asignadas", "colectivas_abiertas", "colectivas_cerradas", "porcentaje_avance"] },
];
// Reportes con columnas DINÁMICAS (basadas en criterios configurados)
const REPORTES_DINAMICOS = [
  { key: "consolidado-individual", label: "Consolidado evaluación individual",
    descripcion: "Una fila por (propuesta × jurado) con todos los criterios oficiales, sus puntajes y observaciones, criterios de priorización/desempate, y la observación general." },
  { key: "consolidado-colectiva", label: "Consolidado evaluación colectiva",
    descripcion: "Una fila por (propuesta × terna) con puntajes individuales de cada jurado, promedio validado y trazabilidad institucional. SIN observaciones por criterio (no aplica en la consolidada)." },
  { key: "consolidado-colectiva-detallado", label: "Detalle por jurado de evaluación colectiva (sábana)",
    descripcion: "Sábana completa: una fila por (propuesta × jurado) con TODOS los criterios oficiales (puntaje y observación), criterios de priorización/desempate y observación final. Equivalente al consolidado individual pero usando las V2 de la etapa colectiva." },
];

const REPORTES = [...REPORTES_FIJOS, ...REPORTES_DINAMICOS];

export default function Reportes() {
  const { activeConvocatoriaId } = useAuth();
  const [active, setActive] = useState("avance-jurado");
  const [data, setData] = useState({});
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!activeConvocatoriaId) return;
    REPORTES.forEach((r) =>
      api.get(`/reportes/${r.key}?convocatoria_id=${activeConvocatoriaId}`)
        .then((res) => setData((d) => ({ ...d, [r.key]: res.data })))
        .catch(() => setData((d) => ({ ...d, [r.key]: [] })))
    );
  }, [activeConvocatoriaId]);

  const exportX = (key) =>
    downloadFile(`/reportes/export-excel?reporte=${key}&convocatoria_id=${activeConvocatoriaId}`, `${key}.xlsx`);

  // Columnas dinámicas: las saca de la primera fila
  const dynamicCols = (key) => {
    const arr = data[key] || [];
    return arr.length ? Object.keys(arr[0]) : [];
  };
  const getCols = (r) => r.cols || dynamicCols(r.key);

  // Filtrado por búsqueda libre sobre TODOS los campos
  const filterRows = (rows) => {
    if (!q.trim()) return rows;
    const needle = q.toLowerCase();
    return rows.filter((row) =>
      Object.values(row).some((v) => String(v ?? "").toLowerCase().includes(needle))
    );
  };

  if (!activeConvocatoriaId) return <div className="p-10 text-muted-foreground">Selecciona una convocatoria.</div>;

  return (
    <div className="flex-1 p-8 lg:p-10">
      <PageHeader
        eyebrow="Tableros operativos"
        title="Reportes"
        subtitle="Consulta y exporta reportes predefinidos para seguimiento, control y toma de decisiones."
      />
      <Tabs value={active} onValueChange={setActive}>
        <TabsList className="rounded-sm bg-secondary p-1 flex-wrap h-auto">
          {REPORTES.map((r) => (
            <TabsTrigger key={r.key} value={r.key} className="rounded-sm" data-testid={`report-tab-${r.key}`}>
              {r.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {REPORTES.map((r) => {
          const cols = getCols(r);
          const rows = filterRows(data[r.key] || []);
          return (
            <TabsContent key={r.key} value={r.key} className="mt-5">
              <div className="flex flex-col gap-3 mb-3">
                {r.descripcion && (
                  <div className="text-[12.5px] text-muted-foreground border-l-2 border-[#CDE7E1] pl-3 italic">
                    {r.descripcion}
                  </div>
                )}
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                    <Input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Filtrar filas…"
                      className="rounded-md h-9 pl-8 text-[12.5px]"
                      data-testid={`report-filter-${r.key}`}
                    />
                  </div>
                  <div className="text-[12px] text-muted-foreground">
                    <strong className="font-mono tabular-nums">{rows.length}</strong> de{" "}
                    <strong className="font-mono tabular-nums">{(data[r.key] || []).length}</strong> filas ·{" "}
                    <strong className="font-mono tabular-nums">{cols.length}</strong> columnas
                  </div>
                  <Button
                    onClick={() => exportX(r.key)}
                    variant="outline"
                    className="rounded-sm gap-2"
                    data-testid={`${TID.exportExcelBtn}-${r.key}`}
                    disabled={!cols.length}
                  >
                    <Download className="w-4 h-4" /> Exportar Excel
                  </Button>
                </div>
              </div>
              <div className="border border-border rounded-sm bg-white overflow-x-auto">
                <table className="w-full dense-table">
                  <thead>
                    <tr>
                      {cols.map((c) => (
                        <th key={c} className="whitespace-nowrap text-[11px]">
                          {c.replace(/_/g, " ")}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => {
                      const k = row.id || row.codigo || row.email || row.propuesta_codigo || `${r.key}-${i}`;
                      return (
                        <tr key={k}>
                          {cols.map((c) => (
                            <td
                              key={c}
                              className={
                                typeof row[c] === "number"
                                  ? "font-mono tabular-nums text-right"
                                  : c.toLowerCase().includes("obs") || c.toLowerCase().includes("observac")
                                  ? "max-w-[36ch] text-[11.5px] align-top"
                                  : "text-[12px]"
                              }
                              title={typeof row[c] === "string" && row[c].length > 80 ? row[c] : undefined}
                            >
                              {row[c] ?? "—"}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                    {!rows.length && (
                      <tr>
                        <td colSpan={cols.length || 1} className="text-center text-sm text-muted-foreground py-8">
                          {q ? "Sin coincidencias del filtro" : "Sin datos"}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
