import React, { useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Badge, EmptyState } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Settings2, Trash2, Pencil, Link2, Eye } from "lucide-react";
import SortableTable from "./SortableTable";
import InlineFlagsEditor from "./InlineFlagsEditor";
import PropuestaForm from "../propuestas/PropuestaForm";
import JuradoPerfilPreview from "./JuradoPerfilPreview";

const CAMPO_TIPOS = [
  "texto_corto", "texto_largo", "numero", "moneda", "porcentaje", "fecha",
  "hora", "email", "telefono", "url", "lista", "seleccion_multiple", "si_no",
  "archivo",
];

const TIPOS_QUE_USAN_CATALOGO = ["lista", "seleccion_multiple"];

// Roles especiales SOLO para campos con aplica_a=jurado.
// Determinan en qué sección se renderiza el campo en JuradoDetalle y MiPerfil.
const ROL_ESPECIAL_OPCIONES = [
  { value: "none", label: "— Sin rol especial (anexo común) —" },
  { value: "firma", label: "Firma (canvas + upload)" },
  { value: "hoja_vida", label: "Hoja de vida (archivo)" },
  { value: "documento", label: "Documento de identidad / Cédula" },
  { value: "foto", label: "Foto de perfil" },
];

const CAMPO_FLAGS = [
  { key: "uso_propuesta", label: "form propuesta", tone: "success", help: "Aparece en el formulario al crear/editar una propuesta. Si está apagado, el campo existe pero no se le pregunta al usuario." },
  { key: "uso_lista", label: "lista propuestas", tone: "info", help: "Aparece como columna en la tabla de Propuestas." },
  { key: "obligatorio", label: "obligatorio", tone: "info", help: "El campo no se puede dejar vacío al cargar una propuesta." },
  { key: "uso_filtro", label: "filtro", tone: "default", help: "Aparece como filtro en listados y reportes." },
  { key: "uso_ranking", label: "ranking", tone: "success", help: "Aparece como columna en el ranking final." },
  { key: "uso_desempate", label: "desempate", tone: "warning", help: "Se puede usar como criterio de desempate." },
  { key: "uso_actas", label: "actas", tone: "info", help: "Se incluye en actas y reportes oficiales." },
  { key: "editable", label: "editable", tone: "muted", help: "Permite editar el valor después de creada la propuesta." },
];

export default function CamposPanel({ campos, convId, reload, catalogos, aplicaA = "propuesta" }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const blank = {
    nombre_visible: "", nombre_interno: "", tipo: "texto_corto",
    obligatorio: false, orden: 0, uso_filtro: false, uso_ranking: false,
    uso_desempate: false, uso_actas: false, editable: true, catalogo_id: null,
    uso_propuesta: aplicaA === "propuesta", uso_lista: false, aplica_a: aplicaA,
  };
  const [f, setF] = useState(blank);
  const startEdit = (c) => { setEditing(c); setF({ ...blank, ...c }); setOpen(true); };
  const startNew = () => { setEditing(null); setF(blank); setOpen(true); };

  const submit = async () => {
    try {
      const payload = { ...f };
      if (!TIPOS_QUE_USAN_CATALOGO.includes(payload.tipo)) payload.catalogo_id = null;
      if (editing) {
        await api.patch(`/campos/${editing.id}`, payload);
        toast.success("Campo actualizado");
      } else {
        await api.post("/campos", { ...payload, convocatoria_id: convId });
        toast.success("Campo creado");
      }
      setOpen(false); setEditing(null); reload(); setF(blank);
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  const del = async (id) => {
    if (!confirm("¿Eliminar campo? Esto puede afectar propuestas existentes.")) return;
    await api.delete(`/campos/${id}`); reload();
  };

  const onReorder = async (ids) => {
    try {
      await api.post("/campos/reordenar", { convocatoria_id: convId, ids });
      reload();
    } catch (e) { toast.error("No se pudo reordenar"); }
  };

  const catById = Object.fromEntries((catalogos || []).map((c) => [c.id, c]));

  const columns = [
    { key: "orden", label: "#", sortable: true, width: 50,
      render: (_r, i) => <span className="font-mono text-muted-foreground">{i + 1}</span> },
    { key: "nombre_visible", label: "Nombre", sortable: true,
      render: (c) => <span className="font-semibold">{c.nombre_visible}</span> },
    { key: "nombre_interno", label: "Interno", sortable: true,
      render: (c) => <span className="font-mono text-xs text-muted-foreground">{c.nombre_interno}</span> },
    { key: "tipo", label: "Tipo", sortable: true,
      render: (c) => <Badge tone="muted">{c.tipo}</Badge> },
    { key: "catalogo", label: "Vinculación", sortable: false,
      sortValue: (c) => catById[c.catalogo_id]?.nombre || "",
      render: (c) => {
        if (!TIPOS_QUE_USAN_CATALOGO.includes(c.tipo)) return <span className="text-xs text-muted-foreground">—</span>;
        const cat = catById[c.catalogo_id];
        if (!cat) return <span className="inline-flex items-center gap-1 text-xs text-[#B45309]"><Link2 className="w-3 h-3" />sin catálogo</span>;
        return (
          <span className="inline-flex items-center gap-1.5 text-xs">
            <Link2 className="w-3 h-3 text-[#1D4ED8]" />
            <Badge tone="info">{cat.nombre}</Badge>
          </span>
        );
      } },
    { key: "flags", label: "Se usa en", sortable: false, render: (c) => (
      <InlineFlagsEditor
        endpoint={`/campos/${c.id}`}
        item={c}
        flags={CAMPO_FLAGS}
        onChange={reload}
      />
    ) },
    { key: "_actions", label: "", width: 80, render: (c) => (
      <div className="text-right space-x-1">
        <button onClick={() => startEdit(c)} data-testid={`edit-campo-${c.nombre_interno}`} className="text-[#14776A] hover:text-[#0F5E54] p-1"><Pencil className="w-4 h-4 inline" /></button>
        <button onClick={() => del(c.id)} data-testid={`del-campo-${c.nombre_interno}`} className="text-muted-foreground hover:text-red-600 p-1"><Trash2 className="w-4 h-4 inline" /></button>
      </div>
    ) },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-display font-bold text-[16px]">
            {aplicaA === "jurado" ? "Campos del perfil de jurados" : "Campos del formulario de propuestas"}
          </h3>
          <p className="text-[12.5px] text-[#5E6878] mt-0.5">
            {aplicaA === "jurado"
              ? <>Cada campo aparecerá en el perfil del jurado (Mi Perfil) y en su vista de detalle. Usa <strong>rol especial</strong> para anclar firma / hoja de vida / documento / foto a su sección.</>
              : <>Cada campo aparecerá al cargar una propuesta. El <strong>nombre interno</strong> es la clave que se guarda en <code className="text-[11px] bg-secondary px-1 rounded">datos_dinamicos</code>.</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setPreviewOpen(true)}
            className="rounded-lg gap-2 text-[12.5px]"
            data-testid="campos-preview-form"
            title={aplicaA === "jurado" ? "Ver cómo se verá Mi Perfil del jurado" : "Ver el formulario tal como se verá al crear una propuesta"}
          >
            <Eye className="w-4 h-4" /> {aplicaA === "jurado" ? "Vista previa del perfil" : "Vista previa del formulario"}
          </Button>
          <Dialog open={open} onOpenChange={(v) => { if (!v) { setEditing(null); setF(blank); } setOpen(v); }}>
            <DialogTrigger asChild>
              <Button onClick={startNew} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-lg gap-2" data-testid="add-campo-btn"><Plus className="w-4 h-4" />Nuevo campo</Button>
            </DialogTrigger>
          <DialogContent className="rounded-lg max-w-lg">
            <DialogHeader><DialogTitle className="font-display">{editing ? `Editar ${editing.nombre_visible}` : "Nuevo campo"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Nombre visible</Label>
                  <Input value={f.nombre_visible} onChange={(e) => setF({ ...f, nombre_visible: e.target.value })} className="rounded-lg" data-testid="campo-nombre-visible" />
                </div>
                <div>
                  <Label>Nombre interno</Label>
                  <Input disabled={!!editing} value={f.nombre_interno} onChange={(e) => setF({ ...f, nombre_interno: e.target.value.replace(/[^a-z0-9_]/gi, "_").toLowerCase() })} className="rounded-lg font-mono" data-testid="campo-nombre-interno" />
                </div>
              </div>
              <div>
                <Label>Tipo</Label>
                <Select value={f.tipo} onValueChange={(v) => setF({ ...f, tipo: v })}>
                  <SelectTrigger className="rounded-lg" data-testid="campo-tipo-select"><SelectValue /></SelectTrigger>
                  <SelectContent>{CAMPO_TIPOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {TIPOS_QUE_USAN_CATALOGO.includes(f.tipo) && (
                <div>
                  <Label className="flex items-center gap-1"><Link2 className="w-3 h-3" />Catálogo vinculado <span className="text-[10px] text-muted-foreground font-normal">(de dónde sale la lista de opciones)</span></Label>
                  <Select value={f.catalogo_id || "none"} onValueChange={(v) => setF({ ...f, catalogo_id: v === "none" ? null : v })}>
                    <SelectTrigger className="rounded-lg" data-testid="campo-catalogo-select"><SelectValue placeholder="Selecciona un catálogo…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Sin catálogo (definir luego) —</SelectItem>
                      {(catalogos || []).map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre} ({(c.valores || []).length} valores)</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {!catalogos?.length && (
                    <p className="text-[11px] text-[#B45309] mt-1">No hay catálogos. Crea uno en la pestaña "Catálogos" primero.</p>
                  )}
                </div>
              )}
              {aplicaA === "jurado" && (
                <div className="border border-[#CDE7E1] bg-[#F0F7F5] rounded-lg p-3">
                  <Label className="text-[12px] font-semibold">Rol especial en el perfil del jurado</Label>
                  <p className="text-[11px] text-muted-foreground mb-2">
                    Si seleccionas un rol especial, este campo se mostrará en su sección dedicada del detalle del jurado
                    (firma, hoja de vida, documento, foto) en lugar de aparecer en "Información adicional".
                    Solo puede haber un campo por rol especial dentro de la convocatoria.
                  </p>
                  <Select value={f.rol_especial || "none"} onValueChange={(v) => setF({ ...f, rol_especial: v === "none" ? null : v })}>
                    <SelectTrigger className="rounded-lg bg-white" data-testid="campo-rol-especial-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROL_ESPECIAL_OPCIONES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center justify-between border border-border rounded-lg p-2"><Label className="text-xs">Obligatorio</Label><Switch checked={!!f.obligatorio} onCheckedChange={(v) => setF({ ...f, obligatorio: v })} /></div>
                <div className="flex items-center justify-between border border-border rounded-lg p-2"><Label className="text-xs">Filtrable</Label><Switch checked={!!f.uso_filtro} onCheckedChange={(v) => setF({ ...f, uso_filtro: v })} /></div>
                <div className="flex items-center justify-between border border-border rounded-lg p-2"><Label className="text-xs">Uso ranking</Label><Switch checked={!!f.uso_ranking} onCheckedChange={(v) => setF({ ...f, uso_ranking: v })} /></div>
                <div className="flex items-center justify-between border border-border rounded-lg p-2"><Label className="text-xs">Desempate</Label><Switch checked={!!f.uso_desempate} onCheckedChange={(v) => setF({ ...f, uso_desempate: v })} /></div>
                <div className="flex items-center justify-between border border-border rounded-lg p-2"><Label className="text-xs">Editable</Label><Switch checked={f.editable !== false} onCheckedChange={(v) => setF({ ...f, editable: v })} /></div>
                <div className="flex items-center justify-between border border-border rounded-lg p-2"><Label className="text-xs">Uso en actas</Label><Switch checked={!!f.uso_actas} onCheckedChange={(v) => setF({ ...f, uso_actas: v })} /></div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} className="rounded-lg">Cancelar</Button>
              <Button onClick={submit} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-lg" data-testid="campo-submit-btn">{editing ? "Guardar cambios" : "Crear"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <SortableTable
        items={campos}
        columns={columns}
        onReorder={onReorder}
        searchKeys={["nombre_visible", "nombre_interno", "tipo"]}
        searchPlaceholder="Buscar campos…"
        testIdPrefix="campo-row"
        emptyState={<EmptyState title="Sin campos configurados" hint="Crea los campos que tendrá cada propuesta." icon={Settings2} />}
      />

      {/* Vista previa: del formulario propuesta o del perfil del jurado según aplicaA */}
      {aplicaA === "jurado" ? (
        <JuradoPerfilPreview open={previewOpen} onOpenChange={setPreviewOpen} campos={campos} />
      ) : (
        <PropuestaForm
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          convocatoriaId={convId}
          campos={campos}
          catalogos={catalogos}
          propuesta={null}
          previewMode={true}
          onSaved={() => {}}
        />
      )}
    </div>
  );
}
