import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/PageHeader";
import { UserCog, Mail, Phone, MapPin, FileText, ExternalLink, Pencil } from "lucide-react";

/**
 * Vista de detalle del jurado (solo lectura, accesible para cualquier rol autenticado).
 * Muestra foto, datos completos, perfil, hoja de vida descargable y campos extra dinámicos.
 */
export default function JuradoDetalle({ open, onOpenChange, jurado, campos, onEdit, canEdit }) {
  if (!jurado) return null;
  const BASE_KEYS = new Set(["nombre", "email", "telefono", "perfil", "subregiones"]);
  const extras = campos.filter((c) => !BASE_KEYS.has(c.nombre_interno));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-lg max-w-3xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full overflow-hidden bg-secondary border border-[#CDE7E1] shrink-0">
              {jurado.foto_url
                ? <img src={jurado.foto_url} alt="" className="w-full h-full object-cover" />
                : <div className="w-full h-full grid place-items-center"><UserCog className="w-5 h-5 text-muted-foreground" /></div>}
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="font-display text-[18px]">{jurado.nombre}</DialogTitle>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <Badge tone="info">Jurado</Badge>
                <Badge tone={jurado.estado === "Activo" ? "success" : "muted"}>{jurado.estado || "Activo"}</Badge>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Contacto */}
          <section>
            <h3 className="text-[11px] uppercase tracking-[0.14em] font-display font-bold text-[#14776A] mb-2">Contacto</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <InfoRow icon={Mail} label="Email">{jurado.email}</InfoRow>
              <InfoRow icon={Phone} label="Teléfono">{jurado.telefono || <em className="text-muted-foreground">No registrado</em>}</InfoRow>
            </div>
          </section>

          {/* Subregiones */}
          <section>
            <h3 className="text-[11px] uppercase tracking-[0.14em] font-display font-bold text-[#14776A] mb-2 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" />Subregiones donde puede actuar
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {(jurado.subregiones || []).length > 0
                ? (jurado.subregiones || []).map((s) => <Badge key={s} tone="muted">{s}</Badge>)
                : <em className="text-xs text-muted-foreground">Ninguna asignada</em>}
            </div>
          </section>

          {/* Perfil */}
          {jurado.perfil && (
            <section>
              <h3 className="text-[11px] uppercase tracking-[0.14em] font-display font-bold text-[#14776A] mb-2">Perfil profesional</h3>
              <p className="text-[13.5px] leading-relaxed text-foreground bg-secondary/40 p-3 rounded-lg border border-border whitespace-pre-wrap">
                {jurado.perfil}
              </p>
            </section>
          )}

          {/* Campos extras dinámicos */}
          {extras.length > 0 && (
            <section>
              <h3 className="text-[11px] uppercase tracking-[0.14em] font-display font-bold text-[#14776A] mb-2">Información adicional</h3>
              <div className="grid sm:grid-cols-2 gap-3">
                {extras.map((c) => {
                  const v = jurado.datos?.[c.nombre_interno];
                  return <ExtraField key={c.id} campo={c} value={v} />;
                })}
              </div>
            </section>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border shrink-0 bg-secondary/30">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-lg" data-testid="jur-detail-close">Cerrar</Button>
          {canEdit && (
            <Button onClick={() => { onOpenChange(false); onEdit && onEdit(jurado); }} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-lg gap-2" data-testid="jur-detail-edit">
              <Pencil className="w-4 h-4" />Editar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({ icon: Icon, label, children }) {
  return (
    <div className="border border-border rounded-lg p-2.5 bg-white">
      <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-wide font-display font-bold text-muted-foreground mb-1">
        <Icon className="w-3 h-3" />{label}
      </div>
      <div className="text-[13.5px] font-semibold text-[#1A1F2C] break-words">{children}</div>
    </div>
  );
}

function ExtraField({ campo, value }) {
  const empty = value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
  return (
    <div className="border border-border rounded-lg p-2.5 bg-white">
      <div className="text-[10.5px] uppercase tracking-wide font-display font-bold text-muted-foreground mb-1">
        {campo.nombre_visible}
      </div>
      <div className="text-[13px] text-[#1A1F2C] break-words">
        {empty ? <em className="text-muted-foreground">Sin información</em> : renderValue(value, campo)}
      </div>
    </div>
  );
}

function renderValue(v, campo) {
  if (campo.tipo === "archivo" && typeof v === "object" && v?.url) {
    return (
      <a href={v.url} target="_blank" rel="noreferrer" download={v.name}
         className="inline-flex items-center gap-1.5 text-[#0F5E54] hover:underline font-semibold">
        <FileText className="w-4 h-4" />{v.name || "Descargar archivo"}
        <ExternalLink className="w-3 h-3" />
      </a>
    );
  }
  if (campo.tipo === "url" && typeof v === "string") {
    return <a href={v} target="_blank" rel="noreferrer" className="text-[#0F5E54] hover:underline inline-flex items-center gap-1">{v}<ExternalLink className="w-3 h-3" /></a>;
  }
  if (campo.tipo === "si_no") return v ? "Sí" : "No";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}
