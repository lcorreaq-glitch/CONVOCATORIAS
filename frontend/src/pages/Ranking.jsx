import React, { useEffect, useState } from "react";
import { api, formatApiError, openPdf } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader, { Badge, EmptyState } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Trophy, Sparkles, FileText, Crown } from "lucide-react";
import { TID } from "@/constants/testIds";

export default function Ranking() {
  const { activeConvocatoriaId } = useAuth();
  const [rankings, setRankings] = useState([]);
  const [active, setActive] = useState(null);
  const [agrupar, setAgrupar] = useState("subregion");
  const [modo, setModo] = useState("colectivo");

  const load = () => activeConvocatoriaId && api.get(`/rankings?convocatoria_id=${activeConvocatoriaId}`).then((r) => {
    setRankings(r.data);
    if (r.data?.length && !active) setActive(r.data[0]);
  });
  useEffect(() => { load(); }, [activeConvocatoriaId]);

  const generar = async () => {
    try {
      const r = await api.post(`/rankings/generar?convocatoria_id=${activeConvocatoriaId}&agrupar_por=${agrupar}&modo=${modo}`);
      toast.success("Ranking generado");
      setActive(r.data);
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const acta = () => active && openPdf(`/actas/ranking/${active.id}`);

  if (!activeConvocatoriaId) return <div className="p-10 text-muted-foreground">Selecciona una convocatoria.</div>;

  return (
    <div className="flex-1 p-8 lg:p-10">
      <PageHeader
        eyebrow="Clasificación final"
        title="Ranking & Desempates"
        subtitle="Genera la clasificación de propuestas. Los desempates se aplican automáticamente siguiendo las reglas configuradas (mayor puntaje, fecha radicación, sorteo)."
        actions={
          <>
            <Select value={modo} onValueChange={setModo}>
              <SelectTrigger className="rounded-sm w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="colectivo">Modo colectivo</SelectItem>
                <SelectItem value="individual">Promedio individuales</SelectItem>
              </SelectContent>
            </Select>
            <Select value={agrupar} onValueChange={setAgrupar}>
              <SelectTrigger className="rounded-sm w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="subregion">Por subregión</SelectItem>
                <SelectItem value="linea">Por línea</SelectItem>
                <SelectItem value="tipo_organizacion">Por tipo organización</SelectItem>
                <SelectItem value="__general__">General</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={generar} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-sm gap-2" data-testid={TID.generarRankingBtn}>
              <Sparkles className="w-4 h-4" /> Generar
            </Button>
            {active && <Button onClick={acta} variant="outline" className="rounded-sm gap-2"><FileText className="w-4 h-4" />Acta PDF</Button>}
          </>
        }
      />

      {rankings.length > 0 && (
        <div className="mb-4 flex items-center gap-2 flex-wrap">
          {rankings.map((r) => (
            <button key={r.id} onClick={() => setActive(r)} className={`px-3 py-1 rounded-sm text-xs font-mono border transition-colors ${active?.id === r.id ? "bg-[#F0F7F5] border-[#CDE7E1] text-[#0F5E54]" : "bg-white border-border hover:bg-secondary"}`}>
              {new Date(r.fecha_generacion).toLocaleString("es-CO")} · {r.agrupacion}
            </button>
          ))}
        </div>
      )}

      {!active ? (
        <EmptyState title="Sin rankings generados" hint="Selecciona la agrupación y el modo, luego presiona Generar." icon={Trophy} />
      ) : (
        <div className="space-y-6">
          {active.grupos.map((g) => (
            <div key={g.grupo} className="border border-border rounded-sm bg-white overflow-hidden">
              <div className="px-5 py-3 border-b border-border bg-secondary flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.16em] font-display font-bold text-muted-foreground">{active.agrupacion}</div>
                  <div className="font-display font-bold text-lg">{g.grupo}</div>
                </div>
                <Badge tone="muted">{g.total} propuestas</Badge>
              </div>
              <table className="w-full dense-table" data-testid={TID.rankingTable}>
                <thead><tr><th>Puesto</th><th>Código</th><th>Propuesta</th><th>Organización</th><th>Puntaje</th><th>Diferencial</th><th>Desempate</th></tr></thead>
                <tbody>
                  {g.items.map((it) => (
                    <tr key={it.propuesta_id}>
                      <td className="font-display font-black text-lg tabular-nums">
                        {it.puesto === 1 ? <span className="inline-flex items-center gap-1 text-[#0F5E54]"><Crown className="w-4 h-4" />{it.puesto}</span> : it.puesto}
                      </td>
                      <td className="font-mono text-xs">{it.codigo}</td>
                      <td className="font-semibold">{it.nombre}</td>
                      <td className="text-muted-foreground">{it.organizacion || "—"}</td>
                      <td className="font-mono tabular-nums font-bold">{it.puntaje_total}</td>
                      <td className="font-mono tabular-nums text-muted-foreground">{it.puntaje_diferencial || 0}</td>
                      <td className="text-xs text-amber-700">{it.desempate_regla || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
