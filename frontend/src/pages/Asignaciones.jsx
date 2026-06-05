import React, { useEffect, useMemo, useState } from "react";
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
import { Plus, Workflow, Trash2, Download, Upload, Sparkles, Loader2, Search, CheckSquare } from "lucide-react";
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
  // Formulario masivo manual
  const [f, setF] = useState({ propuesta_ids: [], jurado_ids: [], terna_id: "", tipo_evaluacion: "individual" });
  const [propSearch, setPropSearch] = useState("");
  const [jurSearch, setJurSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Selección masiva en la tabla
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showCanceladas, setShowCanceladas] = useState(false);
  const [busy, setBusy] = useState(false);

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
    setSelectedIds(new Set());
  };
  useEffect(() => { load(); }, [activeConvocatoriaId]);

  const submit = async () => {
    if (!f.propuesta_ids.length) { toast.error("Selecciona al menos una propuesta"); return; }
    if (f.tipo_evaluacion === "individual" && !f.jurado_ids.length) { toast.error("Selecciona al menos un jurado"); return; }
    if (f.tipo_evaluacion === "colectiva" && !f.terna_id) { toast.error("Selecciona una terna"); return; }
    setSubmitting(true);
    try {
      const payload = {
        convocatoria_id: activeConvocatoriaId,
        propuesta_ids: f.propuesta_ids,
        tipo_evaluacion: f.tipo_evaluacion,
        ...(f.tipo_evaluacion === "individual" ? { jurado_ids: f.jurado_ids } : { terna_id: f.terna_id }),
      };
      const r = await api.post("/asignaciones/bulk-create", payload);
      const { creadas, duplicadas } = r.data;
      if (creadas && duplicadas) toast.success(`${creadas} creadas · ${duplicadas} ya existían (omitidas)`);
      else if (creadas) toast.success(`${creadas} asignaciones creadas`);
      else if (duplicadas) toast.message(`Todas (${duplicadas}) ya estaban asignadas. No se creó nada.`);
      setOpen(false);
      setF({ propuesta_ids: [], jurado_ids: [], terna_id: "", tipo_evaluacion: "individual" });
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally { setSubmitting(false); }
  };

  const cancelar = async (id) => {
    if (!confirm("¿Cancelar esta asignación?")) return;
    await api.delete(`/asignaciones/${id}`); load();
  };

  const bulkCancel = async () => {
    if (!selectedIds.size) return;
    if (!confirm(`¿Cancelar ${selectedIds.size} asignación${selectedIds.size > 1 ? "es" : ""}?`)) return;
    setBusy(true);
    try {
      const r = await api.post("/asignaciones/bulk-delete", { ids: [...selectedIds] });
      toast.success(`${r.data.canceladas} asignaciones canceladas`);
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  const propMap = useMemo(() => Object.fromEntries(propuestas.map((p) => [p.id, p])), [propuestas]);
  const jurMap = useMemo(() => Object.fromEntries(jurados.map((j) => [j.id, j])), [jurados]);
  const ternaMap = useMemo(() => Object.fromEntries(ternas.map((t) => [t.id, t])), [ternas]);

  // Filtros para los pickers del modal
  const propuestasFiltradas = useMemo(() => {
    const s = propSearch.toLowerCase();
    return s ? propuestas.filter((p) => `${p.codigo} ${p.nombre} ${p.organizacion || ""}`.toLowerCase().includes(s)) : propuestas;
  }, [propuestas, propSearch]);
  const juradosFiltrados = useMemo(() => {
    const s = jurSearch.toLowerCase();
    return s ? jurados.filter((j) => `${j.nombre} ${j.email}`.toLowerCase().includes(s)) : jurados;
  }, [jurados, jurSearch]);

  const togglePropuesta = (id) => setF((p) => ({ ...p, propuesta_ids: p.propuesta_ids.includes(id) ? p.propuesta_ids.filter((x) => x !== id) : [...p.propuesta_ids, id] }));
  const toggleJurado = (id) => setF((p) => ({ ...p, jurado_ids: p.jurado_ids.includes(id) ? p.jurado_ids.filter((x) => x !== id) : [...p.jurado_ids, id] }));

  // Asignaciones visibles (filtra canceladas si toggle off)
  const visibles = useMemo(() => asignaciones.filter((a) => showCanceladas || a.estado !== "Cancelada"), [asignaciones, showCanceladas]);
  const allVisibleActiveIds = visibles.filter((a) => a.estado !== "Cancelada").map((a) => a.id);
  const allSelected = allVisibleActiveIds.length > 0 && allVisibleActiveIds.every((id) => selectedIds.has(id));
  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(allVisibleActiveIds));
  };
  const toggleOne = (id) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };

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
              <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setF({ propuesta_ids: [], jurado_ids: [], terna_id: "", tipo_evaluacion: "individual" }); setPropSearch(""); setJurSearch(""); } }}>
                <DialogTrigger asChild><Button className="bg-[#14776A] hover:bg-[#0F5E54] rounded-sm gap-2" data-testid="asig-new-btn"><Plus className="w-4 h-4" />Nueva</Button></DialogTrigger>
            <DialogContent className="rounded-lg max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-display">Nueva asignación</DialogTitle>
                <p className="text-[12.5px] text-muted-foreground mt-1">
                  Selecciona <strong>una o varias propuestas</strong> y <strong>uno o varios jurados</strong> (o una terna para colectiva).
                  Se creará el producto cartesiano. Las combinaciones que ya existen se omiten automáticamente — no se duplican.
                </p>
              </DialogHeader>

              <div className="space-y-4 pt-2">
                <div>
                  <Label className="text-xs font-bold">Tipo de evaluación</Label>
                  <Select value={f.tipo_evaluacion} onValueChange={(v) => setF({ ...f, tipo_evaluacion: v, jurado_ids: [], terna_id: "" })}>
                    <SelectTrigger className="rounded-md" data-testid="asig-tipo"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="individual">Individual (propuesta × jurado)</SelectItem>
                      <SelectItem value="colectiva">Colectiva (propuesta × terna)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  {/* Picker Propuestas */}
                  <div className="border border-border rounded-lg overflow-hidden bg-white">
                    <div className="bg-[#F0F7F5] px-3 py-2 border-b border-border flex items-center justify-between">
                      <div className="text-[12px] font-bold text-[#0F5E54]">
                        Propuestas <span className="font-mono text-muted-foreground font-normal">({f.propuesta_ids.length} de {propuestasFiltradas.length})</span>
                      </div>
                      <button type="button" onClick={() => setF({ ...f, propuesta_ids: f.propuesta_ids.length === propuestasFiltradas.length ? [] : propuestasFiltradas.map((p) => p.id) })} className="text-[11px] text-[#14776A] hover:underline">
                        {f.propuesta_ids.length === propuestasFiltradas.length && propuestasFiltradas.length > 0 ? "Limpiar" : "Sel. todas"}
                      </button>
                    </div>
                    <div className="px-3 py-2 border-b border-border">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 absolute left-2 top-2 text-muted-foreground" />
                        <Input value={propSearch} onChange={(e) => setPropSearch(e.target.value)} placeholder="Buscar por código, nombre u organización…" className="h-8 pl-7 text-[12px] rounded-md" data-testid="asig-propuesta-search" />
                      </div>
                    </div>
                    <div className="max-h-72 overflow-y-auto">
                      {propuestasFiltradas.map((p) => (
                        <label key={p.id} className={`flex items-start gap-2 px-3 py-1.5 border-b border-border/40 cursor-pointer hover:bg-[#F7FAF9] ${f.propuesta_ids.includes(p.id) ? "bg-[#F0F7F5]" : ""}`}>
                          <input type="checkbox" checked={f.propuesta_ids.includes(p.id)} onChange={() => togglePropuesta(p.id)} className="mt-1" />
                          <div className="flex-1 min-w-0">
                            <div className="font-mono text-[10.5px] text-muted-foreground">{p.codigo}</div>
                            <div className="text-[12.5px] font-semibold truncate capitalize">{(p.nombre || "").toLowerCase()}</div>
                            {(p.organizacion || p.datos?.nombre_organizacion) && (
                              <div className="text-[10.5px] text-muted-foreground truncate capitalize">{((p.organizacion || p.datos?.nombre_organizacion) || "").toLowerCase()}</div>
                            )}
                          </div>
                        </label>
                      ))}
                      {!propuestasFiltradas.length && <div className="p-4 text-center text-[12px] text-muted-foreground">Sin resultados</div>}
                    </div>
                  </div>

                  {/* Picker Jurados o Terna */}
                  {f.tipo_evaluacion === "individual" ? (
                    <div className="border border-border rounded-lg overflow-hidden bg-white">
                      <div className="bg-[#F0F7F5] px-3 py-2 border-b border-border flex items-center justify-between">
                        <div className="text-[12px] font-bold text-[#0F5E54]">
                          Jurados <span className="font-mono text-muted-foreground font-normal">({f.jurado_ids.length} de {juradosFiltrados.length})</span>
                        </div>
                        <button type="button" onClick={() => setF({ ...f, jurado_ids: f.jurado_ids.length === juradosFiltrados.length ? [] : juradosFiltrados.map((j) => j.id) })} className="text-[11px] text-[#14776A] hover:underline">
                          {f.jurado_ids.length === juradosFiltrados.length && juradosFiltrados.length > 0 ? "Limpiar" : "Sel. todos"}
                        </button>
                      </div>
                      <div className="px-3 py-2 border-b border-border">
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 absolute left-2 top-2 text-muted-foreground" />
                          <Input value={jurSearch} onChange={(e) => setJurSearch(e.target.value)} placeholder="Buscar por nombre o email…" className="h-8 pl-7 text-[12px] rounded-md" data-testid="asig-jurado-search" />
                        </div>
                      </div>
                      <div className="max-h-72 overflow-y-auto">
                        {juradosFiltrados.map((j) => (
                          <label key={j.id} className={`flex items-start gap-2 px-3 py-1.5 border-b border-border/40 cursor-pointer hover:bg-[#F7FAF9] ${f.jurado_ids.includes(j.id) ? "bg-[#F0F7F5]" : ""}`}>
                            <input type="checkbox" checked={f.jurado_ids.includes(j.id)} onChange={() => toggleJurado(j.id)} className="mt-1" />
                            <div className="flex-1 min-w-0">
                              <div className="text-[12.5px] font-semibold truncate">{j.nombre}</div>
                              <div className="text-[10.5px] text-muted-foreground truncate">{j.email}</div>
                              {(j.subregiones || []).length > 0 && (
                                <div className="text-[10px] text-muted-foreground/80 truncate">{j.subregiones.join(" · ")}</div>
                              )}
                            </div>
                          </label>
                        ))}
                        {!juradosFiltrados.length && <div className="p-4 text-center text-[12px] text-muted-foreground">Sin resultados</div>}
                      </div>
                    </div>
                  ) : (
                    <div className="border border-border rounded-lg bg-white p-3">
                      <Label className="text-xs font-bold">Terna</Label>
                      <Select value={f.terna_id} onValueChange={(v) => setF({ ...f, terna_id: v })}>
                        <SelectTrigger className="rounded-md mt-1" data-testid="asig-terna"><SelectValue placeholder="Selecciona terna" /></SelectTrigger>
                        <SelectContent>{ternas.map((t) => <SelectItem key={t.id} value={t.id}>{t.codigo} · {t.nombre} {t.subregion && `· ${t.subregion}`}</SelectItem>)}</SelectContent>
                      </Select>
                      <p className="text-[11px] text-muted-foreground mt-2">La terna seleccionada será asignada a todas las propuestas elegidas (evaluación colectiva).</p>
                    </div>
                  )}
                </div>

                {/* Resumen */}
                <div className="rounded-lg border border-[#CDE7E1] bg-[#F0F7F5] px-3 py-2 text-[12.5px] flex items-center gap-2">
                  <CheckSquare className="w-4 h-4 text-[#14776A]" />
                  <div>
                    Se crearán <strong className="font-mono">
                      {f.tipo_evaluacion === "individual"
                        ? f.propuesta_ids.length * f.jurado_ids.length
                        : f.propuesta_ids.length * (f.terna_id ? 1 : 0)}
                    </strong> asignaciones (las duplicadas se omitirán).
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)} className="rounded-md">Cancelar</Button>
                <Button onClick={submit} disabled={submitting} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-md gap-2" data-testid="asig-submit">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {submitting ? "Creando…" : "Crear asignaciones"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
            )}
          </>
        }
      />

      <ConvocatoriaContextBanner />

      {/* Barra de acción masiva (sticky) */}
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-3">
          {canEdit && selectedIds.size > 0 && (
            <Button onClick={bulkCancel} disabled={busy} className="bg-red-600 hover:bg-red-700 rounded-md gap-2 text-white" data-testid="asig-bulk-delete">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Cancelar {selectedIds.size} asignación{selectedIds.size > 1 ? "es" : ""}
            </Button>
          )}
          <div className="text-[12.5px] text-muted-foreground">
            <strong>{visibles.length}</strong> visibles ·{" "}
            <strong>{asignaciones.filter((a) => a.estado !== "Cancelada").length}</strong> activas ·{" "}
            <strong>{asignaciones.filter((a) => a.estado === "Cancelada").length}</strong> canceladas
          </div>
        </div>
        <label className="flex items-center gap-2 text-[12.5px] text-muted-foreground cursor-pointer">
          <Switch checked={showCanceladas} onCheckedChange={setShowCanceladas} data-testid="asig-toggle-canceladas" />
          Mostrar canceladas
        </label>
      </div>

      <div className="border border-border rounded-sm bg-white overflow-x-auto">
        <table className="w-full dense-table">
          <thead>
            <tr>
              {canEdit && (
                <th className="w-9 text-center">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Seleccionar todas las activas" data-testid="asig-select-all" />
                </th>
              )}
              <th>Propuesta</th><th>Tipo</th><th>Jurado / Terna</th><th>Etapa</th><th>Estado</th><th></th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((a) => {
              const p = propMap[a.propuesta_id];
              const target = a.jurado_id ? jurMap[a.jurado_id]?.nombre : ternaMap[a.terna_id]?.nombre;
              const cancelada = a.estado === "Cancelada";
              return (
                <tr key={a.id} className={cancelada ? "opacity-60" : ""} data-testid={`asig-row-${a.id}`}>
                  {canEdit && (
                    <td className="text-center">
                      {!cancelada && (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(a.id)}
                          onChange={() => toggleOne(a.id)}
                          aria-label="Seleccionar"
                          data-testid={`asig-select-${a.id}`}
                        />
                      )}
                    </td>
                  )}
                  <td>
                    <div className="font-mono text-[11px] text-muted-foreground tabular-nums">{p?.codigo}</div>
                    <div className="font-semibold text-[13px] capitalize leading-snug">{(p?.nombre || "").toLowerCase()}</div>
                  </td>
                  <td><Badge tone={a.tipo_evaluacion === "individual" ? "info" : "success"}>{a.tipo_evaluacion}</Badge></td>
                  <td className="text-[13px]">{target || "—"}</td>
                  <td className="text-[12px] text-muted-foreground">{a.etapa}</td>
                  <td><Badge tone={cancelada ? "muted" : "default"}>{a.estado}</Badge></td>
                  <td className="text-right">
                    {!cancelada && canEdit && (
                      <button onClick={() => cancelar(a.id)} className="text-muted-foreground hover:text-red-600" data-testid={`asig-delete-${a.id}`}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {!visibles.length && <tr><td colSpan={canEdit ? 7 : 6}><EmptyState title="Sin asignaciones" hint="Asigna propuestas a jurados o ternas." icon={Workflow} /></td></tr>}
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
