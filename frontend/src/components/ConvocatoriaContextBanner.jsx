import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/PageHeader";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Database, Boxes, ClipboardList, FileStack } from "lucide-react";
import { Link } from "react-router-dom";

/**
 * Banner que aparece en módulos dependientes de convocatoria (Propuestas, etc.)
 * Muestra en qué convocatoria está parado el usuario y permite cambiarla.
 * Incluye contadores rápidos y links de navegación a la configuración.
 */
export default function ConvocatoriaContextBanner({ counts = null }) {
  const { activeConvocatoriaId, setConv } = useAuth();
  const [convs, setConvs] = useState([]);
  const [auto, setAuto] = useState({ campos: 0, catalogos: 0, propuestas: 0 });

  useEffect(() => {
    api.get("/convocatorias").then((r) => setConvs(r.data));
  }, []);

  useEffect(() => {
    if (!activeConvocatoriaId || counts) return;
    Promise.all([
      api.get(`/campos?convocatoria_id=${activeConvocatoriaId}`),
      api.get(`/catalogos?convocatoria_id=${activeConvocatoriaId}`),
      api.get(`/propuestas?convocatoria_id=${activeConvocatoriaId}`),
    ]).then(([cs, ks, ps]) => setAuto({ campos: cs.data.length, catalogos: ks.data.length, propuestas: ps.data.length }))
      .catch(() => {});
  }, [activeConvocatoriaId, counts]);

  const conv = convs.find((c) => c.id === activeConvocatoriaId);
  const c = counts || auto;

  if (!conv) return null;

  return (
    <div className="mb-6 rounded-xl border border-[#CDE7E1] bg-gradient-to-br from-[#F0F7F5] to-white p-4">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] font-display font-bold text-[#14776A] shrink-0">
          <Sparkles className="w-3.5 h-3.5" />
          Estás trabajando en
        </div>
        <Select value={activeConvocatoriaId} onValueChange={setConv}>
          <SelectTrigger className="rounded-lg bg-white h-11 min-w-[300px] flex-1 max-w-xl font-semibold text-[14px]" data-testid="conv-banner-switcher">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {convs.map((c) => (
              <SelectItem key={c.id} value={c.id} className="py-2">
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-muted-foreground">{c.codigo}</span>
                    <span className="font-semibold">{c.nombre}</span>
                  </div>
                  <span className="text-[10.5px] text-muted-foreground">{c.estado} · {c.etapa_actual || "—"}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge tone="info">{conv.estado}</Badge>
          {conv.etapa_actual && <Badge tone="default">etapa: {conv.etapa_actual}</Badge>}
        </div>
      </div>

      {/* Counts + quick links */}
      <div className="mt-3 pt-3 border-t border-[#CDE7E1] flex items-center gap-4 flex-wrap">
        <ChipLink to="/configuracion" icon={Database} count={c.campos} label="campos" color="#14776A" testId="banner-link-campos" />
        <ChipLink to="/configuracion" icon={Boxes} count={c.catalogos} label="catálogos" color="#1D4ED8" testId="banner-link-catalogos" />
        <ChipLink to="/configuracion" icon={ClipboardList} count={c.criterios || 0} label="criterios" color="#B45309" hide={!counts} testId="banner-link-criterios" />
        <ChipLink to="/propuestas" icon={FileStack} count={c.propuestas} label="propuestas" color="#0F5E54" testId="banner-link-propuestas" />
        <div className="ml-auto text-[11.5px] text-[#5E6878]">
          ¿Necesitas cambiar la estructura?{" "}
          <Link to="/configuracion" className="text-[#14776A] font-semibold hover:underline" data-testid="banner-go-config">Ir a Configuración →</Link>
        </div>
      </div>
    </div>
  );
}

function ChipLink({ to, icon: Icon, count, label, color, hide, testId }) {
  if (hide) return null;
  return (
    <Link to={to} className="inline-flex items-center gap-1.5 hover:opacity-80 transition-opacity" data-testid={testId}>
      <Icon className="w-3.5 h-3.5" style={{ color }} />
      <span className="font-display font-extrabold tabular-nums text-[15px]" style={{ color }}>{count}</span>
      <span className="text-[12px] text-[#5E6878]">{label}</span>
    </Link>
  );
}
