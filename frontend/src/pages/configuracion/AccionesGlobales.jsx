import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Copy, Download, Upload, AlertTriangle } from "lucide-react";

/**
 * Botones globales: clonar configuración desde otra convocatoria, exportar e importar JSON.
 * Usar en la cabecera del módulo Configuración.
 */
export default function AccionesGlobales({ convId, convNombre, onChange }) {
  return (
    <div className="flex items-center gap-2 flex-wrap justify-end">
      <ClonarBtn convId={convId} convNombre={convNombre} onChange={onChange} />
      <ExportBtn convId={convId} convNombre={convNombre} />
      <ImportBtn convId={convId} onChange={onChange} />
    </div>
  );
}

function ClonarBtn({ convId, convNombre, onChange }) {
  const [open, setOpen] = useState(false);
  const [convs, setConvs] = useState([]);
  const [sourceId, setSourceId] = useState("");
  const [modo, setModo] = useState("agregar");
  const [incluir, setIncluir] = useState({ campos: true, catalogos: true, criterios: true, desempates: true });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!open) return;
    api.get("/convocatorias").then((r) => setConvs(r.data.filter((c) => c.id !== convId)));
    setSourceId(""); setResult(null);
  }, [open, convId]);

  const submit = async () => {
    if (!sourceId) { toast.error("Selecciona la convocatoria origen"); return; }
    setBusy(true);
    try {
      const { data } = await api.post(`/convocatorias/${convId}/configuracion/clonar`, {
        source_convocatoria_id: sourceId,
        modo,
        incluir_campos: incluir.campos,
        incluir_catalogos: incluir.catalogos,
        incluir_criterios: incluir.criterios,
        incluir_desempates: incluir.desempates,
      });
      setResult(data);
      toast.success("Configuración clonada");
      onChange && onChange();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Error al clonar"); }
    finally { setBusy(false); }
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="rounded-lg gap-2 text-xs" data-testid="clonar-config-btn">
        <Copy className="w-3.5 h-3.5" />Clonar desde…
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-lg max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">Clonar configuración a "{convNombre}"</DialogTitle>
          </DialogHeader>
          {!result ? (
            <div className="space-y-3">
              <div>
                <Label>Convocatoria origen</Label>
                <Select value={sourceId} onValueChange={setSourceId}>
                  <SelectTrigger className="rounded-lg" data-testid="clonar-source-select"><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                  <SelectContent>
                    {convs.map((c) => <SelectItem key={c.id} value={c.id}>{c.codigo} — {c.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Qué quieres copiar</Label>
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
                    <SelectItem value="agregar">Agregar (omite duplicados por nombre)</SelectItem>
                    <SelectItem value="reemplazar">Reemplazar (borra lo existente)</SelectItem>
                  </SelectContent>
                </Select>
                {modo === "reemplazar" && (
                  <div className="mt-2 flex items-start gap-2 p-2 bg-[#FEF3F2] border border-[#FECDCA] rounded-lg text-[11.5px] text-[#B42318]">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    Modo reemplazar: se eliminarán los items existentes de los tipos seleccionados.
                    Si la convocatoria ya tiene propuestas o evaluaciones, esto puede romper su consistencia.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              <div className="text-[#0F5E54] font-semibold">✓ Clonado desde {result.origen}</div>
              <ul className="text-[13px] space-y-1">
                <li>Campos: <strong>{result.resultado.campos}</strong></li>
                <li>Catálogos: <strong>{result.resultado.catalogos}</strong></li>
                <li>Criterios: <strong>{result.resultado.criterios}</strong></li>
                <li>Desempates: <strong>{result.resultado.desempates}</strong></li>
              </ul>
              {result.resultado.saltados.length > 0 && (
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer">Saltados ({result.resultado.saltados.length}) — ya existían</summary>
                  <div className="mt-1 pl-3">{result.resultado.saltados.join(", ")}</div>
                </details>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} className="rounded-lg">{result ? "Cerrar" : "Cancelar"}</Button>
            {!result && <Button onClick={submit} disabled={busy} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-lg" data-testid="clonar-submit-btn">{busy ? "Clonando…" : "Clonar"}</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
      toast.success("Exportado");
    } catch (e) { toast.error("Error al exportar"); }
  };
  return (
    <Button variant="outline" onClick={onClick} className="rounded-lg gap-2 text-xs" data-testid="export-config-btn">
      <Download className="w-3.5 h-3.5" />Exportar JSON
    </Button>
  );
}

function ImportBtn({ convId, onChange }) {
  const [open, setOpen] = useState(false);
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
          toast.error("Archivo no parece un export KRINOS"); return;
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
      toast.success(`Importado: ${out.resultado.campos} campos, ${out.resultado.catalogos} catálogos, ${out.resultado.criterios} criterios, ${out.resultado.desempates} desempates`);
      setOpen(false); setData(null);
      onChange && onChange();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Error al importar"); }
    finally { setBusy(false); }
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="rounded-lg gap-2 text-xs" data-testid="import-config-btn">
        <Upload className="w-3.5 h-3.5" />Importar JSON
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-lg max-w-lg">
          <DialogHeader><DialogTitle className="font-display">Importar configuración desde JSON</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Archivo JSON</Label>
              <input type="file" accept="application/json" onChange={onFile} className="block w-full text-sm" data-testid="import-file-input" />
              {data && (
                <p className="text-[12px] text-[#0F5E54] mt-1">
                  ✓ Origen: {data.convocatoria?.codigo} — {data.convocatoria?.nombre} ·
                  {" "}{data.campos?.length || 0} campos, {data.catalogos?.length || 0} catálogos, {data.criterios?.length || 0} criterios, {data.desempates?.length || 0} desempates
                </p>
              )}
            </div>
            {data && (
              <>
                <div>
                  <Label>Qué quieres importar</Label>
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
                      <SelectItem value="agregar">Agregar (omite duplicados)</SelectItem>
                      <SelectItem value="reemplazar">Reemplazar</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} className="rounded-lg">Cancelar</Button>
            <Button onClick={submit} disabled={!data || busy} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-lg" data-testid="import-submit-btn">{busy ? "Importando…" : "Importar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
