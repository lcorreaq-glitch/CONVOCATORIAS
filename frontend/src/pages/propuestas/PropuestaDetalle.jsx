import React from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, ExternalLink, X, Building2, Calendar, MapPin, Tag } from "lucide-react";

function estadoTone(estado) {
  const e = (estado || "").toLowerCase();
  if (e.includes("habilitada")) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (e.includes("no habilitada")) return "bg-red-50 text-red-700 border-red-200";
  if (e.includes("subsanación") || e.includes("subsanacion")) return "bg-amber-50 text-amber-700 border-amber-200";
  if (e.includes("ganadora")) return "bg-violet-50 text-violet-700 border-violet-200";
  return "bg-slate-50 text-slate-700 border-slate-200";
}

function renderValue(v, campo, catalogos) {
  if (v === null || v === undefined || v === "") return <span className="text-muted-foreground">—</span>;
  if (Array.isArray(v)) return <span>{v.join(", ") || "—"}</span>;
  if (typeof v === "object") return <span className="font-mono text-[11px]">{JSON.stringify(v)}</span>;
  if (campo?.tipo === "fecha") return <span>{String(v)}</span>;
  if (campo?.tipo === "url") return <a href={v} target="_blank" rel="noreferrer" className="text-[#14776A] hover:underline inline-flex items-center gap-1"><ExternalLink className="w-3 h-3" />{v}</a>;
  return <span>{String(v)}</span>;
}

export default function PropuestaDetalle({ open, onOpenChange, propuesta, campos = [], catalogos = [], canEdit, onEdit }) {
  if (!propuesta) return null;
  const datos = propuesta.datos || {};

  // Agrupar campos en secciones
  const camposVisibles = campos.filter((c) => c.uso_propuesta !== false);
  const ordenSeccion = ["Identificación", "Organización", "Territorio", "Línea / Categoría", "Enfoque diferencial", "Documentación", "Otros"];
  const grupos = {};
  camposVisibles.forEach((c) => {
    const sec = c.seccion || "Otros";
    grupos[sec] = grupos[sec] || [];
    grupos[sec].push(c);
  });
  const secciones = ordenSeccion.filter((s) => grupos[s]).concat(Object.keys(grupos).filter((s) => !ordenSeccion.includes(s)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-xl max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="propuesta-detalle-dialog">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="text-[11px] uppercase tracking-[0.16em] font-bold text-[#14776A] mb-1">
                Propuesta · {propuesta.codigo}
              </div>
              <DialogTitle className="font-display text-[22px] leading-tight pr-8" data-testid="propuesta-detalle-titulo">
                {propuesta.nombre}
              </DialogTitle>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <span className={`px-2.5 py-1 text-[11px] rounded-full border font-semibold ${estadoTone(propuesta.estado)}`} data-testid="propuesta-detalle-estado">
                  {propuesta.estado || "—"}
                </span>
                {propuesta.organizacion && (
                  <span className="inline-flex items-center gap-1.5 text-[11.5px] text-[#5E6878]">
                    <Building2 className="w-3 h-3" /> {propuesta.organizacion}
                  </span>
                )}
                {propuesta.created_at && (
                  <span className="inline-flex items-center gap-1.5 text-[11.5px] text-[#5E6878]">
                    <Calendar className="w-3 h-3" /> {new Date(propuesta.created_at).toLocaleDateString("es-CO")}
                  </span>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="mt-4 space-y-5">
          {secciones.map((sec) => (
            <div key={sec} className="border border-[#E2E7EC] rounded-lg overflow-hidden">
              <div className="bg-[#F1F4F7] px-4 py-2.5 text-[11.5px] uppercase tracking-[0.14em] font-bold text-[#1A1F2C] font-display border-b border-[#E2E7EC] flex items-center gap-2">
                {sec === "Territorio" && <MapPin className="w-3.5 h-3.5 text-[#14776A]" />}
                {sec === "Organización" && <Building2 className="w-3.5 h-3.5 text-[#14776A]" />}
                {sec === "Línea / Categoría" && <Tag className="w-3.5 h-3.5 text-[#14776A]" />}
                {sec}
              </div>
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3 p-4 text-[13px]">
                {grupos[sec].map((c) => (
                  <div key={c.id} className="min-w-0">
                    <div className="text-[10.5px] uppercase tracking-[0.12em] font-bold text-[#5E6878] mb-0.5">
                      {c.nombre_visible}
                    </div>
                    <div className="text-[#1A1F2C] break-words">
                      {renderValue(datos[c.nombre_interno], c, catalogos)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Si no hay campos configurados, mostramos los datos raw */}
          {camposVisibles.length === 0 && (
            <div className="border border-dashed border-border rounded-lg p-4 text-sm">
              <pre className="text-[11px] whitespace-pre-wrap font-mono">{JSON.stringify(datos, null, 2)}</pre>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 mt-2">
          {canEdit && (
            <Button variant="outline" onClick={() => { onOpenChange(false); onEdit?.(propuesta); }} className="rounded-lg gap-2" data-testid="propuesta-detalle-edit">
              <Pencil className="w-4 h-4" /> Editar
            </Button>
          )}
          <Button onClick={() => onOpenChange(false)} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-lg gap-2" data-testid="propuesta-detalle-close">
            <X className="w-4 h-4" /> Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
