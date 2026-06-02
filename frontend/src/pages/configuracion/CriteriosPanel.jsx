import React, { useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Badge, EmptyState } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Pencil } from "lucide-react";
import SortableTable from "./SortableTable";

export default function CriteriosPanel({ criterios, convId, reload }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const blank = { nombre: "", descripcion: "", puntaje_min: 0, puntaje_max: 10, ponderacion: 10, oficial: true, diferencial: false, orden: 0 };
  const [f, setF] = useState(blank);
  const startEdit = (c) => { setEditing(c); setF({ ...blank, ...c }); setOpen(true); };
  const startNew = () => { setEditing(null); setF({ ...blank, orden: (criterios.length || 0) + 1 }); setOpen(true); };
  const submit = async () => {
    try {
      if (editing) { await api.patch(`/criterios/${editing.id}`, f); toast.success("Criterio actualizado"); }
      else { await api.post("/criterios", { ...f, convocatoria_id: convId }); toast.success("Criterio creado"); }
      setOpen(false); setEditing(null); reload();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  const del = async (id) => { if (!confirm("¿Eliminar criterio?")) return; await api.delete(`/criterios/${id}`); reload(); };

  const onReorder = async (ids) => {
    try { await api.post("/criterios/reordenar", { convocatoria_id: convId, ids }); reload(); }
    catch (e) { toast.error("No se pudo reordenar"); }
  };

  const totalOficial = criterios.filter((c) => c.oficial).reduce((s, c) => s + (c.puntaje_max || 0), 0);

  const columns = [
    { key: "orden", label: "#", sortable: true, width: 50, render: (_r, i) => <span className="font-mono text-muted-foreground">{i + 1}</span> },
    { key: "nombre", label: "Criterio", sortable: true, render: (c) => (
      <div>
        <div className="font-semibold">{c.nombre}</div>
        {c.descripcion && <div className="text-xs text-muted-foreground line-clamp-1">{c.descripcion}</div>}
      </div>
    )},
    { key: "rango", label: "Rango", sortable: true, sortValue: (c) => c.puntaje_max || 0, render: (c) => <span className="font-mono tabular-nums">{c.puntaje_min} – {c.puntaje_max}</span> },
    { key: "ponderacion", label: "Ponderación", sortable: true, render: (c) => <span className="font-mono tabular-nums">{c.ponderacion}</span> },
    { key: "tipo", label: "Tipo", sortable: true, sortValue: (c) => c.diferencial ? 1 : 0, render: (c) => c.diferencial ? <Badge tone="warning">diferencial</Badge> : <Badge tone="success">oficial (suma al total)</Badge> },
    { key: "uso", label: "Se usa en", sortable: false, render: () => (
      <div className="flex gap-1 flex-wrap">
        <Badge tone="info">eval. individual</Badge>
        <Badge tone="info">eval. colectiva</Badge>
      </div>
    )},
    { key: "_actions", label: "", width: 80, render: (c) => (
      <div className="text-right space-x-1">
        <button onClick={() => startEdit(c)} className="text-[#14776A] hover:text-[#0F5E54] p-1" data-testid={`edit-crit-${c.id}`}><Pencil className="w-4 h-4 inline" /></button>
        <button onClick={() => del(c.id)} className="text-muted-foreground hover:text-red-600 p-1"><Trash2 className="w-4 h-4 inline" /></button>
      </div>
    )},
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-display font-bold text-[16px]">Criterios de evaluación (rúbrica)</h3>
          <p className="text-[12.5px] text-[#5E6878] mt-0.5">
            Cada jurado puntuará cada criterio. Los criterios <strong>oficiales</strong> suman al puntaje total;
            los <strong>diferenciales</strong> registran información complementaria sin afectar el total.
          </p>
          <p className="text-[12.5px] text-[#14776A] mt-1.5 font-semibold">
            Puntaje oficial máximo: <span className="tabular-nums">{totalOficial}</span>
            {totalOficial !== 100 && totalOficial > 0 && <span className="text-[#B45309] ml-2">⚠ usualmente se calibra a 100</span>}
          </p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { if (!v) { setEditing(null); setF(blank); } setOpen(v); }}>
          <DialogTrigger asChild><Button onClick={startNew} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-lg gap-2" data-testid="add-criterio-btn"><Plus className="w-4 h-4" />Nuevo criterio</Button></DialogTrigger>
          <DialogContent className="rounded-lg max-w-lg">
            <DialogHeader><DialogTitle className="font-display">{editing ? `Editar ${editing.nombre}` : "Nuevo criterio"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Nombre</Label><Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} className="rounded-lg" /></div>
              <div><Label>Descripción</Label><Input value={f.descripcion || ""} onChange={(e) => setF({ ...f, descripcion: e.target.value })} className="rounded-lg" /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Mín</Label><Input type="number" value={f.puntaje_min} onChange={(e) => setF({ ...f, puntaje_min: +e.target.value })} className="rounded-lg" /></div>
                <div><Label>Máx</Label><Input type="number" value={f.puntaje_max} onChange={(e) => setF({ ...f, puntaje_max: +e.target.value })} className="rounded-lg" /></div>
                <div><Label>Ponderación</Label><Input type="number" value={f.ponderacion} onChange={(e) => setF({ ...f, ponderacion: +e.target.value })} className="rounded-lg" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center justify-between border border-border rounded-lg p-2"><Label className="text-xs">Oficial (suma al total)</Label><Switch checked={!!f.oficial} onCheckedChange={(v) => setF({ ...f, oficial: v })} /></div>
                <div className="flex items-center justify-between border border-border rounded-lg p-2"><Label className="text-xs">Diferencial</Label><Switch checked={!!f.diferencial} onCheckedChange={(v) => setF({ ...f, diferencial: v })} /></div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} className="rounded-lg">Cancelar</Button>
              <Button onClick={submit} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-lg">{editing ? "Guardar" : "Crear"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <SortableTable
        items={criterios}
        columns={columns}
        onReorder={onReorder}
        searchKeys={["nombre", "descripcion"]}
        searchPlaceholder="Buscar criterios…"
        testIdPrefix="criterio-row"
        emptyState={<EmptyState title="Sin criterios" hint="Crea la rúbrica con la que los jurados evaluarán cada propuesta." />}
      />
    </div>
  );
}
