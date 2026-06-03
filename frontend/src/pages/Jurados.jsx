import React, { useEffect, useState, useMemo } from "react";
import { api, formatApiError, downloadFile } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader, { Badge, estadoTone, EmptyState } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Upload, Download, Users, Pencil, Search, Filter, ChevronDown, X, ExternalLink, Eye, Trash2, KeyRound, Copy, Mail } from "lucide-react";
import JuradoForm from "./jurados/JuradoForm";
import JuradoDetalle from "./jurados/JuradoDetalle";
import ConvocatoriaContextBanner from "@/components/ConvocatoriaContextBanner";

function renderCellValue(v, campo) {
  if (v === null || v === undefined || v === "") return <span className="text-muted-foreground">—</span>;
  if (Array.isArray(v)) return v.length === 0 ? <span className="text-muted-foreground">—</span> : v.join(", ");
  if (campo?.tipo === "si_no") return v ? "Sí" : "No";
  if (campo?.tipo === "archivo" && typeof v === "object" && v.url) {
    return <a href={v.url} target="_blank" rel="noreferrer" download={v.name} className="text-[#0F5E54] hover:underline inline-flex items-center gap-1 text-xs"><ExternalLink className="w-3 h-3" />{v.name || "archivo"}</a>;
  }
  if (campo?.tipo === "url") return <a href={v} target="_blank" rel="noreferrer" className="text-[#0F5E54] hover:underline">abrir</a>;
  return String(v);
}

function ActiveFilterChip({ campo, catalogo, value, onChange, onRemove }) {
  const tipo = campo.tipo;
  const id = `jur-filter-${campo.nombre_interno}`;
  const isSet = value !== "" && value !== undefined && value !== null && value !== "__all__";
  const renderControl = () => {
    if (tipo === "si_no") {
      return <Select value={value === true ? "true" : value === false ? "false" : ""} onValueChange={(v) => onChange(v === "true")}>
        <SelectTrigger className="rounded-md h-7 text-[12px] w-[100px] border-0 bg-transparent px-1 focus:ring-0" data-testid={id}><SelectValue placeholder="Sí / No" /></SelectTrigger>
        <SelectContent><SelectItem value="true">Sí</SelectItem><SelectItem value="false">No</SelectItem></SelectContent>
      </Select>;
    }
    if ((tipo === "lista" || tipo === "seleccion_multiple") && catalogo) {
      const valores = (catalogo.valores || []).filter((v) => v.activo !== false);
      return <Select value={value || ""} onValueChange={onChange}>
        <SelectTrigger className="rounded-md h-7 text-[12px] min-w-[140px] border-0 bg-transparent px-1 focus:ring-0" data-testid={id}><SelectValue placeholder="Selecciona…" /></SelectTrigger>
        <SelectContent className="max-h-72">{valores.map((v) => <SelectItem key={v.id || v.valor} value={v.valor}>{v.valor}</SelectItem>)}</SelectContent>
      </Select>;
    }
    return <Input value={value || ""} onChange={(e) => onChange(e.target.value)} className="rounded-md h-7 text-[12px] w-[140px] border-0 bg-transparent px-1 focus:ring-0" data-testid={id} placeholder="texto" />;
  };
  return (
    <div className={`inline-flex items-center gap-1 rounded-md border ${isSet ? "border-[#14776A] bg-[#F0F7F5]" : "border-border bg-white"} pl-2 pr-1 h-8`}>
      <span className="text-[11.5px] font-semibold text-[#0F5E54]">{campo.nombre_visible}:</span>
      {renderControl()}
      <button onClick={onRemove} className="text-muted-foreground hover:text-red-500 p-0.5 rounded-sm" data-testid={`jur-remove-filter-${campo.nombre_interno}`}><X className="w-3 h-3" /></button>
    </div>
  );
}

function AddFilterButton({ camposDisponibles, onAdd }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = camposDisponibles.filter((c) => c.nombre_visible.toLowerCase().includes(search.toLowerCase()));
  if (camposDisponibles.length === 0) return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-[#CBD5E1] hover:border-[#14776A] hover:text-[#14776A] px-2.5 h-8 text-[12px] font-semibold text-[#5E6878]" data-testid="jur-add-filter-btn">
          <Filter className="w-3.5 h-3.5" />Filtrar por…<ChevronDown className="w-3 h-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <Input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar campo…" className="rounded-md h-8 text-[12px] mb-1" />
        <div className="max-h-72 overflow-auto">
          {filtered.map((c) => (
            <button key={c.id} onClick={() => { onAdd(c.nombre_interno); setOpen(false); setSearch(""); }} className="w-full text-left px-2 py-1.5 rounded-md hover:bg-secondary text-[12.5px] flex items-center justify-between" data-testid={`jur-add-filter-option-${c.nombre_interno}`}>
              <span>{c.nombre_visible}</span><span className="text-[10px] text-muted-foreground font-mono">{c.tipo}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function Jurados() {
  const { activeConvocatoriaId, user } = useAuth();
  const [items, setItems] = useState([]);
  const [campos, setCampos] = useState([]);
  const [catalogos, setCatalogos] = useState([]);
  const [search, setSearch] = useState("");
  const [filtros, setFiltros] = useState({});
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [file, setFile] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [credsOpen, setCredsOpen] = useState(false);
  const [credentials, setCredentials] = useState(null); // {username, password, jurado_nombre}

  const canEdit = user?.role === "admin_general" || user?.role === "admin_convocatoria";

  const showCredentials = (creds, nombre) => {
    setCredentials({ ...creds, jurado_nombre: nombre });
    setCredsOpen(true);
  };

  const deleteJurado = async (j) => {
    if (!confirm(`¿Eliminar al jurado "${j.nombre}"?\n\nSe borrará también su usuario, se desvinculará de las ternas y se cancelarán sus asignaciones y evaluaciones.\n\nEsta acción NO se puede deshacer.`)) return;
    try {
      await api.delete(`/admin/jurados/${j.id}`);
      toast.success("Jurado eliminado");
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const resetPassword = async (j) => {
    if (!confirm(`¿Resetear la contraseña del jurado "${j.nombre}"?\n\nSe generará una nueva contraseña temporal que podrá copiarse para envío por correo.`)) return;
    try {
      const r = await api.post(`/admin/credenciales-jurado/${j.id}/reset-password`, {});
      showCredentials({ username: r.data.username, password: r.data.password }, j.nombre);
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const load = () => {
    if (!activeConvocatoriaId) return;
    api.get(`/jurados?convocatoria_id=${activeConvocatoriaId}`).then((r) => setItems(r.data));
  };
  useEffect(() => {
    if (!activeConvocatoriaId) return;
    api.get(`/campos?convocatoria_id=${activeConvocatoriaId}&aplica_a=jurado`).then((r) => setCampos(r.data));
    api.get(`/catalogos?convocatoria_id=${activeConvocatoriaId}`).then((r) => setCatalogos(r.data));
    setFiltros({});
    load();
  }, [activeConvocatoriaId]);

  const catById = useMemo(() => Object.fromEntries(catalogos.map((c) => [c.id, c])), [catalogos]);
  const camposLista = useMemo(() => campos.filter((c) => c.uso_lista), [campos]);
  const camposFiltro = useMemo(() => campos.filter((c) => c.uso_filtro), [campos]);
  const activeFilterKeys = useMemo(() => Object.keys(filtros), [filtros]);
  const setFiltro = (k, v) => setFiltros((f) => ({ ...f, [k]: v }));
  const removeFiltro = (k) => setFiltros((f) => { const n = { ...f }; delete n[k]; return n; });

  // Cliente-side filtering (los datos del jurado están en `datos` o en base)
  const filteredItems = useMemo(() => {
    return items.filter((j) => {
      if (search) {
        const s = search.toLowerCase();
        if (!j.nombre.toLowerCase().includes(s) && !j.email.toLowerCase().includes(s)) return false;
      }
      for (const [k, v] of Object.entries(filtros)) {
        if (v === "" || v === undefined || v === null || v === "__all__") continue;
        let actual;
        if (k === "subregiones") actual = j.subregiones;
        else if (k === "nombre" || k === "email" || k === "telefono" || k === "perfil") actual = j[k];
        else actual = j.datos?.[k];
        if (Array.isArray(actual)) { if (!actual.includes(v)) return false; }
        else if (typeof actual === "string") { if (!actual.toLowerCase().includes(String(v).toLowerCase())) return false; }
        else if (actual !== v) return false;
      }
      return true;
    });
  }, [items, search, filtros]);

  const downloadTemplate = () => downloadFile(`/jurados-template?convocatoria_id=${activeConvocatoriaId}`, "plantilla_jurados.xlsx").catch((e) => toast.error(e.message));

  const handleImport = async () => {
    if (!file) return;
    const fd = new FormData();
    fd.append("convocatoria_id", activeConvocatoriaId);
    fd.append("file", file);
    try {
      const r = await api.post("/jurados-import", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setImportResult(r.data); load();
      toast.success(`Importados: ${r.data.creados} (rechazados: ${r.data.rechazados})`);
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  return (
    <div className="flex-1 p-8 lg:p-10">
      <PageHeader
        eyebrow="Comité evaluador"
        title="Jurados"
        subtitle="Registra los jurados de la convocatoria, sus subregiones y su perfil profesional. Cada jurado obtiene un usuario para acceder al portal y evaluar las propuestas asignadas."
        actions={
          <>
            {canEdit && (
              <Button onClick={() => { setEditing(null); setFormOpen(true); }} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-sm gap-2" data-testid="jur-new-btn">
                <Plus className="w-4 h-4" /> Nuevo jurado
              </Button>
            )}
            <Button variant="outline" className="rounded-sm gap-2" onClick={downloadTemplate} data-testid="jur-template-btn">
              <Download className="w-4 h-4" /> Plantilla
            </Button>
            {canEdit && (
              <Dialog open={importOpen} onOpenChange={setImportOpen}>
                <Button variant="outline" className="rounded-sm gap-2" onClick={() => setImportOpen(true)} data-testid="jur-import-btn">
                  <Upload className="w-4 h-4" /> Carga masiva
                </Button>
                <DialogContent className="rounded-lg max-w-lg">
                  <DialogHeader><DialogTitle className="font-display">Carga masiva de jurados</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">Sube un archivo XLSX con los jurados según la plantilla descargada. El archivo se valida y los errores se muestran fila por fila.</p>
                    <input type="file" accept=".xlsx,.xls" onChange={(e) => setFile(e.target.files[0])} className="block w-full text-sm" data-testid="jur-import-file-input" />
                    {importResult && (
                      <div className={`text-xs p-2 rounded-md ${importResult.rechazados > 0 ? "bg-yellow-50 border border-yellow-200" : "bg-emerald-50 border border-emerald-200"}`}>
                        ✓ {importResult.creados} creados · ✕ {importResult.rechazados} rechazados
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
                    <Button onClick={handleImport} disabled={!file} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-sm" data-testid="jur-import-submit-btn">Cargar</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </>
        }
      />

      <ConvocatoriaContextBanner />

      {/* Filtros estilo Airtable */}
      <div className="mb-5">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar jurado (nombre o email)…" className="rounded-md pl-9 h-9 text-[13px]" data-testid="jur-search" />
          </div>
          {activeFilterKeys.map((key) => {
            const campo = camposFiltro.find((c) => c.nombre_interno === key);
            if (!campo) return null;
            return <ActiveFilterChip key={key} campo={campo} catalogo={catById[campo.catalogo_id]} value={filtros[key]} onChange={(v) => setFiltro(key, v)} onRemove={() => removeFiltro(key)} />;
          })}
          <AddFilterButton camposDisponibles={camposFiltro.filter((c) => !activeFilterKeys.includes(c.nombre_interno))} onAdd={(k) => setFiltro(k, "")} />
          {activeFilterKeys.length > 0 && (
            <button onClick={() => setFiltros({})} className="text-[12px] text-[#5E6878] hover:text-red-600 underline" data-testid="jur-clear-filters">Limpiar</button>
          )}
          <div className="text-xs text-muted-foreground self-center ml-auto font-mono tabular-nums">
            {filteredItems.length} de {items.length} jurado{items.length === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      {/* Tabla dinámica */}
      <div className="border border-border rounded-sm bg-white overflow-x-auto">
        <table className="w-full dense-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Email</th>
              <th>Subregiones</th>
              {camposLista.filter((c) => !["nombre", "email", "subregiones"].includes(c.nombre_interno)).map((c) => <th key={c.id}>{c.nombre_visible}</th>)}
              <th>Estado</th>
              <th className="text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((j) => (
              <tr key={j.id} data-testid={`jurado-row-${j.id}`}>
                <td><div className="font-semibold">{j.nombre}</div>{j.perfil && <div className="text-[11px] text-muted-foreground line-clamp-1">{j.perfil}</div>}</td>
                <td className="text-muted-foreground text-xs">{j.email}</td>
                <td>{Array.isArray(j.subregiones) && j.subregiones.length > 0 ? (
                  <div className="flex flex-wrap gap-1">{j.subregiones.slice(0, 3).map((s) => <Badge key={s} tone="muted">{s}</Badge>)}{j.subregiones.length > 3 && <Badge tone="default">+{j.subregiones.length - 3}</Badge>}</div>
                ) : <span className="text-muted-foreground text-xs">—</span>}</td>
                {camposLista.filter((c) => !["nombre", "email", "subregiones"].includes(c.nombre_interno)).map((c) => (
                  <td key={c.id} className="text-[12.5px]">
                    {renderCellValue(c.nombre_interno === "telefono" ? j.telefono : j.datos?.[c.nombre_interno], c)}
                  </td>
                ))}
                <td><Badge tone={estadoTone(j.estado)}>{j.estado || "Activo"}</Badge></td>
                <td className="text-right whitespace-nowrap">
                  <button
                    onClick={() => { setViewing(j); setDetailOpen(true); }}
                    className="text-[#1D4ED8] hover:text-[#0F5E54] p-1"
                    data-testid={`jur-view-${j.id}`}
                    title="Ver detalle"
                  ><Eye className="w-4 h-4 inline" /></button>
                  {canEdit && (
                    <>
                      <button
                        onClick={() => { setEditing(j); setFormOpen(true); }}
                        className="text-[#14776A] hover:text-[#0F5E54] p-1 ml-0.5"
                        data-testid={`jur-edit-${j.id}`}
                        title="Editar"
                      ><Pencil className="w-4 h-4 inline" /></button>
                      <button
                        onClick={() => resetPassword(j)}
                        className="text-amber-600 hover:text-amber-800 p-1 ml-0.5"
                        data-testid={`jur-reset-pwd-${j.id}`}
                        title="Resetear contraseña (para envío por correo)"
                      ><KeyRound className="w-4 h-4 inline" /></button>
                      <button
                        onClick={() => deleteJurado(j)}
                        className="text-muted-foreground hover:text-red-600 p-1 ml-0.5"
                        data-testid={`jur-delete-${j.id}`}
                        title="Eliminar jurado"
                      ><Trash2 className="w-4 h-4 inline" /></button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {!filteredItems.length && <tr><td colSpan={5 + camposLista.length}><EmptyState title="Sin jurados" hint="Crea un jurado nuevo o usa la carga masiva." icon={Users} /></td></tr>}
          </tbody>
        </table>
      </div>

      <JuradoForm
        open={formOpen}
        onOpenChange={setFormOpen}
        convocatoriaId={activeConvocatoriaId}
        campos={campos}
        catalogos={catalogos}
        jurado={editing}
        onSaved={(resp) => {
          load();
          // Si la respuesta trae credenciales generadas (jurado nuevo + usuario creado), mostrarlas
          if (resp && resp.credenciales) {
            showCredentials(resp.credenciales, resp.nombre);
          }
        }}
      />
      <JuradoDetalle
        open={detailOpen}
        onOpenChange={setDetailOpen}
        jurado={viewing}
        campos={campos}
        canEdit={canEdit}
        onEdit={(j) => { setEditing(j); setFormOpen(true); }}
      />

      {/* Dialog de credenciales generadas */}
      <Dialog open={credsOpen} onOpenChange={setCredsOpen}>
        <DialogContent className="rounded-lg max-w-md" data-testid="jur-credentials-dialog">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-[#14776A]" />
              Credenciales generadas
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="bg-amber-50 border-l-4 border-amber-500 p-3 text-[12px] text-amber-900 rounded-r-md flex gap-2">
              <Mail className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <strong>Esta contraseña se muestra UNA SOLA VEZ.</strong> Cópiala ahora para enviarla por correo institucional al jurado. Luego solo podrás resetearla.
              </div>
            </div>
            {credentials?.jurado_nombre && (
              <div className="text-[13px]"><span className="text-muted-foreground">Jurado:</span> <strong>{credentials.jurado_nombre}</strong></div>
            )}
            <div>
              <label className="text-[11px] uppercase font-display font-bold text-muted-foreground">Usuario</label>
              <div className="flex gap-2 mt-1">
                <Input value={credentials?.username || ""} readOnly className="font-mono text-[12.5px]" data-testid="jur-creds-username" />
                <Button variant="outline" size="sm" className="rounded-sm" onClick={() => { navigator.clipboard.writeText(credentials?.username || ""); toast.success("Usuario copiado"); }}><Copy className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
            <div>
              <label className="text-[11px] uppercase font-display font-bold text-muted-foreground">Contraseña temporal</label>
              <div className="flex gap-2 mt-1">
                <Input value={credentials?.password || ""} readOnly className="font-mono text-[12.5px]" data-testid="jur-creds-password" />
                <Button variant="outline" size="sm" className="rounded-sm" onClick={() => { navigator.clipboard.writeText(credentials?.password || ""); toast.success("Contraseña copiada"); }}><Copy className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
            <Button
              className="w-full bg-[#14776A] hover:bg-[#0F5E54] rounded-sm gap-2"
              onClick={() => {
                const txt = `Usuario: ${credentials?.username}\nContraseña: ${credentials?.password}`;
                navigator.clipboard.writeText(txt);
                toast.success("Credenciales copiadas en bloque");
              }}
              data-testid="jur-creds-copy-all"
            ><Copy className="w-4 h-4" /> Copiar ambas</Button>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-sm" onClick={() => setCredsOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
