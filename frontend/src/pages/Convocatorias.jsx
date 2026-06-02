import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import PageHeader, { Badge, estadoTone } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, FolderOpen, Pencil, Trash2 } from "lucide-react";
import { TID } from "@/constants/testIds";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";

export default function Convocatorias() {
  const { setConv, user } = useAuth();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ codigo: "", nombre: "", descripcion: "", vigencia: "", tipo: "" });

  const load = () => api.get("/convocatorias").then((r) => setItems(r.data));
  useEffect(() => { load(); }, []);

  const onCreate = async () => {
    try {
      const r = await api.post("/convocatorias", { ...form, estado: "Borrador" });
      toast.success(`Convocatoria ${r.data.codigo} creada`);
      setOpen(false);
      setForm({ codigo: "", nombre: "", descripcion: "", vigencia: "", tipo: "" });
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  const onDelete = async (c) => {
    const yes = confirm(`¿Eliminar la convocatoria "${c.nombre}"?\n\nEsta acción puede afectar propuestas, jurados y configuración asociada. Se cancelará si existen evaluaciones registradas.`);
    if (!yes) return;
    try {
      const r = await api.delete(`/convocatorias/${c.id}`);
      if (r.data.blocked) {
        const det = Object.entries(r.data.bloqueos || {}).filter(([_, v]) => v).map(([k, v]) => `${k}: ${v}`).join(" · ");
        toast.error(`No se puede eliminar: ${r.data.reason}\nBloqueos → ${det}\nSugerencia: ${r.data.sugerencia}`, { duration: 10000 });
        return;
      }
      toast.success(`Convocatoria ${c.codigo} eliminada`);
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const canCreate = user?.role === "admin_general" || user?.role === "admin_convocatoria";

  return (
    <div className="flex-1 p-8 lg:p-10">
      <PageHeader
        eyebrow="Catálogo de procesos"
        title="Convocatorias"
        subtitle="Gestiona y configura todos los procesos de selección, evaluación y reconocimiento. Cada convocatoria opera de manera independiente con sus propios campos, jurados y criterios."
        actions={canCreate && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button data-testid={TID.createBtn} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-sm gap-2">
                <Plus className="w-4 h-4" /> Nueva convocatoria
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-sm max-w-lg">
              <DialogHeader><DialogTitle className="font-display">Nueva convocatoria</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Código</Label><Input data-testid="conv-codigo" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} placeholder="INC2026" className="rounded-sm" /></div>
                <div><Label>Nombre</Label><Input data-testid="conv-nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="rounded-sm" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Vigencia</Label><Input value={form.vigencia} onChange={(e) => setForm({ ...form, vigencia: e.target.value })} placeholder="2026" className="rounded-sm" /></div>
                  <div><Label>Tipo</Label><Input value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} placeholder="Estímulo" className="rounded-sm" /></div>
                </div>
                <div><Label>Descripción</Label><Textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} rows={3} className="rounded-sm" /></div>
              </div>
              <DialogFooter>
                <Button data-testid={TID.cancelBtn} variant="outline" className="rounded-sm" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button data-testid={TID.saveBtn} onClick={onCreate} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-sm">Crear</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      />

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {items.map((c) => (
          <div
            key={c.id}
            data-testid={`conv-card-${c.codigo}`}
            className="border border-border rounded-sm bg-white p-5 hover:border-[#CDE7E1] transition-colors group"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="font-mono text-[11px] text-muted-foreground">{c.codigo}</div>
              <Badge tone={estadoTone(c.estado)}>{c.estado}</Badge>
            </div>
            <div className="font-display font-bold text-lg leading-tight">{c.nombre}</div>
            <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{c.descripcion}</p>
            <div className="mt-4 pt-3 border-t border-border flex items-center gap-3 text-[11px] text-muted-foreground">
              <span>Vigencia <strong className="text-foreground">{c.vigencia}</strong></span>
              <span className="w-px h-3 bg-border" />
              <span>Etapa <strong className="text-foreground">{c.etapa_actual || "—"}</strong></span>
              <span className="w-px h-3 bg-border" />
              <span>{(c.entidades || []).length} entidad{(c.entidades || []).length === 1 ? "" : "es"}</span>
            </div>
            <div className="mt-4 flex gap-2">
              <Button size="sm" variant="outline" className="rounded-lg gap-2 flex-1" onClick={() => setConv(c.id)} data-testid={`conv-activate-${c.codigo}`}>
                Activar como contexto
              </Button>
              {canCreate && (
                <Link to={`/convocatorias/${c.id}`} data-testid={`conv-edit-${c.codigo}`}>
                  <Button size="sm" className="bg-[#14776A] hover:bg-[#0F5E54] rounded-lg gap-2">
                    <Pencil className="w-3.5 h-3.5" /> Editar
                  </Button>
                </Link>
              )}
              {user?.role === "admin_general" && (
                <Button size="sm" variant="outline" className="rounded-lg text-[#B42318] hover:bg-red-50" onClick={() => onDelete(c)} data-testid={`conv-delete-${c.codigo}`}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          </div>
        ))}
        {!items.length && (
          <div className="col-span-full border border-dashed border-border rounded-sm bg-white py-14 px-6 text-center">
            <FolderOpen className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
            <div className="font-display font-bold">Sin convocatorias</div>
            <p className="text-sm text-muted-foreground">Crea la primera convocatoria para comenzar.</p>
          </div>
        )}
      </div>
    </div>
  );
}
