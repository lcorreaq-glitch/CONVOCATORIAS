import React, { useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { Sparkles, Download, Upload, Settings2 } from "lucide-react";
import PlantillaWizard from "./PlantillaWizard";

/**
 * Acciones globales del módulo Configuración — pensado para usuarios no técnicos.
 * - "Usar como plantilla" (botón primario): abre wizard de 3 pasos
 * - "Guardar como archivo" (descarga JSON, para respaldar/compartir)
 * - "Opciones avanzadas" (menu): cargar archivo de configuración (técnico)
 */
export default function AccionesGlobales({ convId, convNombre, onChange }) {
  const [wizardOpen, setWizardOpen] = useState(false);

  return (
    <div className="flex items-center gap-2 flex-wrap justify-end">
      <Button
        onClick={() => setWizardOpen(true)}
        className="bg-[#14776A] hover:bg-[#0F5E54] rounded-lg gap-2 text-[13px]"
        data-testid="plantilla-btn"
      >
        <Sparkles className="w-4 h-4" />Usar como plantilla
      </Button>

      <ExportBtn convId={convId} convNombre={convNombre} />

      <AvanzadasMenu convId={convId} onChange={onChange} />

      <PlantillaWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        targetConvId={convId}
        targetConvNombre={convNombre}
        onDone={onChange}
      />
    </div>
  );
}

function ExportBtn({ convId, convNombre }) {
  const onClick = async () => {
    try {
      const { data } = await api.get(`/convocatorias/${convId}/configuracion/export`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `krinos-config-${convNombre.replace(/\s+/g, "_")}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success("Archivo descargado");
    } catch (e) { toast.error("Error al exportar"); }
  };
  return (
    <Button variant="outline" onClick={onClick} className="rounded-lg gap-2 text-[12.5px]" data-testid="export-config-btn" title="Descarga un archivo con toda la configuración para respaldar o compartir">
      <Download className="w-3.5 h-3.5" />Guardar como archivo
    </Button>
  );
}

function AvanzadasMenu({ convId, onChange }) {
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="rounded-lg gap-2 text-[12.5px]" data-testid="advanced-menu-btn">
            <Settings2 className="w-3.5 h-3.5" />Avanzado
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-2">
          <div className="text-[10.5px] uppercase tracking-wide font-display font-bold text-[#5E6878] px-2 py-1.5">
            Opciones técnicas
          </div>
          <button
            onClick={() => { setOpen(false); setImportOpen(true); }}
            className="w-full flex items-start gap-2 px-2 py-2 rounded-md hover:bg-secondary text-left"
            data-testid="import-config-trigger"
          >
            <Upload className="w-4 h-4 mt-0.5 text-[#5E6878] shrink-0" />
            <div>
              <div className="text-[13px] font-semibold">Cargar archivo de configuración</div>
              <div className="text-[11px] text-muted-foreground leading-snug">Sube un archivo .json exportado previamente desde KRINOS.</div>
            </div>
          </button>
        </PopoverContent>
      </Popover>
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} convId={convId} onChange={onChange} />
    </>
  );
}

function ImportDialog({ open, onOpenChange, convId, onChange }) {
  const [data, setData] = useState(null);
  const [modo, setModo] = useState("agregar");
  const [incluir, setIncluir] = useState({ campos: true, catalogos: true, criterios: true, desempates: true });
  const [busy, setBusy] = useState(false);

  const onFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (parsed.krinos_export_version !== 1) {
          toast.error("Archivo no es un export de KRINOS válido"); return;
        }
        setData(parsed);
      } catch { toast.error("JSON inválido"); }
    };
    r.readAsText(file);
  };

  const submit = async () => {
    if (!data) return;
    setBusy(true);
    try {
      const { data: out } = await api.post(`/convocatorias/${convId}/configuracion/import`, {
        data, modo,
        incluir_campos: incluir.campos,
        incluir_catalogos: incluir.catalogos,
        incluir_criterios: incluir.criterios,
        incluir_desempates: incluir.desempates,
      });
      toast.success(`Cargado: ${out.resultado.campos + out.resultado.catalogos + out.resultado.criterios + out.resultado.desempates} items`);
      onOpenChange(false); setData(null);
      onChange && onChange();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Error al cargar"); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-lg max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">Cargar archivo de configuración</DialogTitle>
          <p className="text-[12px] text-muted-foreground mt-1">Sube un .json exportado previamente.</p>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Archivo JSON</Label>
            <input type="file" accept="application/json" onChange={onFile} className="block w-full text-sm border border-border rounded-lg p-2" data-testid="import-file-input" />
            {data && (
              <p className="text-[12px] text-[#0F5E54] mt-2">
                ✓ {data.convocatoria?.codigo} — {data.convocatoria?.nombre} ·
                {" "}{data.campos?.length || 0} campos, {data.catalogos?.length || 0} catálogos, {data.criterios?.length || 0} criterios, {data.desempates?.length || 0} desempates
              </p>
            )}
          </div>
          {data && (
            <>
              <div>
                <Label>Qué quieres cargar</Label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {Object.entries(incluir).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between border border-border rounded-lg p-2">
                      <Label className="text-xs capitalize">{k}</Label>
                      <Switch checked={v} onCheckedChange={(val) => setIncluir({ ...incluir, [k]: val })} />
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <Label>Modo</Label>
                <Select value={modo} onValueChange={setModo}>
                  <SelectTrigger className="rounded-lg"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agregar">Agregar lo nuevo (recomendado)</SelectItem>
                    <SelectItem value="reemplazar">Reemplazar lo existente (peligroso)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-lg">Cancelar</Button>
          <Button onClick={submit} disabled={!data || busy} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-lg" data-testid="import-submit-btn">{busy ? "Cargando…" : "Cargar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
