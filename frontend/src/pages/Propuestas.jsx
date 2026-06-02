import React, { useEffect, useState, useMemo } from "react";
import { api, formatApiError, downloadFile } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader, { Badge, estadoTone, EmptyState } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Upload, Download, ExternalLink, Search, FileStack, Pencil, X } from "lucide-react";
import { TID } from "@/constants/testIds";
import PropuestaForm from "./propuestas/PropuestaForm";
import ConvocatoriaContextBanner from "@/components/ConvocatoriaContextBanner";

function renderCellValue(v, campo) {
  if (v === null || v === undefined || v === "") return <span className="text-muted-foreground">—</span>;
  if (Array.isArray(v)) return v.length === 0 ? <span className="text-muted-foreground">—</span> : v.join(", ");
  if (campo?.tipo === "si_no") return v ? "Sí" : "No";
  if (campo?.tipo === "url") return <a href={v} target="_blank" rel="noreferrer" className="text-[#0F5E54] hover:underline">abrir</a>;
  return String(v);
}

function DynamicFilter({ campo, catalogo, value, onChange }) {
  const tipo = campo.tipo;
  const placeholder = `${campo.nombre_visible}…`;
  const testId = `filter-${campo.nombre_interno}`;

  // si_no → 3-state select (todos / sí / no)
  if (tipo === "si_no") {
    return (
      <Select value={value ?? "__all__"} onValueChange={onChange}>
        <SelectTrigger className="rounded-sm w-[180px]" data-testid={testId}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">{campo.nombre_visible}: todos</SelectItem>
          <SelectItem value={true}>Sí</SelectItem>
          <SelectItem value={false}>No</SelectItem>
        </SelectContent>
      </Select>
    );
  }
  // listas con catálogo
  if ((tipo === "lista" || tipo === "seleccion_multiple") && catalogo) {
    const valores = (catalogo.valores || []).filter((v) => v.activo !== false);
    return (
      <Select value={value ?? "__all__"} onValueChange={onChange}>
        <SelectTrigger className="rounded-sm w-[200px]" data-testid={testId}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">{campo.nombre_visible}: todos</SelectItem>
          {valores.map((v) => <SelectItem key={v.id || v.valor} value={v.valor}>{v.valor}</SelectItem>)}
        </SelectContent>
      </Select>
    );
  }
  // fecha → input date
  if (tipo === "fecha") {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-muted-foreground">{campo.nombre_visible}:</span>
        <Input type="date" value={value || ""} onChange={(e) => onChange(e.target.value)} className="rounded-sm w-[150px]" data-testid={testId} />
        {value && <button onClick={() => onChange("")} className="text-muted-foreground hover:text-red-500"><X className="w-3 h-3" /></button>}
      </div>
    );
  }
  // numérico → input + signo
  if (["numero", "moneda", "porcentaje"].includes(tipo)) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-muted-foreground">{campo.nombre_visible}:</span>
        <Input type="number" value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} className="rounded-sm w-[120px]" data-testid={testId} placeholder="valor exacto" />
        {value !== "" && value !== undefined && <button onClick={() => onChange("")} className="text-muted-foreground hover:text-red-500"><X className="w-3 h-3" /></button>}
      </div>
    );
  }
  // default → input texto
  return (
    <div className="flex items-center gap-1.5">
      <Input value={value || ""} onChange={(e) => onChange(e.target.value)} className="rounded-sm w-[180px]" placeholder={placeholder} data-testid={testId} />
      {value && <button onClick={() => onChange("")} className="text-muted-foreground hover:text-red-500"><X className="w-3 h-3" /></button>}
    </div>
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

      {/* Filters: dynamic - shows search + estado + any campo with uso_filtro=true */}
      <div className="mb-5">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="w-4 h-4 absolute left-2.5 top-3 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar propuesta…" className="rounded-sm pl-9" data-testid="propuestas-search" />
          </div>
          <Select value={estado} onValueChange={setEstado}>
            <SelectTrigger className="rounded-sm w-[200px]" data-testid="filter-estado"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos los estados</SelectItem>
              {["Registrada", "En revisión documental", "Habilitada", "No habilitada", "Asignada", "En evaluación individual", "Rankeada", "Ganadora", "Elegible"].map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {camposFiltro.map((c) => (
            <DynamicFilter key={c.id} campo={c} catalogo={catById[c.catalogo_id]} value={filtros[c.nombre_interno]} onChange={(v) => setFiltro(c.nombre_interno, v)} />
          ))}
          <div className="text-xs text-muted-foreground self-center ml-auto font-mono">
            {items.length} resultado{items.length === 1 ? "" : "s"}
          </div>
        </div>
        {camposFiltro.length === 0 && (
          <p className="mt-2 text-[11.5px] text-muted-foreground italic">
            No hay campos marcados como "filtro" en esta convocatoria. Ve a <strong className="text-[#14776A] not-italic">Configuración → Campos</strong> y activa el flag <em>"filtro"</em> en los campos que quieras filtrar aquí.
          </p>
        )}
        {Object.keys(filtros).some((k) => filtros[k] && filtros[k] !== "__all__") && (
          <button
            onClick={() => setFiltros({})}
            className="mt-2 text-[11.5px] text-[#14776A] hover:underline font-semibold"
            data-testid="clear-filters"
          >
            Limpiar filtros
          </button>
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
                    <td><Badge tone={estadoTone(p.estado)}>{p.estado}</Badge></td>
                    <td>
                      {p.datos?.link_expediente ? (
                        <a href={p.datos.link_expediente} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#0F5E54] hover:underline text-xs">
                          <ExternalLink className="w-3 h-3" /> Abrir
                        </a>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    {canEdit && (
                      <td className="text-right">
                        <button
                          onClick={() => { setEditing(p); setFormOpen(true); }}
                          className="text-[#14776A] hover:text-[#0F5E54] p-1"
                          data-testid={`prop-edit-${p.codigo}`}
                          title="Editar propuesta"
                        ><Pencil className="w-4 h-4 inline" /></button>
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
