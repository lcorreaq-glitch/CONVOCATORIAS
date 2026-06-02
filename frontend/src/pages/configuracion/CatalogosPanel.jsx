import React, { useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Badge, EmptyState } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, ListChecks, Eye } from "lucide-react";
import SortableTable from "./SortableTable";

export default function CatalogosPanel({ catalogos, convId, reload, campos }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const blank = { nombre: "", descripcion: "", valores: "" };
  const [f, setF] = useState(blank);

  const startEdit = (c) => {
    setEditing(c);
    setF({ nombre: c.nombre, descripcion: c.descripcion || "", valores: (c.valores || []).map((v) => v.valor).join("\n") });
    setOpen(true);
  };
  const startNew = () => { setEditing(null); setF(blank); setOpen(true); };

  const submit = async () => {
    try {
      const valores = f.valores.split("\n").map((v) => v.trim()).filter(Boolean).map((v) => ({ valor: v, activo: true }));
      if (!f.nombre.trim()) { toast.error("El nombre es obligatorio"); return; }
      if (editing) {
        await api.patch(`/catalogos/${editing.id}`, { nombre: f.nombre, descripcion: f.descripcion, valores });
        toast.success("Catálogo actualizado");
      } else {
        await api.post("/catalogos", { convocatoria_id: convId, nombre: f.nombre, descripcion: f.descripcion, activo: true, valores });
        toast.success("Catálogo creado");
      }
      setOpen(false); setEditing(null); reload(); setF(blank);
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  // Calcular qué campos usan cada catálogo
  const usageByCat = {};
  (campos || []).forEach((ca) => {
    if (ca.catalogo_id) {
      usageByCat[ca.catalogo_id] = usageByCat[ca.catalogo_id] || [];
      usageByCat[ca.catalogo_id].push({ id: ca.id, nombre: ca.nombre_visible });
    }
  });

  const del = async (c) => {
    const uses = usageByCat[c.id] || [];
    if (uses.length > 0) {
      toast.error(`No se puede eliminar: está vinculado a ${uses.length} campo(s). Quita la vinculación primero.`);
      return;
    }
    if (!confirm(`¿Eliminar el catálogo "${c.nombre}"? Esta acción no se puede deshacer.`)) return;
    try {
      await api.delete(`/catalogos/${c.id}`);
      toast.success("Catálogo eliminado");
      reload();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const columns = [
    { key: "_idx", label: "#", sortable: false, width: 50, render: (_r, i) => <span className="font-mono text-muted-foreground">{i + 1}</span> },
    { key: "nombre", label: "Catálogo", sortable: true, render: (c) => (
      <div>
        <div className="font-semibold">{c.nombre || <span className="italic text-muted-foreground">(sin nombre)</span>}</div>
        {c.descripcion && <div className="text-xs text-muted-foreground line-clamp-1">{c.descripcion}</div>}
      </div>
    )},
    { key: "_count", label: "Valores", sortable: true, width: 100,
      sortValue: (c) => (c.valores || []).length,
      render: (c) => {
        const vals = c.valores || [];
        return (
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#1D4ED8] hover:underline"
                title="Ver valores"
                data-testid={`view-vals-${c.id}`}
              >
                <Eye className="w-3 h-3" />{vals.length}
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-3 max-h-72 overflow-auto">
              <div className="text-[11px] uppercase tracking-wide font-display font-bold text-[#5E6878] mb-2">Valores ({vals.length})</div>
              <div className="flex flex-wrap gap-1.5">
                {vals.length === 0
                  ? <span className="text-xs italic text-muted-foreground">sin valores</span>
                  : vals.map((v) => <Badge key={v.id || v.valor} tone="muted">{v.valor}</Badge>)}
              </div>
            </PopoverContent>
          </Popover>
        );
      }
    },
    { key: "_uso", label: "Usado por (campos)", sortable: false, render: (c) => {
      const uses = usageByCat[c.id] || [];
      if (uses.length === 0) return <span className="text-[11.5px] italic text-[#B45309]">sin uso</span>;
      return (
        <div className="flex flex-wrap gap-1">
          {uses.slice(0, 3).map((u) => <Badge key={u.id} tone="info">{u.nombre}</Badge>)}
          {uses.length > 3 && <Badge tone="default">+{uses.length - 3}</Badge>}
        </div>
      );
    }},
    { key: "activo", label: "Estado", sortable: true, render: (c) => c.activo !== false ? <Badge tone="success">activo</Badge> : <Badge tone="muted">inactivo</Badge> },
    { key: "_actions", label: "", width: 80, render: (c) => (
      <div className="text-right space-x-1">
        <button onClick={() => startEdit(c)} className="text-[#14776A] hover:text-[#0F5E54] p-1" data-testid={`edit-cat-${c.id}`}><Pencil className="w-4 h-4 inline" /></button>
        <button onClick={() => del(c)} className="text-muted-foreground hover:text-red-600 p-1" data-testid={`del-cat-${c.id}`}><Trash2 className="w-4 h-4 inline" /></button>
      </div>
    )},
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-display font-bold text-[16px] flex items-center gap-2"><ListChecks className="w-4 h-4 text-[#1D4ED8]" />Catálogos (listas de valores reutilizables)</h3>
          <p className="text-[12.5px] text-[#5E6878] mt-0.5 max-w-3xl">
            Un catálogo es una <strong>lista de opciones</strong> reutilizable. Se usa para alimentar campos
            tipo <code className="text-[11px] bg-secondary px-1 rounded">lista</code> o <code className="text-[11px] bg-secondary px-1 rounded">selección múltiple</code>.
            Ej: <em>Subregiones, Tipos de organización</em>.
          </p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { if (!v) { setEditing(null); setF(blank); } setOpen(v); }}>
          <DialogTrigger asChild>
            <Button onClick={startNew} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-lg gap-2" data-testid="add-catalogo-btn"><Plus className="w-4 h-4" />Nuevo catálogo</Button>
          </DialogTrigger>
          <DialogContent className="rounded-lg max-w-lg">
            <DialogHeader><DialogTitle className="font-display">{editing ? `Editar ${editing.nombre || "catálogo"}` : "Nuevo catálogo"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Nombre</Label><Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} className="rounded-lg" data-testid="cat-nombre-input" /></div>
              <div><Label>Descripción</Label><Input value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} className="rounded-lg" /></div>
              <div>
                <Label>Valores (uno por línea)</Label>
                <textarea value={f.valores} onChange={(e) => setF({ ...f, valores: e.target.value })} rows={8} className="w-full border border-border rounded-lg px-3 py-2 text-sm font-mono" data-testid="cat-valores-input" />
                <p className="text-[11px] text-[#5E6878] mt-1">{editing ? "Al guardar se reemplaza la lista de valores con la nueva." : ""}</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} className="rounded-lg">Cancelar</Button>
              <Button onClick={submit} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-lg" data-testid="cat-submit-btn">{editing ? "Guardar" : "Crear"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <SortableTable
        items={catalogos}
        columns={columns}
        searchKeys={["nombre", "descripcion"]}
        searchPlaceholder="Buscar catálogos…"
        testIdPrefix="catalogo-row"
        emptyState={<EmptyState title="Sin catálogos" hint="Crea listas reutilizables como Subregiones, Tipos de organización, etc." />}
      />
    </div>
  );
}
