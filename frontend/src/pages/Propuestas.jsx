import React, { useEffect, useState, useMemo } from "react";
import { api, formatApiError, downloadFile } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader, { Badge, estadoTone, EmptyState } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Upload, Download, ExternalLink, Search, FileStack, Pencil, X, Filter, ChevronDown, Trash2 } from "lucide-react";
import { TID } from "@/constants/testIds";
import PropuestaForm from "./propuestas/PropuestaForm";
import ConvocatoriaContextBanner from "@/components/ConvocatoriaContextBanner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function renderCellValue(v, campo) {
  if (v === null || v === undefined || v === "") return <span className="text-muted-foreground">—</span>;
  if (Array.isArray(v)) return v.length === 0 ? <span className="text-muted-foreground">—</span> : v.join(", ");
  if (campo?.tipo === "si_no") return v ? "Sí" : "No";
  if (campo?.tipo === "url") return <a href={v} target="_blank" rel="noreferrer" className="text-[#0F5E54] hover:underline">abrir</a>;
  return String(v);
}

function ActiveFilterChip({ campo, catalogo, value, onChange, onRemove }) {
  const tipo = campo.tipo;
  const id = `filter-${campo.nombre_interno}`;
  let valueLabel = "Selecciona…";
  let isSet = false;
  if (value !== "" && value !== undefined && value !== null && value !== "__all__") {
    isSet = true;
    valueLabel = String(value);
    if (tipo === "si_no") valueLabel = value === true || value === "true" ? "Sí" : "No";
  }

  const renderControl = () => {
    if (tipo === "si_no") {
      return (
        <Select value={value === true ? "true" : value === false ? "false" : ""} onValueChange={(v) => onChange(v === "true")}>
          <SelectTrigger className="rounded-md h-7 text-[12px] w-[100px] border-0 bg-transparent px-1 focus:ring-0" data-testid={id}>
            <SelectValue placeholder="Sí / No" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">Sí</SelectItem>
            <SelectItem value="false">No</SelectItem>
          </SelectContent>
        </Select>
      );
    }
    if ((tipo === "lista" || tipo === "seleccion_multiple") && catalogo) {
      const valores = (catalogo.valores || []).filter((v) => v.activo !== false);
      return (
        <Select value={value || ""} onValueChange={onChange}>
          <SelectTrigger className="rounded-md h-7 text-[12px] min-w-[140px] border-0 bg-transparent px-1 focus:ring-0" data-testid={id}>
            <SelectValue placeholder="Selecciona…" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {valores.map((v) => <SelectItem key={v.id || v.valor} value={v.valor}>{v.valor}</SelectItem>)}
          </SelectContent>
        </Select>
      );
    }
    if (tipo === "fecha") {
      return <Input type="date" value={value || ""} onChange={(e) => onChange(e.target.value)} className="rounded-md h-7 text-[12px] w-[140px] border-0 bg-transparent px-1 focus:ring-0" data-testid={id} />;
    }
    if (["numero", "moneda", "porcentaje"].includes(tipo)) {
      return <Input type="number" value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} className="rounded-md h-7 text-[12px] w-[110px] border-0 bg-transparent px-1 focus:ring-0" data-testid={id} placeholder="valor" />;
    }
    return <Input value={value || ""} onChange={(e) => onChange(e.target.value)} className="rounded-md h-7 text-[12px] w-[140px] border-0 bg-transparent px-1 focus:ring-0" data-testid={id} placeholder="texto" />;
  };

  return (
    <div className={`inline-flex items-center gap-1 rounded-md border ${isSet ? "border-[#14776A] bg-[#F0F7F5]" : "border-border bg-white"} pl-2 pr-1 h-8`}>
      <span className="text-[11.5px] font-semibold text-[#0F5E54]">{campo.nombre_visible}:</span>
      {renderControl()}
      <button onClick={onRemove} className="text-muted-foreground hover:text-red-500 p-0.5 rounded-sm" data-testid={`remove-filter-${campo.nombre_interno}`} title="Quitar este filtro">
        <X className="w-3 h-3" />
      </button>
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
        <button
          className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-[#CBD5E1] hover:border-[#14776A] hover:text-[#14776A] px-2.5 h-8 text-[12px] font-semibold text-[#5E6878] transition-colors"
          data-testid="add-filter-btn"
        >
          <Filter className="w-3.5 h-3.5" />
          Filtrar por…
          <ChevronDown className="w-3 h-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <div className="text-[10.5px] uppercase tracking-wide font-display font-bold text-[#5E6878] px-1.5 py-1">
          Elige un campo para filtrar
        </div>
        <Input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar campo…"
          className="rounded-md h-8 text-[12px] mb-1"
          data-testid="add-filter-search"
        />
        <div className="max-h-72 overflow-auto">
          {filtered.length === 0 && <div className="text-xs text-muted-foreground p-2 italic">Sin campos disponibles</div>}
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => { onAdd(c.nombre_interno); setOpen(false); setSearch(""); }}
              className="w-full text-left px-2 py-1.5 rounded-md hover:bg-secondary text-[12.5px] flex items-center justify-between"
              data-testid={`add-filter-option-${c.nombre_interno}`}
            >
              <span>{c.nombre_visible}</span>
              <span className="text-[10px] text-muted-foreground font-mono">{c.tipo}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function Propuestas() {
  const { activeConvocatoriaId, user } = useAuth();
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState("__all__");
  const [filtros, setFiltros] = useState({}); // {nombre_interno: valor}
  const [importOpen, setImportOpen] = useState(false);
  const [file, setFile] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [campos, setCampos] = useState([]);
  const [catalogos, setCatalogos] = useState([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const canEdit = user?.role === "admin_general" || user?.role === "admin_convocatoria";

  const load = () => {
    if (!activeConvocatoriaId) return;
    const params = new URLSearchParams({ convocatoria_id: activeConvocatoriaId });
    if (estado && estado !== "__all__") params.set("estado", estado);
    const activeFilters = Object.fromEntries(
      Object.entries(filtros).filter(([, v]) => v !== "" && v !== "__all__" && v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0))
    );
    if (Object.keys(activeFilters).length > 0) params.set("filtros", JSON.stringify(activeFilters));
    if (search) params.set("search", search);
    api.get(`/propuestas?${params}`).then((r) => setItems(r.data));
  };
  useEffect(() => {
    if (!activeConvocatoriaId) return;
    api.get(`/campos?convocatoria_id=${activeConvocatoriaId}`).then((r) => setCampos(r.data));
    api.get(`/catalogos?convocatoria_id=${activeConvocatoriaId}`).then((r) => setCatalogos(r.data));
    setFiltros({}); // limpiar al cambiar de convocatoria
  }, [activeConvocatoriaId]);
  useEffect(() => { load(); }, [activeConvocatoriaId, estado, filtros, search]);

  // Campos disponibles para filtrar: los marcados con uso_filtro
  const camposFiltro = useMemo(() => campos.filter((c) => c.uso_filtro), [campos]);
  const catById = useMemo(() => Object.fromEntries(catalogos.map((c) => [c.id, c])), [catalogos]);
  const setFiltro = (key, val) => setFiltros((f) => ({ ...f, [key]: val }));
  const removeFiltro = (key) => setFiltros((f) => { const n = { ...f }; delete n[key]; return n; });
  // Filtros visibles como chips: los que tienen key presente (incluso si valor está vacío, el chip queda visible para que el usuario lo complete)
  const activeFilterKeys = useMemo(() => Object.keys(filtros), [filtros]);

  const downloadTemplate = () => {
    downloadFile(`/propuestas-template?convocatoria_id=${activeConvocatoriaId}`, "plantilla_propuestas.xlsx")
      .catch((e) => toast.error(e.message));
  };

  const handleImport = async () => {
    if (!file) return;
    const fd = new FormData();
    fd.append("convocatoria_id", activeConvocatoriaId);
    fd.append("file", file);
    try {
      const r = await api.post("/propuestas-import", fd);
      setImportResult(r.data);
      toast.success(`${r.data.creados} propuestas creadas, ${r.data.rechazados} con errores`);
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  const deletePropuesta = async (p) => {
    if (!confirm(`¿Eliminar la propuesta "${p.codigo} · ${p.nombre}"?\n\nSe borrarán también sus asignaciones y evaluaciones. Esta acción no se puede deshacer.`)) return;
    try {
      await api.delete(`/admin/propuestas/${p.id}`);
      toast.success("Propuesta eliminada");
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const changeEstado = async (p, nuevoEstado) => {
    try {
      await api.patch(`/propuestas/${p.id}`, { estado: nuevoEstado });
      toast.success(`Estado: ${nuevoEstado}`);
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  // Estados de propuesta (vienen del catálogo si existe, sino fallback estático)
  const [estadosCatalogo, setEstadosCatalogo] = useState([]);
  useEffect(() => {
    const cat = catalogos.find((c) => c.nombre === "Estados de Propuesta");
    if (cat) {
      setEstadosCatalogo((cat.valores || []).filter((v) => v.activo !== false).map((v) => v.valor));
    } else {
      setEstadosCatalogo(["Registrada", "En revisión documental", "Habilitada", "No habilitada", "Subsanación pendiente", "Subsanada", "Asignada", "En evaluación individual", "Rankeada", "Ganadora", "Elegible"]);
    }
  }, [catalogos]);

  if (!activeConvocatoriaId)
    return <div className="p-10 text-muted-foreground">Selecciona una convocatoria.</div>;

  return (
    <div className="flex-1 p-8 lg:p-10">
      <PageHeader
        eyebrow="Unidad operativa principal"
        title="Propuestas"
        subtitle="Registro, consulta y seguimiento de propuestas con expediente documental externo. Carga masiva mediante Excel y filtros por subregión, línea y estado."
        actions={
          <>
            {canEdit && (
              <Button
                onClick={() => { setEditing(null); setFormOpen(true); }}
                className="bg-[#14776A] hover:bg-[#0F5E54] rounded-sm gap-2"
                data-testid="prop-new-btn"
              >
                <Plus className="w-4 h-4" /> Nueva propuesta
              </Button>
            )}
            <Button variant="outline" className="rounded-sm gap-2" onClick={downloadTemplate} data-testid={TID.templateDownloadBtn}>
              <Download className="w-4 h-4" /> Plantilla
            </Button>
            <Dialog open={importOpen} onOpenChange={setImportOpen}>
              <DialogTrigger asChild>
                <Button className="bg-[#14776A] hover:bg-[#0F5E54] rounded-sm gap-2" data-testid={TID.importExcelBtn}>
                  <Upload className="w-4 h-4" /> Carga masiva
                </Button>
              </DialogTrigger>
              <DialogContent className="rounded-sm max-w-md">
                <DialogHeader><DialogTitle className="font-display">Cargar propuestas desde Excel</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">Descarga la plantilla, complétala y súbela. El sistema validará campos obligatorios.</p>
                  <input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0])} data-testid="import-file-input" className="block w-full text-sm" />
                  {importResult && (
                    <div className="text-xs space-y-1 border border-border rounded-sm p-2 bg-secondary">
                      <div>Creados: <strong className="text-[#0F5E54]">{importResult.creados}</strong></div>
                      <div>Rechazados: <strong className="text-red-700">{importResult.rechazados}</strong></div>
                      {importResult.errores?.slice(0, 3).map((e, i) => (
                        <div key={i} className="text-red-700">Fila {e.fila}: {e.error}</div>
                      ))}
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setImportOpen(false)} className="rounded-sm">Cerrar</Button>
                  <Button onClick={handleImport} disabled={!file} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-sm">Importar</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        }
      />

      <ConvocatoriaContextBanner />

      {/* Filters: search + estado fijos + chips dinámicos (patrón Airtable/Notion) */}
      <div className="mb-5">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar propuesta…" className="rounded-md pl-9 h-9 text-[13px]" data-testid="propuestas-search" />
          </div>
          <Select value={estado} onValueChange={setEstado}>
            <SelectTrigger className="rounded-md h-9 w-[180px] text-[13px]" data-testid="filter-estado"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos los estados</SelectItem>
              {estadosCatalogo.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Chips de filtros activos */}
          {activeFilterKeys.map((key) => {
            const campo = camposFiltro.find((c) => c.nombre_interno === key);
            if (!campo) return null;
            return (
              <ActiveFilterChip
                key={key}
                campo={campo}
                catalogo={catById[campo.catalogo_id]}
                value={filtros[key]}
                onChange={(v) => setFiltro(key, v)}
                onRemove={() => removeFiltro(key)}
              />
            );
          })}

          <AddFilterButton
            camposDisponibles={camposFiltro.filter((c) => !activeFilterKeys.includes(c.nombre_interno))}
            onAdd={(key) => setFiltro(key, "")}
          />

          {activeFilterKeys.length > 0 && (
            <button
              onClick={() => setFiltros({})}
              className="text-[12px] text-[#5E6878] hover:text-red-600 underline underline-offset-2"
              data-testid="clear-filters"
              title="Quitar todos los filtros"
            >
              Limpiar
            </button>
          )}

          <div className="text-xs text-muted-foreground self-center ml-auto font-mono tabular-nums">
            {items.length} resultado{items.length === 1 ? "" : "s"}
          </div>
        </div>
        {camposFiltro.length === 0 && (
          <p className="mt-2 text-[11.5px] text-muted-foreground italic">
            No hay campos marcados como "filtro" en esta convocatoria. Activa el flag <em>"filtro"</em> en
            {" "}<strong className="text-[#14776A] not-italic">Configuración → Campos</strong> para poder filtrar.
          </p>
        )}
      </div>

      {/* Columnas dinámicas según campos con uso_lista=true (default si no hay ninguno: subregion + linea) */}
      {(() => {
        const camposLista = campos.filter((c) => c.uso_lista);
        const colsConfig = camposLista.length > 0 ? camposLista : campos.filter((c) => ["subregion", "linea"].includes(c.nombre_interno));
        return (
          <div className="border border-border rounded-sm bg-white overflow-x-auto">
            <table className="w-full dense-table" data-testid={TID.propuestasTable}>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Propuesta</th>
                  <th>Organización</th>
                  {colsConfig.map((c) => <th key={c.id}>{c.nombre_visible}</th>)}
                  <th>Estado</th>
                  <th>Expediente</th>
                  {canEdit && <th className="text-right">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id} data-testid={`propuesta-row-${p.codigo}`}>
                    <td className="font-mono text-xs">{p.codigo}</td>
                    <td><div className="font-semibold">{p.nombre}</div></td>
                    <td className="text-muted-foreground">{p.organizacion || p.datos?.nombre_organizacion || "—"}</td>
                    {colsConfig.map((c) => (
                      <td key={c.id} className="text-[12.5px]">
                        {renderCellValue(p.datos?.[c.nombre_interno], c)}
                      </td>
                    ))}
                    <td>
                      {canEdit ? (
                        <Select value={p.estado || "Registrada"} onValueChange={(v) => changeEstado(p, v)}>
                          <SelectTrigger className="h-7 text-[11.5px] rounded-md min-w-[160px] border-[#E2E7EC]" data-testid={`prop-estado-${p.codigo}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {estadosCatalogo.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : <Badge tone={estadoTone(p.estado)}>{p.estado}</Badge>}
                    </td>
                    <td>
                      {p.datos?.link_expediente ? (
                        <a href={p.datos.link_expediente} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#0F5E54] hover:underline text-xs">
                          <ExternalLink className="w-3 h-3" /> Abrir
                        </a>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    {canEdit && (
                      <td className="text-right whitespace-nowrap">
                        <button
                          onClick={() => { setEditing(p); setFormOpen(true); }}
                          className="text-[#14776A] hover:text-[#0F5E54] p-1"
                          data-testid={`prop-edit-${p.codigo}`}
                          title="Editar propuesta"
                        ><Pencil className="w-4 h-4 inline" /></button>
                        <button
                          onClick={() => deletePropuesta(p)}
                          className="text-muted-foreground hover:text-red-600 p-1 ml-0.5"
                          data-testid={`prop-delete-${p.codigo}`}
                          title="Eliminar propuesta"
                        ><Trash2 className="w-4 h-4 inline" /></button>
                      </td>
                    )}
                  </tr>
                ))}
                {!items.length && <tr><td colSpan={5 + colsConfig.length + (canEdit ? 1 : 0)}><EmptyState title="Sin propuestas" hint="Crea una propuesta nueva o usa carga masiva para importar desde Excel." icon={FileStack} /></td></tr>}
              </tbody>
            </table>
          </div>
        );
      })()}

      <PropuestaForm
        open={formOpen}
        onOpenChange={setFormOpen}
        convocatoriaId={activeConvocatoriaId}
        campos={campos}
        catalogos={catalogos}
        propuesta={editing}
        onSaved={load}
      />
    </div>
  );
}
