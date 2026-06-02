import React, { useEffect, useState } from "react";
import { api, formatApiError, downloadFile } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader, { Badge, EmptyState } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Workflow, Trash2, Download, Upload, Sparkles, Loader2 } from "lucide-react";
import ConvocatoriaContextBanner from "@/components/ConvocatoriaContextBanner";

export default function Asignaciones() {
  const { activeConvocatoriaId, user } = useAuth();
  const [asignaciones, setAsignaciones] = useState([]);
  const [propuestas, setPropuestas] = useState([]);
  const [jurados, setJurados] = useState([]);
  const [ternas, setTernas] = useState([]);
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [autoOpen, setAutoOpen] = useState(false);
  const [file, setFile] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [autoCfg, setAutoCfg] = useState({ jurados_por_propuesta: 3, solo_subregion: true, asignar_ternas: true, balance_carga: true });
  const [autoBusy, setAutoBusy] = useState(false);
  const [autoResult, setAutoResult] = useState(null);
  const [f, setF] = useState({ propuesta_id: "", jurado_id: "", terna_id: "", tipo_evaluacion: "individual" });

  const canEdit = user?.role === "admin_general" || user?.role === "admin_convocatoria";

  const load = async () => {
    if (!activeConvocatoriaId) return;
    const [a, p, j, t] = await Promise.all([
      api.get(`/asignaciones?convocatoria_id=${activeConvocatoriaId}`),
      api.get(`/propuestas?convocatoria_id=${activeConvocatoriaId}`),
      api.get(`/jurados?convocatoria_id=${activeConvocatoriaId}`),
      api.get(`/ternas?convocatoria_id=${activeConvocatoriaId}`),
    ]);
    setAsignaciones(a.data); setPropuestas(p.data); setJurados(j.data); setTernas(t.data);
  };
  useEffect(() => { load(); }, [activeConvocatoriaId]);

  const submit = async () => {
    try {
      const payload = { ...f, convocatoria_id: activeConvocatoriaId };
      if (!payload.jurado_id) delete payload.jurado_id;
      if (!payload.terna_id) delete payload.terna_id;
      await api.post("/asignaciones", payload);
      toast.success("Asignación creada"); setOpen(false); load();
      setF({ propuesta_id: "", jurado_id: "", terna_id: "", tipo_evaluacion: "individual" });
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const cancelar = async (id) => {
    if (!confirm("¿Cancelar asignación?")) return;
    await api.delete(`/asignaciones/${id}`); load();
  };

  const propMap = Object.fromEntries(propuestas.map((p) => [p.id, p]));
  const jurMap = Object.fromEntries(jurados.map((j) => [j.id, j]));
  const ternaMap = Object.fromEntries(ternas.map((t) => [t.id, t]));

  if (!activeConvocatoriaId) return <div className="p-10 text-muted-foreground">Selecciona una convocatoria.</div>;

  return (
    <div className="flex-1 p-8 lg:p-10">
      <PageHeader
        eyebrow="Distribución"
        title="Asignaciones"
        subtitle="Relaciona propuestas con jurados (evaluación individual) o ternas (evaluación colectiva). Al asignar a un jurado individual, se crea automáticamente una evaluación en estado Borrador."
        actions={
          <>
            {canEdit && (
              <>
                <Button onClick={() => setAutoOpen(true)} variant="outline" className="rounded-sm gap-2 border-[#14776A] text-[#14776A] hover:bg-[#F0F7F5]" data-testid="asig-auto-btn">
                  <Sparkles className="w-4 h-4" />Asignación automática
                </Button>
                <Button variant="outline" className="rounded-sm gap-2" onClick={() => downloadFile(`/asignaciones-template?convocatoria_id=${activeConvocatoriaId}`, "plantilla_asignaciones.xlsx").catch((e) => toast.error(e.message))} data-testid="asig-template-btn">
                  <Download className="w-4 h-4" />Plantilla
                </Button>
                <Button variant="outline" className="rounded-sm gap-2" onClick={() => setImportOpen(true)} data-testid="asig-import-btn">
                  <Upload className="w-4 h-4" />Carga masiva
                </Button>
              </>
            )}
            {canEdit && (
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild><Button className="bg-[#14776A] hover:bg-[#0F5E54] rounded-sm gap-2" data-testid="asig-new-btn"><Plus className="w-4 h-4" />Nueva</Button></DialogTrigger>
            <DialogContent className="rounded-sm max-w-lg">
              <DialogHeader><DialogTitle className="font-display">Nueva asignación</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold">Propuesta</label>
                  <Select value={f.propuesta_id} onValueChange={(v) => setF({ ...f, propuesta_id: v })}>
                    <SelectTrigger className="rounded-sm" data-testid="asig-propuesta"><SelectValue placeholder="Selecciona propuesta" /></SelectTrigger>
                    <SelectContent>{propuestas.map((p) => <SelectItem key={p.id} value={p.id}>{p.codigo} · {p.nombre}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-bold">Tipo de evaluación</label>
                  <Select value={f.tipo_evaluacion} onValueChange={(v) => setF({ ...f, tipo_evaluacion: v })}>
                    <SelectTrigger className="rounded-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="individual">Individual</SelectItem>
                      <SelectItem value="colectiva">Colectiva</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {f.tipo_evaluacion === "individual" && (
                  <div>
                    <label className="text-xs font-bold">Jurado</label>
                    <Select value={f.jurado_id} onValueChange={(v) => setF({ ...f, jurado_id: v })}>
                      <SelectTrigger className="rounded-sm" data-testid="asig-jurado"><SelectValue placeholder="Selecciona jurado" /></SelectTrigger>
                      <SelectContent>{jurados.map((j) => <SelectItem key={j.id} value={j.id}>{j.nombre}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
                {f.tipo_evaluacion === "colectiva" && (
                  <div>
                    <label className="text-xs font-bold">Terna</label>
                    <Select value={f.terna_id} onValueChange={(v) => setF({ ...f, terna_id: v })}>
                      <SelectTrigger className="rounded-sm"><SelectValue placeholder="Selecciona terna" /></SelectTrigger>
                      <SelectContent>{ternas.map((t) => <SelectItem key={t.id} value={t.id}>{t.codigo} · {t.nombre}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)} className="rounded-sm">Cancelar</Button>
                <Button onClick={submit} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-sm">Crear</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
            )}
          </>
        }
      />

      <ConvocatoriaContextBanner />

      <div className="border border-border rounded-sm bg-white overflow-x-auto">
        <table className="w-full dense-table">
          <thead><tr><th>Propuesta</th><th>Tipo</th><th>Jurado / Terna</th><th>Etapa</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {asignaciones.map((a) => {
              const p = propMap[a.propuesta_id];
              const target = a.jurado_id ? jurMap[a.jurado_id]?.nombre : ternaMap[a.terna_id]?.nombre;
              return (
                <tr key={a.id}>
                  <td><div className="font-mono text-xs text-muted-foreground">{p?.codigo}</div><div className="font-semibold">{p?.nombre}</div></td>
                  <td><Badge tone={a.tipo_evaluacion === "individual" ? "info" : "success"}>{a.tipo_evaluacion}</Badge></td>
                  <td>{target || "—"}</td>
                  <td className="text-xs text-muted-foreground">{a.etapa}</td>
                  <td><Badge tone="default">{a.estado}</Badge></td>
                  <td className="text-right">
                    {a.estado !== "Cancelada" && (
                      <button onClick={() => cancelar(a.id)} className="text-muted-foreground hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {!asignaciones.length && <tr><td colSpan={6}><EmptyState title="Sin asignaciones" hint="Asigna propuestas a jurados o ternas." icon={Workflow} /></td></tr>}
          </tbody>
        </table>
      </div>

      {/* Dialog: Carga masiva */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="rounded-lg max-w-lg">
          <DialogHeader><DialogTitle className="font-display">Carga masiva de asignaciones</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Descarga primero la plantilla, complétala con propuestas/ternas/jurados y súbela aquí.
              Cada fila crea una asignación (con la evaluación borrador correspondiente para tipo individual).
            </p>
            <input type="file" accept=".xlsx,.xls" onChange={(e) => setFile(e.target.files[0])} className="block w-full text-sm" data-testid="asig-import-file" />
            {importResult && (
              <div className={`text-xs p-2 rounded-md ${importResult.rechazados > 0 ? "bg-yellow-50 border border-yellow-200" : "bg-emerald-50 border border-emerald-200"}`}>
                ✓ {importResult.creados} creadas · ✕ {importResult.rechazados} rechazadas
                {importResult.errores?.length > 0 && (
                  <details className="mt-2"><summary className="cursor-pointer">Ver errores</summary>
                    <ul className="mt-1 space-y-0.5">{importResult.errores.map((e, i) => <li key={`err-${e.fila}-${i}`}>· fila {e.fila}: {e.error}</li>)}</ul>
                  </details>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setImportOpen(false); setFile(null); setImportResult(null); }} className="rounded-sm">Cerrar</Button>
            <Button disabled={!file} onClick={async () => {
              const fd = new FormData(); fd.append("convocatoria_id", activeConvocatoriaId); fd.append("file", file);
              try {
                const r = await api.post("/asignaciones-import", fd, { headers: { "Content-Type": "multipart/form-data" } });
                setImportResult(r.data); load();
                toast.success(`Asignaciones creadas: ${r.data.creados}`);
              } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
            }} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-sm" data-testid="asig-import-submit">Cargar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Asignación automática */}
      <Dialog open={autoOpen} onOpenChange={(v) => { setAutoOpen(v); if (!v) setAutoResult(null); }}>
        <DialogContent className="rounded-lg max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2"><Sparkles className="w-4 h-4 text-[#14776A]" />Asignación automática</DialogTitle>
            <p className="text-[12.5px] text-muted-foreground mt-1">
              KRINOS asignará jurados y ternas a las propuestas habilitadas siguiendo los criterios que selecciones.
              Las asignaciones ya existentes NO se duplican.
            </p>
          </DialogHeader>
          {!autoResult ? (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Jurados individuales por propuesta</Label>
                <Input type="number" min={1} max={10} value={autoCfg.jurados_por_propuesta} onChange={(e) => setAutoCfg({ ...autoCfg, jurados_por_propuesta: Number(e.target.value) })} className="rounded-sm w-28" data-testid="asig-auto-jpp" />
              </div>
              <div className="flex items-center justify-between border border-border rounded-lg p-2.5">
                <div>
                  <Label className="text-[13px] font-semibold">Filtrar por subregión</Label>
                  <p className="text-[11px] text-muted-foreground">Solo asigna jurados cuya subregión coincida con la de la propuesta (o "Todas las subregiones").</p>
                </div>
                <Switch checked={autoCfg.solo_subregion} onCheckedChange={(v) => setAutoCfg({ ...autoCfg, solo_subregion: v })} data-testid="asig-auto-subreg" />
              </div>
              <div className="flex items-center justify-between border border-border rounded-lg p-2.5">
                <div>
                  <Label className="text-[13px] font-semibold">Balancear carga</Label>
                  <p className="text-[11px] text-muted-foreground">De los candidatos elegibles, prioriza los jurados con menos asignaciones.</p>
                </div>
                <Switch checked={autoCfg.balance_carga} onCheckedChange={(v) => setAutoCfg({ ...autoCfg, balance_carga: v })} data-testid="asig-auto-balance" />
              </div>
              <div className="flex items-center justify-between border border-border rounded-lg p-2.5">
                <div>
                  <Label className="text-[13px] font-semibold">Asignar ternas (colectiva)</Label>
                  <p className="text-[11px] text-muted-foreground">Enlaza la terna que corresponda a cada subregión.</p>
                </div>
                <Switch checked={autoCfg.asignar_ternas} onCheckedChange={(v) => setAutoCfg({ ...autoCfg, asignar_ternas: v })} data-testid="asig-auto-ternas" />
              </div>
            </div>
          ) : (
            <div className="space-y-2 text-[13.5px]">
              <div className="rounded-lg bg-[#F0F7F5] border border-[#CDE7E1] p-3 text-[#0F5E54] font-semibold">
                ✓ Proceso completado
              </div>
              <ul className="space-y-1">
                <li>Asignaciones individuales creadas: <strong className="tabular-nums">{autoResult.asignaciones_individuales}</strong></li>
                <li>Asignaciones colectivas creadas: <strong className="tabular-nums">{autoResult.asignaciones_colectivas}</strong></li>
                <li>Propuestas ya completas (omitidas): <strong className="tabular-nums">{autoResult.propuestas_omitidas_ya_completas}</strong></li>
                <li>Total propuestas elegibles: {autoResult.propuestas_total}</li>
                <li>Jurados activos: {autoResult.jurados_activos}</li>
              </ul>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAutoOpen(false)} className="rounded-sm">{autoResult ? "Cerrar" : "Cancelar"}</Button>
            {!autoResult && (
              <Button disabled={autoBusy} onClick={async () => {
                setAutoBusy(true);
                try {
                  const r = await api.post("/asignaciones/auto", { ...autoCfg, convocatoria_id: activeConvocatoriaId });
                  setAutoResult(r.data); load();
                  toast.success(`Asignación automática: ${r.data.asignaciones_individuales} individuales + ${r.data.asignaciones_colectivas} colectivas`);
                } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
                finally { setAutoBusy(false); }
              }} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-sm gap-2" data-testid="asig-auto-run">
                {autoBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {autoBusy ? "Asignando…" : "Ejecutar"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
