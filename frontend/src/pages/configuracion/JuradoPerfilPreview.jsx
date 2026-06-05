import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/PageHeader";
import {
  UserCog, IdCard, FileText, PenLine, Upload, Eye, MapPin, Image as ImageIcon, KeyRound,
} from "lucide-react";

/**
 * Vista previa de cómo se verá la pantalla "Mi Perfil" del jurado.
 * Solo lectura — muestra la maquetación con los campos parametrizables actuales.
 * Replica la disposición real de /mi-perfil para validar antes de pedir al jurado real.
 */
export default function JuradoPerfilPreview({ open, onOpenChange, campos }) {
  const camposJurado = (campos || []).filter((c) => c.aplica_a === "jurado");
  const byRol = (rol) => camposJurado.find((c) => c.rol_especial === rol);
  const campoFirma = byRol("firma");
  const campoHV = byRol("hoja_vida");
  const campoCedula = byRol("documento");
  const campoFoto = byRol("foto");

  const BASE_KEYS = new Set(["nombre", "email", "telefono", "perfil", "subregiones"]);
  const ROLES_ESPECIALES = new Set(["firma", "hoja_vida", "documento", "foto"]);
  const camposExtras = camposJurado.filter(
    (c) => !BASE_KEYS.has(c.nombre_interno) && !ROLES_ESPECIALES.has(c.rol_especial)
  );

  const renderInputPreview = (campo) => {
    const tipo = campo.tipo;
    if (tipo === "archivo") {
      return (
        <div className="border-2 border-dashed border-border rounded-lg p-3 flex items-center justify-center gap-2 text-muted-foreground text-[11.5px]">
          <Upload className="w-3.5 h-3.5" /> Subir archivo
        </div>
      );
    }
    if (tipo === "texto_largo" || tipo === "textarea") {
      return <div className="border border-border rounded-lg px-2 py-3 text-[11.5px] text-muted-foreground italic">Área de texto…</div>;
    }
    if (tipo === "si_no") {
      return <div className="border border-border rounded-lg px-2 py-1.5 text-[11.5px] text-muted-foreground italic">— Selecciona —</div>;
    }
    if (tipo === "lista" || tipo === "seleccion_multiple") {
      return <div className="border border-border rounded-lg px-2 py-1.5 text-[11.5px] text-muted-foreground italic">Lista desplegable</div>;
    }
    return <div className="border border-border rounded-lg px-2 py-1.5 text-[11.5px] text-muted-foreground italic">Texto</div>;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-lg max-w-5xl max-h-[92vh] overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border bg-[#F0F7F5]">
          <DialogTitle className="font-display flex items-center gap-2">
            <Eye className="w-5 h-5 text-[#14776A]" />
            Vista previa — "Mi Perfil" del Jurado
          </DialogTitle>
          <p className="text-[12px] text-muted-foreground mt-1">
            Así verá el jurado su perfil con los campos parametrizados actualmente.
            Usa el botón <em>Editar</em> en la lista de Campos para cambiarlo.
          </p>
        </DialogHeader>

        <div className="p-6 bg-[#FAFBFC]">
          <div className="text-[10.5px] uppercase tracking-[0.18em] text-[#14776A] font-display font-bold mb-1">
            Bienvenido al portal del jurado
          </div>
          <h2 className="font-display text-[24px] font-bold mb-4">Mi Perfil</h2>

          <div className="grid lg:grid-cols-3 gap-5">
            {/* Columna izquierda */}
            <div className="lg:col-span-1 space-y-4">
              <div className="rounded-xl border border-border bg-white p-5 text-center">
                <div className="w-28 h-28 rounded-full overflow-hidden mx-auto bg-secondary border-2 border-[#CDE7E1] mb-3 grid place-items-center">
                  {campoFoto
                    ? <ImageIcon className="w-10 h-10 text-muted-foreground" />
                    : <UserCog className="w-10 h-10 text-muted-foreground" />}
                </div>
                <div className="text-[11px] text-[#14776A] font-semibold cursor-pointer">
                  {campoFoto ? campoFoto.nombre_visible : "Cambiar foto"}
                </div>
                <div className="mt-3">
                  <div className="font-display font-bold text-[14px]">Ana María Pérez</div>
                  <div className="text-[11px] text-muted-foreground">ana.perez@ejemplo.co</div>
                  <Badge tone="info">Jurado</Badge>
                </div>
              </div>
              <div className="rounded-xl border border-border bg-white p-4">
                <div className="text-[10px] uppercase tracking-wide font-display font-bold text-muted-foreground mb-2 flex items-center gap-1.5">
                  <MapPin className="w-3 h-3" /> Subregiones asignadas
                </div>
                <div className="flex flex-wrap gap-1">
                  <Badge tone="muted">Urabá</Badge>
                  <Badge tone="muted">Oriente</Badge>
                </div>
              </div>
              <div className="rounded-xl border border-border bg-white p-3 text-center">
                <div className="text-[11px] text-muted-foreground flex items-center justify-center gap-1.5">
                  <KeyRound className="w-3 h-3" /> Cambiar contraseña
                </div>
              </div>
            </div>

            {/* Columna derecha */}
            <div className="lg:col-span-2 space-y-4">
              <div className="rounded-xl border border-border bg-white p-5">
                <h3 className="font-display font-bold text-[13px] mb-2">Datos de contacto</h3>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Teléfono</div>
                    <div className="border border-border rounded-lg px-2 py-1.5 text-[11.5px] text-muted-foreground italic">+57 …</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
                      <IdCard className="w-3 h-3" /> {campoCedula?.nombre_visible || "Documento de identidad (C.C.)"}
                    </div>
                    <div className="border border-border rounded-lg px-2 py-1.5 text-[11.5px] text-muted-foreground italic">Sin puntos ni espacios</div>
                  </div>
                </div>
                {!campoCedula && (
                  <p className="text-[10.5px] text-[#B45309] mt-2 italic">
                    No hay un campo con rol especial <strong>Documento</strong>. Se usa la clave legacy <code>datos.cedula</code>.
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-border bg-white p-5">
                <h3 className="font-display font-bold text-[13px] flex items-center gap-2 mb-1">
                  <PenLine className="w-3.5 h-3.5 text-[#14776A]" /> Firma para actas
                  {campoFirma && <Badge tone="info">{campoFirma.nombre_interno}</Badge>}
                </h3>
                <p className="text-[10.5px] text-muted-foreground mb-2">
                  Esta firma se imprimirá automáticamente en las actas (individual, colectiva, subregional).
                </p>
                <div className="border-2 border-dashed border-border rounded-lg h-24 grid place-items-center text-muted-foreground text-[11.5px]">
                  Lienzo para firma — canvas o upload
                </div>
                {!campoFirma && (
                  <p className="text-[10.5px] text-[#B45309] mt-2 italic">
                    No hay un campo con rol especial <strong>Firma</strong>. Se usa la clave legacy <code>datos.firma_url</code>.
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-border bg-white p-5">
                <h3 className="font-display font-bold text-[13px] mb-2">Perfil profesional</h3>
                <div className="border border-border rounded-lg px-2 py-3 text-[11.5px] text-muted-foreground italic">
                  Cuenta sobre tu formación y experiencia profesional…
                </div>
              </div>

              <div className="rounded-xl border border-border bg-white p-5">
                <h3 className="font-display font-bold text-[13px] mb-2 flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-[#14776A]" />
                  {campoHV?.nombre_visible || "Hoja de vida"}
                  {campoHV && <Badge tone="info">{campoHV.nombre_interno}</Badge>}
                </h3>
                <div className="border-2 border-dashed border-border rounded-lg p-3 flex items-center justify-center gap-2 text-muted-foreground text-[11.5px]">
                  <Upload className="w-3.5 h-3.5" /> Subir archivo
                </div>
                {!campoHV && (
                  <p className="text-[10.5px] text-[#B45309] mt-2 italic">
                    No hay un campo con rol especial <strong>Hoja de vida</strong>. Se usa la clave legacy <code>datos.hoja_vida</code>.
                  </p>
                )}
              </div>

              {/* Anexos parametrizables (sin rol especial) */}
              {camposExtras.length > 0 ? (
                <div className="rounded-xl border border-[#CDE7E1] bg-[#F0F7F5]/60 p-5">
                  <h3 className="font-display font-bold text-[13px] mb-1">
                    Información adicional solicitada <Badge tone="success">{camposExtras.length}</Badge>
                  </h3>
                  <p className="text-[10.5px] text-muted-foreground mb-3">
                    Estos son los campos parametrizables que el jurado verá como inputs editables.
                  </p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {camposExtras.map((c) => (
                      <div key={c.id}>
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                          {c.nombre_visible} {c.obligatorio && <span className="text-red-500">*</span>}{" "}
                          <span className="font-mono text-[9px] text-muted-foreground/60">· {c.tipo}</span>
                        </div>
                        {renderInputPreview(c)}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-white p-4 text-center">
                  <p className="text-[11.5px] text-muted-foreground italic">
                    Sin campos adicionales. Crea campos con <strong>aplica_a=jurado</strong> sin rol especial
                    para que el jurado los cargue desde Mi Perfil.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
