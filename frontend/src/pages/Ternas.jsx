import React, { useEffect, useMemo, useState } from "react";
import { api, formatApiError, downloadFile } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader, { Badge, estadoTone, EmptyState } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, UsersRound, Pencil, Trash2, Download, Upload, Search, Loader2 } from "lucide-react";
import { TID } from "@/constants/testIds";

const EMPTY_FORM = { nombre: "", tipo: "Terna", integrantes: [] };

export default function Ternas() {
  const { activeConvocatoriaId, user } = useAuth();
  const [items, setItems] = useState([]);
  const [jurados, setJurados] = useState([]);
  const [coberturas, setCoberturas] = useState({}); // {terna_id: {subregiones: [], propuestas_count}}
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [file, setFile] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState(EMPTY_FORM);
  const [juradoSearch, setJuradoSearch] = useState("");

  const canEdit = user?.role === "admin_general" || user?.role === "admin_convocatoria";

  const load = async () => {
    if (!activeConvocatoriaId) return;
    const [t, j] = await Promise.all([
      api.get(`/ternas?convocatoria_id=${activeConvocatoriaId}`),
      api.get(`/jurados?convocatoria_id=${activeConvocatoriaId}`),
    ]);
    setItems(t.data); setJurados(j.data);
    // Cargar cobertura de cada terna en paralelo
    const cov = {};
    await Promise.all(t.data.map(async (terna) => {
      try {
        const r = await api.get(`/ternas/${terna.id}/cobertura`);
        cov[terna.id] = r.data;
      } catch (_) { cov[terna.id] = { subregiones: [], propuestas_count: 0 }; }
    }));
    setCoberturas(cov);
  };
  useEffect(() => { load(); }, [activeConvocatoriaId]);

  const juradosFiltrados = useMemo(() => {
    const s = juradoSearch.toLowerCase();
    return s ? jurados.filter((j) => `${j.nombre} ${j.email}`.toLowerCase().includes(s)) : jurados;
  }, [jurados, juradoSearch]);

  const openCreate = () => { setEditingId(null); setF(EMPTY_FORM); setJuradoSearch(""); setOpen(true); };
  const openEdit = (t) => {
    setEditingId(t.id);
    setF({
      nombre: t.nombre || "",
      tipo: t.tipo || "Terna",
      integrantes: (t.integrantes || []).map((i) => ({ jurado_id: i.jurado_id, nombre: i.nombre || jurados.find((j) => j.id === i.jurado_id)?.nombre, rol: i.rol || "Evaluador" })),
      estado: t.estado || "Activo",
    });
    setJuradoSearch("");
    setOpen(true);
  };

  const submit = async () => {
    if (!f.nombre.trim()) { toast.error("Nombre requerido"); return; }
    if (f.integrantes.length < 3) { toast.error("Una terna debe tener al menos 3 integrantes"); return; }
    setBusy(true);
    try {
      if (editingId) {
        await api.patch(`/ternas/${editingId}`, f);
        toast.success("Terna actualizada");
      } else {
        await api.post("/ternas", { ...f, convocatoria_id: activeConvocatoriaId });
        toast.success("Terna creada");
      }
      setOpen(false); setEditingId(null); setF(EMPTY_FORM); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  const eliminar = async (t) => {
    if (!confirm(`¿Eliminar (desactivar) la terna ${t.codigo} · ${t.nombre}?\n\nSe verificará si tiene evaluaciones colectivas finalizadas.`)) return;
    setBusy(true);
    try {
      await api.delete(`/ternas/${t.id}`);
      toast.success("Terna desactivada");
      load();
    } catch (e) {
      const msg = e.response?.data?.detail || "Error al eliminar";
      // Si el error sugiere force, ofrecemos repetir con force
      if (typeof msg === "string" && msg.includes("force=true")) {
        if (confirm("Esta terna tiene asignaciones o evaluaciones EN BORRADOR. Al continuar, esas evaluaciones se anularán y las asignaciones se cancelarán.\n\n¿Continuar de todos modos?")) {
          try {
            await api.delete(`/ternas/${t.id}?force=true`);
            toast.success("Terna desactivada (con anulaciones)");
            load();
          } catch (e2) { toast.error(formatApiError(e2.response?.data?.detail)); }
        }
      } else {
        toast.error(formatApiError(msg));
      }
    } finally { setBusy(false); }
  };

  const toggleIntegrante = (j) => {
    const ex = f.integrantes.find((x) => x.jurado_id === j.id);
    if (ex) setF({ ...f, integrantes: f.integrantes.filter((x) => x.jurado_id !== j.id) });
    else setF({ ...f, integrantes: [...f.integrantes, { jurado_id: j.id, nombre: j.nombre, rol: "Evaluador" }] });
  };
  const cambiarRol = (jid, rol) => setF({ ...f, integrantes: f.integrantes.map((x) => x.jurado_id === jid ? { ...x, rol } : x) });

  const doImport = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("convocatoria_id", activeConvocatoriaId);
      const r = await api.post("/ternas-import", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setImportResult(r.data);
      toast.success(`${r.data.creadas} creadas · ${r.data.rechazadas} rechazadas`);
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  if (!activeConvocatoriaId) return <div className="p-10 text-muted-foreground">Selecciona una convocatoria.</div>;

  return (
    <div className="flex-1 p-8 lg:p-10">
      <PageHeader
        eyebrow="Grupos de deliberación"
        title="Ternas / Grupos"
        subtitle="Agrupa jurados en ternas para evaluación colectiva. Edita integrantes (novedades) o conforma nuevas en lote."
        actions={
          <div className="flex items-center gap-2">
            {canEdit && (
              <>
                <Button variant="outline" className="rounded-sm gap-2" onClick={() => downloadFile(`/ternas-template?convocatoria_id=${activeConvocatoriaId}`, "plantilla_ternas.xlsx").catch((e) => toast.error(e.message))} data-testid="terna-template-btn">
                  <Download className="w-4 h-4" /> Plantilla
                </Button>
                <Button variant="outline" className="rounded-sm gap-2" onClick={() => { setImportResult(null); setFile(null); setImportOpen(true); }} data-testid="terna-import-btn">
                  <Upload className="w-4 h-4" /> Importar
                </Button>
                <Button className="bg-[#14776A] hover:bg-[#0F5E54] rounded-sm gap-2" onClick={openCreate} data-testid={TID.createBtn}>
                  <Plus className="w-4 h-4" /> Nueva terna
                </Button>
              </>
            )}
          </div>
        }
      />

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {items.map((t) => (
          <div key={t.id} className={`border border-border rounded-sm bg-white p-5 ${t.estado === "Inactivo" ? "opacity-60" : ""}`} data-testid={`terna-card-${t.codigo}`}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="font-mono text-[11px] text-muted-foreground">{t.codigo}</div>
                <div className="font-display font-bold text-lg">{t.nombre}</div>
              </div>
              <Badge tone={estadoTone(t.estado)}>{t.estado}</Badge>
            </div>
            {(() => {
              const cov = coberturas[t.id];
              if (cov && cov.propuestas_count > 0) {
                return (
                  <div className="text-xs mb-2">
                    <span className="text-muted-foreground">Subregiones que evalúa:</span>{" "}
                    <strong>{cov.subregiones.length ? cov.subregiones.join(", ") : "—"}</strong>
                    <span className="text-muted-foreground"> · {cov.propuestas_count} prop.</span>
                  </div>
                );
              }
              return null;
            })()}
            <div className="text-xs text-muted-foreground mb-2">{t.integrantes?.length || 0} integrantes</div>
            <div className="space-y-1">
              {t.integrantes?.slice(0, 4).map((i) => {
                const jur = jurados.find((j) => j.id === i.jurado_id);
                const nombre = i.nombre || jur?.nombre || "—";
                return (
                  <div key={i.jurado_id} className="text-sm flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-[#14776A] rounded-full shrink-0" />
                    <span className="truncate">{nombre}</span>
                    {i.rol && i.rol !== "Evaluador" && <span className="text-[10px] uppercase tracking-wide text-muted-foreground ml-auto">{i.rol}</span>}
                  </div>
                );
              })}
            </div>
            <div className="mt-4 pt-3 border-t border-border space-y-2">
              {canEdit && (
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" variant="outline" className="rounded-sm gap-1.5 text-[12px]" onClick={() => openEdit(t)} data-testid={`terna-edit-${t.codigo}`}>
                    <Pencil className="w-3.5 h-3.5" /> Editar
                  </Button>
                  <Button size="sm" variant="outline" className="rounded-sm gap-1.5 text-[12px] text-red-600 border-red-200 hover:bg-red-50" onClick={() => eliminar(t)} disabled={t.estado === "Inactivo" || busy} data-testid={`terna-delete-${t.codigo}`}>
                    <Trash2 className="w-3.5 h-3.5" /> Eliminar
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))}
        {!items.length && <div className="col-span-full"><EmptyState title="Sin ternas creadas" hint="Conforma equipos de evaluadores para el proceso colectivo." icon={UsersRound} /></div>}
      </div>

      {/* Modal CREAR/EDITAR */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditingId(null); setF(EMPTY_FORM); setJuradoSearch(""); } }}>
        <DialogContent className="rounded-sm max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">{editingId ? "Editar terna" : "Nueva terna"}</DialogTitle>
            {editingId && <p className="text-[12px] text-muted-foreground">Puedes cambiar integrantes para registrar novedades (renuncias, sustituciones).</p>}
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nombre</Label>
              <Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} className="rounded-sm" data-testid="terna-nombre" placeholder="Terna Urabá" />
              <p className="text-[11px] text-muted-foreground mt-1">
                Una terna es solo un grupo de jurados. Las subregiones cubiertas se calculan según las propuestas que se le asignen desde el módulo <strong>Asignaciones</strong>.
              </p>
            </div>

            {editingId && (
              <div>
                <Label>Estado</Label>
                <Select value={f.estado || "Activo"} onValueChange={(v) => setF({ ...f, estado: v })}>
                  <SelectTrigger className="rounded-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Activo">Activo</SelectItem>
                    <SelectItem value="Creado">Creado</SelectItem>
                    <SelectItem value="Inactivo">Inactivo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="m-0">Integrantes <span className="text-muted-foreground font-normal">({f.integrantes.length})</span></Label>
                <div className="relative w-64">
                  <Search className="w-3.5 h-3.5 absolute left-2 top-2 text-muted-foreground" />
                  <Input value={juradoSearch} onChange={(e) => setJuradoSearch(e.target.value)} placeholder="Buscar jurado…" className="h-8 pl-7 text-[12px] rounded-sm" data-testid="terna-search-jurado" />
                </div>
              </div>

              {/* Integrantes seleccionados (con su rol editable) */}
              {f.integrantes.length > 0 && (
                <div className="border border-[#CDE7E1] bg-[#F0F7F5] rounded-sm p-2 mb-2 space-y-1">
                  {f.integrantes.map((i) => {
                    const jur = jurados.find((j) => j.id === i.jurado_id);
                    return (
                      <div key={i.jurado_id} className="flex items-center gap-2 p-1.5 bg-white rounded-sm">
                        <span className="w-1.5 h-1.5 bg-[#14776A] rounded-full" />
                        <span className="text-[13px] font-medium flex-1 truncate">{i.nombre || jur?.nombre}</span>
                        <span className="text-[11px] text-muted-foreground font-mono">{jur?.email}</span>
                        <Select value={i.rol} onValueChange={(v) => cambiarRol(i.jurado_id, v)}>
                          <SelectTrigger className="h-7 w-32 text-[11px] rounded-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Coordinador">Coordinador</SelectItem>
                            <SelectItem value="Evaluador">Evaluador</SelectItem>
                            <SelectItem value="Suplente">Suplente</SelectItem>
                          </SelectContent>
                        </Select>
                        <button onClick={() => toggleIntegrante(jur || { id: i.jurado_id })} className="text-muted-foreground hover:text-red-600 p-1" title="Quitar"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Lista de candidatos */}
              <div className="border border-border rounded-sm max-h-56 overflow-y-auto">
                {juradosFiltrados.map((j) => {
                  const checked = !!f.integrantes.find((x) => x.jurado_id === j.id);
                  return (
                    <label key={j.id} className={`flex items-center gap-2 px-3 py-1.5 border-b border-border/40 cursor-pointer hover:bg-[#F7FAF9] text-sm ${checked ? "bg-[#F0F7F5]" : ""}`}>
                      <Checkbox checked={checked} onCheckedChange={() => toggleIntegrante(j)} />
                      <span className="flex-1 truncate">{j.nombre}</span>
                      <span className="text-[11px] text-muted-foreground font-mono">{j.email}</span>
                    </label>
                  );
                })}
                {!juradosFiltrados.length && <p className="text-xs text-muted-foreground p-3">Sin jurados que coincidan.</p>}
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">Una terna debe tener al menos 3 integrantes. El primer Coordinador marca rol por defecto en actas.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} className="rounded-sm">Cancelar</Button>
            <Button onClick={submit} disabled={busy} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-sm gap-2" data-testid={TID.saveBtn}>
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {editingId ? "Guardar cambios" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal IMPORTAR */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="rounded-sm max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">Importar ternas desde Excel</DialogTitle>
            <p className="text-[12px] text-muted-foreground">Descarga la plantilla primero y rellena los emails de los 3 integrantes (deben existir en Jurados).</p>
          </DialogHeader>
          <div className="space-y-3">
            <Input type="file" accept=".xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0])} className="rounded-sm" data-testid="terna-import-file" />
            {importResult && (
              <div className="text-[12px] border border-border rounded-sm p-3 bg-[#F7FAF9]">
                <strong className="text-emerald-700">{importResult.creadas} creadas</strong> · {importResult.rechazadas} rechazadas
                {importResult.errores?.length > 0 && (
                  <div className="mt-2 max-h-32 overflow-y-auto text-red-700">
                    {importResult.errores.map((e, i) => <div key={`err-${e.fila ?? i}-${i}`} className="text-[11px]">Fila {e.fila}: {e.error}</div>)}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)} className="rounded-sm">Cerrar</Button>
            <Button onClick={doImport} disabled={!file || busy} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-sm gap-2" data-testid="terna-import-submit">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}<Upload className="w-4 h-4" />Importar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
