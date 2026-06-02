import React, { useEffect, useState, useMemo } from "react";
import { api, formatApiError, downloadFile } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader, { Badge, estadoTone, EmptyState } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Upload, Download, ExternalLink, Search, FileStack, Pencil } from "lucide-react";
import { TID } from "@/constants/testIds";
import PropuestaForm from "./propuestas/PropuestaForm";

export default function Propuestas() {
  const { activeConvocatoriaId, user } = useAuth();
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState("__all__");
  const [subregion, setSubregion] = useState("__all__");
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
    if (subregion && subregion !== "__all__") params.set("subregion", subregion);
    if (search) params.set("search", search);
    api.get(`/propuestas?${params}`).then((r) => setItems(r.data));
  };
  useEffect(() => {
    if (!activeConvocatoriaId) return;
    api.get(`/campos?convocatoria_id=${activeConvocatoriaId}`).then((r) => setCampos(r.data));
    api.get(`/catalogos?convocatoria_id=${activeConvocatoriaId}`).then((r) => setCatalogos(r.data));
  }, [activeConvocatoriaId]);
  useEffect(() => { load(); }, [activeConvocatoriaId, estado, subregion, search]);

  const subregiones = useMemo(() => {
    const c = catalogos.find((x) => x.nombre.toLowerCase().includes("subreg"));
    return c?.valores || [];
  }, [catalogos]);

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

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-5">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-2.5 top-3 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar propuesta…" className="rounded-sm pl-9" data-testid="propuestas-search" />
        </div>
        <Select value={estado} onValueChange={setEstado}>
          <SelectTrigger className="rounded-sm" data-testid="filter-estado"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos los estados</SelectItem>
            {["Registrada", "En revisión documental", "Habilitada", "No habilitada", "Asignada", "En evaluación individual", "Rankeada", "Ganadora", "Elegible"].map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={subregion} onValueChange={setSubregion}>
          <SelectTrigger className="rounded-sm" data-testid="filter-subregion"><SelectValue placeholder="Subregión" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todas las subregiones</SelectItem>
            {subregiones.map((v) => <SelectItem key={v.id} value={v.valor}>{v.valor}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground self-center text-right font-mono">
          {items.length} resultado{items.length === 1 ? "" : "s"}
        </div>
      </div>

      <div className="border border-border rounded-sm bg-white overflow-x-auto">
        <table className="w-full dense-table" data-testid={TID.propuestasTable}>
          <thead>
            <tr>
              <th>Código</th><th>Propuesta</th><th>Organización</th><th>Subregión</th><th>Línea</th>
              <th>Estado</th><th>Expediente</th>
              {canEdit && <th className="text-right">Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} data-testid={`propuesta-row-${p.codigo}`}>
                <td className="font-mono text-xs">{p.codigo}</td>
                <td><div className="font-semibold">{p.nombre}</div></td>
                <td className="text-muted-foreground">{p.organizacion || p.datos?.nombre_organizacion || "—"}</td>
                <td>{p.datos?.subregion || "—"}</td>
                <td>{p.datos?.linea || "—"}</td>
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
            {!items.length && <tr><td colSpan={canEdit ? 8 : 7}><EmptyState title="Sin propuestas" hint="Crea una propuesta nueva o usa carga masiva para importar desde Excel." icon={FileStack} /></td></tr>}
          </tbody>
        </table>
      </div>

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
