import React, { useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Badge, EmptyState } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Search } from "lucide-react";

export default function CatalogosPanel({ catalogos, convId, reload, campos }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [query, setQuery] = useState("");
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
  const del = async (id) => {
    if (!confirm("¿Desactivar catálogo? Los valores quedarán inactivos.")) return;
    await api.delete(`/catalogos/${id}`); reload();
  };

  // Para cada catálogo, calcular cuántos campos lo usan
  const usageByCat = {};
  (campos || []).forEach((ca) => {
    if (ca.catalogo_id) {
      usageByCat[ca.catalogo_id] = (usageByCat[ca.catalogo_id] || []);
      usageByCat[ca.catalogo_id].push(ca.nombre_visible);
    }
  });

  const filtered = catalogos.filter((c) =>
    !query || c.nombre.toLowerCase().includes(query.toLowerCase()) ||
    (c.descripcion || "").toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-display font-bold text-[16px]">Catálogos (listas de valores reutilizables)</h3>
          <p className="text-[12.5px] text-[#5E6878] mt-0.5">
            Un catálogo es una lista de opciones que se usa en campos tipo <code className="text-[11px] bg-secondary px-1 rounded">lista</code> o <code className="text-[11px] bg-secondary px-1 rounded">selección múltiple</code>.
            Ej: <em>Subregiones, Tipos de organización</em>.
          </p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { if (!v) { setEditing(null); setF(blank); } setOpen(v); }}>
          <DialogTrigger asChild>
            <Button onClick={startNew} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-lg gap-2" data-testid="add-catalogo-btn"><Plus className="w-4 h-4" />Nuevo catálogo</Button>
          </DialogTrigger>
          <DialogContent className="rounded-lg max-w-lg">
            <DialogHeader><DialogTitle className="font-display">{editing ? `Editar ${editing.nombre}` : "Nuevo catálogo"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Nombre</Label><Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} className="rounded-lg" /></div>
              <div><Label>Descripción</Label><Input value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} className="rounded-lg" /></div>
              <div>
                <Label>Valores (uno por línea)</Label>
                <textarea value={f.valores} onChange={(e) => setF({ ...f, valores: e.target.value })} rows={8} className="w-full border border-border rounded-lg px-3 py-2 text-sm font-mono" />
                <p className="text-[11px] text-[#5E6878] mt-1">{editing ? "Al guardar se reemplaza la lista de valores con la nueva." : ""}</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} className="rounded-lg">Cancelar</Button>
              <Button onClick={submit} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-lg">{editing ? "Guardar" : "Crear"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-sm mb-3">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar catálogos…" className="pl-9 rounded-lg h-9" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {filtered.map((c) => {
          const uses = usageByCat[c.id] || [];
          return (
            <div key={c.id} className="border border-border rounded-lg bg-white p-4 shadow-card">
              <div className="flex items-center justify-between">
                <div className="font-display font-bold">{c.nombre}</div>
                <div className="flex items-center gap-1">
                  <Badge tone={c.activo ? "success" : "muted"}>{c.activo ? "activo" : "inactivo"}</Badge>
                  <button onClick={() => startEdit(c)} className="text-[#14776A] hover:text-[#0F5E54] p-1" data-testid={`edit-cat-${c.id}`}><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => del(c.id)} className="text-muted-foreground hover:text-red-600 p-1"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{c.descripcion}</p>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {(c.valores || []).slice(0, 10).map((v) => <Badge key={v.id || v.valor} tone="muted">{v.valor}</Badge>)}
                {(c.valores || []).length > 10 && <Badge tone="default">+{c.valores.length - 10}</Badge>}
              </div>

              <div className="border-t border-border mt-3 pt-2 text-[11.5px]">
                <span className="text-muted-foreground">Vinculado a: </span>
                {uses.length === 0
                  ? <span className="italic text-[#B45309]">ningún campo aún</span>
                  : uses.map((u) => <Badge key={u} tone="info">{u}</Badge>)}
              </div>
            </div>
          );
        })}
        {!filtered.length && <div className="col-span-full"><EmptyState title="Sin catálogos" hint="Crea listas reutilizables como Subregiones, Tipos de organización, etc." /></div>}
      </div>
    </div>
  );
}
