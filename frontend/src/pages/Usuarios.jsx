import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import PageHeader, { Badge } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus } from "lucide-react";

const ROLES = ["admin_general", "admin_convocatoria", "supervisor", "jurado", "integrante_terna", "invitado", "auditor"];

export default function Usuarios() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ username: "", email: "", name: "", password: "", role: "supervisor" });

  const load = () => api.get("/users").then((r) => setItems(r.data)).catch(() => setItems([]));
  useEffect(() => { load(); }, []);

  const submit = async () => {
    try {
      await api.post("/users", f);
      toast.success("Usuario creado"); setOpen(false); load();
      setF({ username: "", email: "", name: "", password: "", role: "supervisor" });
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const toggleActive = async (u) => {
    try {
      await api.patch(`/users/${u.id}`, { active: !u.active });
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  return (
    <div className="flex-1 p-8 lg:p-10">
      <PageHeader
        eyebrow="Control de acceso"
        title="Usuarios"
        subtitle="Gestión de usuarios y roles del sistema. Solo el Administrador General puede crear nuevos usuarios."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="bg-[#059669] hover:bg-[#047857] rounded-sm gap-2" data-testid="create-user-btn"><Plus className="w-4 h-4" />Nuevo usuario</Button></DialogTrigger>
            <DialogContent className="rounded-sm max-w-lg">
              <DialogHeader><DialogTitle className="font-display">Nuevo usuario</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Username</Label><Input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} className="rounded-sm font-mono" data-testid="user-username" /></div>
                  <div><Label>Email</Label><Input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className="rounded-sm" data-testid="user-email" /></div>
                </div>
                <div><Label>Nombre</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="rounded-sm" /></div>
                <div><Label>Contraseña</Label><Input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} className="rounded-sm font-mono" data-testid="user-password" /></div>
                <div><Label>Rol</Label>
                  <Select value={f.role} onValueChange={(v) => setF({ ...f, role: v })}>
                    <SelectTrigger className="rounded-sm" data-testid="user-role"><SelectValue /></SelectTrigger>
                    <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)} className="rounded-sm">Cancelar</Button>
                <Button onClick={submit} className="bg-[#059669] hover:bg-[#047857] rounded-sm" data-testid="save-user-btn">Crear</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="border border-border rounded-sm bg-white overflow-x-auto">
        <table className="w-full dense-table">
          <thead><tr><th>Usuario</th><th>Nombre</th><th>Email</th><th>Rol</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {items.map((u) => (
              <tr key={u.id}>
                <td className="font-mono">{u.username}</td>
                <td className="font-semibold">{u.name}</td>
                <td className="font-mono text-xs">{u.email}</td>
                <td><Badge tone="muted">{u.role}</Badge></td>
                <td>{u.active ? <Badge tone="success">activo</Badge> : <Badge tone="danger">inactivo</Badge>}</td>
                <td className="text-right">
                  <Button size="sm" variant="outline" className="rounded-sm" onClick={() => toggleActive(u)}>{u.active ? "Desactivar" : "Activar"}</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
