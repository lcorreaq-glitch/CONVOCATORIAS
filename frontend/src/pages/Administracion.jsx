import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import PageHeader, { Badge } from "@/components/PageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Shield, Sparkles, Mail, Users as UsersIcon, Palette,
  CheckCircle2, AlertCircle, ExternalLink, Eye, EyeOff, Save, Send, Info,
  Wrench, Trash2, RefreshCw, KeyRound, Copy, AlertTriangle, ClipboardList,
  Plus, Pencil,
} from "lucide-react";

const MODELS = {
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini", "gpt-5-mini", "gpt-5-nano"],
  anthropic: ["claude-sonnet-4-6", "claude-opus-4-7", "claude-haiku-4-5-20251001"],
  gemini: ["gemini-3.1-pro-preview", "gemini-3-flash-preview", "gemini-2.5-flash"],
};

export default function Administracion() {
  return (
    <div className="flex-1 p-8 lg:p-10">
      <PageHeader
        eyebrow="Panel de administración"
        title="Administración del sistema"
        subtitle="Gestione usuarios, roles y permisos, configuración del proveedor de IA, envío de correos institucionales y la imagen gráfica de la plataforma."
      />

      <Tabs defaultValue="usuarios">
        <TabsList className="rounded-lg bg-[#F1F4F7] p-1 mb-6">
          <TabsTrigger value="usuarios" className="rounded-md gap-2" data-testid="admin-tab-usuarios"><UsersIcon className="w-4 h-4" />Usuarios</TabsTrigger>
          <TabsTrigger value="roles" className="rounded-md gap-2" data-testid="admin-tab-roles"><Shield className="w-4 h-4" />Roles & Permisos</TabsTrigger>
          <TabsTrigger value="ia" className="rounded-md gap-2" data-testid="admin-tab-ia"><Sparkles className="w-4 h-4" />IA Asistida</TabsTrigger>
          <TabsTrigger value="sendgrid" className="rounded-md gap-2" data-testid="admin-tab-sendgrid"><Mail className="w-4 h-4" />Correos (SendGrid)</TabsTrigger>
          <TabsTrigger value="branding" className="rounded-md gap-2" data-testid="admin-tab-branding"><Palette className="w-4 h-4" />Imagen gráfica</TabsTrigger>
          <TabsTrigger value="sistema" className="rounded-md gap-2" data-testid="admin-tab-sistema"><Wrench className="w-4 h-4" />Sistema</TabsTrigger>
          <TabsTrigger value="reaperturas" className="rounded-md gap-2" data-testid="admin-tab-reaperturas"><RefreshCw className="w-4 h-4" />Reaperturas</TabsTrigger>
        </TabsList>

        <TabsContent value="usuarios"><UsersPanel /></TabsContent>
        <TabsContent value="roles"><RolesPanel /></TabsContent>
        <TabsContent value="ia"><AIPanel /></TabsContent>
        <TabsContent value="sendgrid"><SendGridPanel /></TabsContent>
        <TabsContent value="branding"><BrandingPanel /></TabsContent>
        <TabsContent value="sistema"><SistemaPanel /></TabsContent>
        <TabsContent value="reaperturas"><ReaperturasPanel /></TabsContent>
      </Tabs>
    </div>
  );
}

// ============== USERS ==============
const ROLES_LABELS = {
  admin_general: "Administrador General",
  admin_convocatoria: "Administrador de Convocatoria",
  supervisor: "Supervisor",
  jurado: "Jurado",
  integrante_terna: "Integrante de Terna",
  invitado: "Invitado de Consulta",
  auditor: "Auditor",
};

function UsersPanel() {
  const [items, setItems] = useState([]);
  const [roles, setRoles] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [f, setF] = useState({ username: "", email: "", name: "", password: "", role: "supervisor" });

  const load = () => api.get("/users").then((r) => setItems(r.data));
  const loadRoles = () => api.get("/permissions/roles").then((r) => setRoles(r.data));
  useEffect(() => { load(); loadRoles(); }, []);

  const submit = async () => {
    try {
      if (editing) {
        const body = { name: f.name, email: f.email, role: f.role };
        if (f.password) body.password = f.password;
        await api.patch(`/users/${editing.id}`, body);
        toast.success("Usuario actualizado");
      } else {
        await api.post("/users", f);
        toast.success("Usuario creado");
      }
      setOpen(false); setEditing(null);
      setF({ username: "", email: "", name: "", password: "", role: "supervisor" });
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const toggleActive = async (u) => {
    try { await api.patch(`/users/${u.id}`, { active: !u.active }); load(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const deleteUser = async (u) => {
    if (u.role === "admin_general") { toast.error("No se puede eliminar a un admin_general"); return; }
    if (!confirm(`¿Desactivar el usuario "${u.username}"?`)) return;
    try { await api.delete(`/users/${u.id}`); load(); toast.success("Usuario desactivado"); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const sendWelcome = async (u) => {
    const incluir = confirm(`Enviar correo de bienvenida a ${u.email}.\n\n¿Quieres incluir una contraseña temporal NUEVA en el correo?\n\nAceptar = sí (regenera y envía).\nCancelar = solo bienvenida, sin contraseña (el usuario podrá usar "Recuperar contraseña").`);
    let body = { base_url: window.location.origin };
    if (incluir) {
      const pwd = window.prompt("Contraseña temporal a enviar (déjala vacía para generar una automática de 10 caracteres):", "");
      if (pwd === null) return;
      body.password_temporal = pwd || Math.random().toString(36).slice(-10) + "A1!";
    }
    try {
      const r = await api.post(`/users/${u.id}/send-welcome`, body);
      if (r.data.ok) {
        toast.success(`Correo enviado a ${u.email}` + (body.password_temporal ? ` con contraseña: ${body.password_temporal}` : ""));
      } else {
        toast.warning(r.data.message || "Servicio de correo no configurado.");
      }
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const startEdit = (u) => {
    setEditing(u);
    setF({ username: u.username, email: u.email, name: u.name, password: "", role: u.role });
    setOpen(true);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-[#5E6878]">
          Gestione los usuarios que tendrán acceso a KRINOS. Solo el Administrador General puede crear o desactivar usuarios.
        </p>
        <Button onClick={() => { setEditing(null); setF({ username: "", email: "", name: "", password: "", role: "supervisor" }); setOpen(true); }}
                className="bg-[#14776A] hover:bg-[#0F5E54] rounded-lg" data-testid="admin-add-user-btn">
          + Nuevo usuario
        </Button>
      </div>

      {open && (
        <div className="border border-[#E2E7EC] rounded-xl bg-white p-5 mb-5 shadow-card">
          <h4 className="font-display font-bold text-[15px] mb-4">{editing ? `Editar ${editing.username}` : "Nuevo usuario"}</h4>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs font-semibold">Username</Label>
              <Input disabled={!!editing} value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} className="rounded-lg font-mono" data-testid="admin-user-username" /></div>
            <div><Label className="text-xs font-semibold">Email</Label>
              <Input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className="rounded-lg" data-testid="admin-user-email" /></div>
            <div><Label className="text-xs font-semibold">Nombre completo</Label>
              <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="rounded-lg" /></div>
            <div><Label className="text-xs font-semibold">Rol</Label>
              <Select value={f.role} onValueChange={(v) => setF({ ...f, role: v })}>
                <SelectTrigger className="rounded-lg" data-testid="admin-user-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {roles.map((r) => <SelectItem key={r.code} value={r.code}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2"><Label className="text-xs font-semibold">{editing ? "Nueva contraseña (opcional)" : "Contraseña"}</Label>
              <Input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} className="rounded-lg font-mono" data-testid="admin-user-password" /></div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => { setOpen(false); setEditing(null); }} className="rounded-lg">Cancelar</Button>
            <Button onClick={submit} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-lg gap-2" data-testid="admin-save-user-btn"><Save className="w-4 h-4" />Guardar</Button>
          </div>
        </div>
      )}

      <div className="border border-[#E2E7EC] rounded-xl bg-white overflow-x-auto shadow-card">
        <table className="w-full dense-table">
          <thead><tr><th>Usuario</th><th>Nombre</th><th>Email</th><th>Rol</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {items.map((u) => (
              <tr key={u.id}>
                <td className="font-mono text-[12px]">{u.username}</td>
                <td className="font-semibold">{u.name}</td>
                <td className="font-mono text-[12px]">{u.email}</td>
                <td>{(roles.find((r) => r.code === u.role)?.name) || ROLES_LABELS[u.role] || u.role}</td>
                <td>{u.active ? <Badge tone="success">activo</Badge> : <Badge tone="danger">inactivo</Badge>}</td>
                <td className="text-right space-x-2">
                  <Button size="sm" variant="outline" className="rounded-lg" onClick={() => startEdit(u)}>Editar</Button>
                  <Button size="sm" variant="outline" className="rounded-lg gap-1.5" onClick={() => sendWelcome(u)} data-testid={`user-welcome-${u.username}`} title="Enviar correo de bienvenida">
                    <Mail className="w-3.5 h-3.5" /> Bienvenida
                  </Button>
                  <Button size="sm" variant="outline" className="rounded-lg" onClick={() => toggleActive(u)}>{u.active ? "Desactivar" : "Activar"}</Button>
                  {u.role !== "admin_general" && (
                    <Button size="sm" variant="outline" className="rounded-lg text-red-600 hover:bg-red-50 border-red-200" onClick={() => deleteUser(u)} data-testid={`user-delete-${u.username}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============== ROLES & PERMISOS (editable v2) ==============
function RolesPanel() {
  const [matrix, setMatrix] = useState(null);
  const [selectedRole, setSelectedRole] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newRole, setNewRole] = useState({ code: "", name: "", description: "" });
  const [editingRole, setEditingRole] = useState(null);

  const load = async () => {
    const { data } = await api.get("/permissions/matrix");
    setMatrix(data);
    setSelectedRole((prev) => prev || data.roles[0]?.code);
  };
  useEffect(() => { load(); }, []);

  const togglePerm = async (roleCode, module, action, currentlyAllowed) => {
    try {
      await api.patch(`/permissions/roles/${roleCode}/permissions`, {
        module, action, allowed: !currentlyAllowed,
      });
      // Optimista
      setMatrix((m) => {
        const roles = m.roles.map((r) => {
          if (r.code !== roleCode) return r;
          const perms = { ...(r.permissions || {}) };
          const acts = new Set(perms[module] || []);
          if (currentlyAllowed) acts.delete(action); else acts.add(action);
          perms[module] = Array.from(acts).sort();
          return { ...r, permissions: perms };
        });
        return { ...m, roles };
      });
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const toggleAllModule = async (roleCode, moduleCode, moduleActions, mode) => {
    // mode: "all" | "none"
    const target = mode === "all" ? moduleActions : [];
    try {
      const role = matrix.roles.find((r) => r.code === roleCode);
      const perms = { ...(role.permissions || {}) };
      perms[moduleCode] = target;
      await api.patch(`/permissions/roles/${roleCode}`, { permissions: perms });
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const createRole = async () => {
    if (!newRole.code || !newRole.name) { toast.error("Código y nombre requeridos"); return; }
    try {
      await api.post("/permissions/roles", { ...newRole, permissions: {} });
      toast.success("Rol creado");
      setCreateOpen(false);
      setNewRole({ code: "", name: "", description: "" });
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const saveRoleMeta = async () => {
    if (!editingRole) return;
    try {
      await api.patch(`/permissions/roles/${editingRole.code}`, {
        name: editingRole.name, description: editingRole.description,
      });
      toast.success("Rol actualizado");
      setEditingRole(null);
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const deleteRole = async (role) => {
    if (role.is_system) { toast.error("No se puede eliminar un rol del sistema."); return; }
    if (!confirm(`¿Eliminar el rol "${role.name}"?\n\nVerifica que no haya usuarios asignados.`)) return;
    try {
      await api.delete(`/permissions/roles/${role.code}`);
      toast.success("Rol eliminado");
      if (selectedRole === role.code) setSelectedRole(matrix.roles[0]?.code);
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  if (!matrix) return <div className="p-8 text-sm text-[#5E6878]">Cargando matriz de permisos…</div>;
  const role = matrix.roles.find((r) => r.code === selectedRole);

  return (
    <div className="space-y-4">
      <div className="border-l-4 border-[#14776A] bg-[#F0F7F5] rounded-r-lg p-4 flex items-start justify-between gap-3">
        <div className="flex gap-3">
          <Info className="w-5 h-5 text-[#14776A] mt-0.5 shrink-0" />
          <div className="text-[13px] text-[#1A1F2C]">
            <strong className="font-display">Roles y permisos (versión {matrix.version} — editable)</strong>
            <p className="text-[#5E6878] mt-1">Selecciona un rol y activa o desactiva las acciones por módulo. Los roles del sistema no se pueden eliminar pero sí editar sus permisos. El rol Administrador General conserva siempre acceso completo a Administración/Roles/Usuarios/Sistema.</p>
          </div>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-lg gap-2 shrink-0" data-testid="role-create-btn">
          <Plus className="w-4 h-4" /> Crear rol
        </Button>
      </div>

      {createOpen && (
        <div className="border border-[#E2E7EC] rounded-xl bg-[#FAFBFC] p-4">
          <h4 className="font-display font-bold text-[14px] mb-2">Nuevo rol</h4>
          <div className="grid sm:grid-cols-3 gap-3">
            <div><Label className="text-xs font-semibold">Código (interno)</Label>
              <Input value={newRole.code} onChange={(e) => setNewRole({ ...newRole, code: e.target.value })} placeholder="ej. coordinador" className="rounded-lg font-mono" data-testid="role-new-code" /></div>
            <div><Label className="text-xs font-semibold">Nombre visible</Label>
              <Input value={newRole.name} onChange={(e) => setNewRole({ ...newRole, name: e.target.value })} placeholder="Coordinador Regional" className="rounded-lg" data-testid="role-new-name" /></div>
            <div><Label className="text-xs font-semibold">Descripción</Label>
              <Input value={newRole.description} onChange={(e) => setNewRole({ ...newRole, description: e.target.value })} placeholder="Breve descripción" className="rounded-lg" /></div>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="outline" onClick={() => setCreateOpen(false)} className="rounded-lg">Cancelar</Button>
            <Button onClick={createRole} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-lg gap-2" data-testid="role-create-save"><Save className="w-4 h-4" />Crear</Button>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-[260px_1fr] gap-4">
        {/* Lista de roles */}
        <div className="border border-[#E2E7EC] rounded-xl bg-white p-2">
          <div className="text-[10.5px] uppercase tracking-wider font-display font-bold text-[#5E6878] px-2 py-2">
            Roles del sistema
          </div>
          {matrix.roles.map((r) => (
            <button
              key={r.code}
              onClick={() => setSelectedRole(r.code)}
              data-testid={`role-select-${r.code}`}
              className={`w-full text-left px-3 py-2 rounded-lg transition-colors mb-0.5 flex items-center justify-between gap-2 ${
                selectedRole === r.code ? "bg-[#E8F3F0]" : "hover:bg-[#F1F4F7]"
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-[13px] text-[#1A1F2C] truncate">{r.name}</div>
                <div className="text-[10.5px] text-[#5E6878] font-mono truncate">{r.code}</div>
              </div>
              {r.is_system && <Shield className="w-3.5 h-3.5 text-[#14776A] shrink-0" title="Rol del sistema" />}
            </button>
          ))}
        </div>

        {/* Matriz del rol seleccionado */}
        {role && (
          <div className="border border-[#E2E7EC] rounded-xl bg-white p-5 shadow-card min-w-0">
            <div className="flex items-start justify-between mb-4 gap-3">
              <div className="flex-1 min-w-0">
                {editingRole?.code === role.code ? (
                  <div className="space-y-2">
                    <Input value={editingRole.name} onChange={(e) => setEditingRole({ ...editingRole, name: e.target.value })} className="rounded-lg font-display font-bold text-[18px]" />
                    <Input value={editingRole.description || ""} onChange={(e) => setEditingRole({ ...editingRole, description: e.target.value })} className="rounded-lg text-[13px]" placeholder="Descripción" />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={saveRoleMeta} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-lg gap-1.5"><Save className="w-3.5 h-3.5" />Guardar</Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingRole(null)} className="rounded-lg">Cancelar</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <h3 className="font-display font-extrabold text-[20px] tracking-tight">{role.name}</h3>
                    <code className="text-[11px] text-[#5E6878] font-mono">{role.code}</code>
                    <p className="text-[12.5px] text-[#5E6878] mt-1">{role.description || "Sin descripción."}</p>
                  </>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                {!editingRole && (
                  <Button size="sm" variant="outline" className="rounded-lg gap-1.5" onClick={() => setEditingRole({ code: role.code, name: role.name, description: role.description || "" })} data-testid={`role-edit-${role.code}`}>
                    <Pencil className="w-3.5 h-3.5" /> Editar
                  </Button>
                )}
                {!role.is_system && (
                  <Button size="sm" variant="outline" className="rounded-lg text-red-600 border-red-200 hover:bg-red-50" onClick={() => deleteRole(role)} data-testid={`role-delete-${role.code}`}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </div>

            <div className="text-[10.5px] uppercase tracking-wider font-display font-bold text-[#14776A] mb-2">
              Permisos por módulo · {Object.values(role.permissions || {}).reduce((acc, v) => acc + v.length, 0)} acciones activas
            </div>
            <div className="overflow-x-auto max-h-[70vh]">
              <table className="w-full text-[12.5px]">
                <thead className="sticky top-0 bg-white z-10">
                  <tr className="border-b-2 border-[#E2E7EC]">
                    <th className="text-left py-2 px-2 font-display font-bold text-[#1A1F2C] sticky left-0 bg-white z-10 min-w-[180px]">Módulo</th>
                    <th className="text-center px-2 font-display font-bold text-[#5E6878] min-w-[110px]">Acciones</th>
                    <th className="text-right px-2 font-display font-bold text-[#5E6878] min-w-[90px]">Atajos</th>
                  </tr>
                </thead>
                <tbody>
                  {matrix.modules.map((mod) => {
                    const granted = new Set(role.permissions?.[mod.code] || []);
                    return (
                      <tr key={mod.code} className="border-b border-[#F1F4F7] hover:bg-[#FAFBFC]">
                        <td className="py-2.5 px-2 sticky left-0 bg-inherit min-w-[180px]">
                          <div className="font-semibold text-[13px]">{mod.label}</div>
                          <code className="text-[10.5px] text-[#5E6878] font-mono">{mod.code}</code>
                        </td>
                        <td className="px-2">
                          <div className="flex flex-wrap gap-1.5">
                            {mod.actions.map((act) => {
                              const on = granted.has(act);
                              return (
                                <button
                                  key={act}
                                  onClick={() => togglePerm(role.code, mod.code, act, on)}
                                  data-testid={`perm-${role.code}-${mod.code}-${act}`}
                                  className={`px-2 py-1 rounded-md text-[11px] font-semibold border transition-all ${
                                    on
                                      ? "bg-[#14776A] text-white border-[#14776A] hover:bg-[#0F5E54]"
                                      : "bg-white text-[#5E6878] border-[#E2E7EC] hover:border-[#14776A] hover:text-[#14776A]"
                                  }`}
                                >
                                  {on ? "✓ " : ""}{act}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                        <td className="text-right px-2 whitespace-nowrap">
                          <button onClick={() => toggleAllModule(role.code, mod.code, mod.actions, "all")} className="text-[11px] text-[#14776A] hover:underline mr-2">Todos</button>
                          <button onClick={() => toggleAllModule(role.code, mod.code, mod.actions, "none")} className="text-[11px] text-[#5E6878] hover:underline">Ninguno</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============== IA ==============
function AIPanel() {
  const [settings, setSettings] = useState(null);
  const [status, setStatus] = useState(null);
  const [showByok, setShowByok] = useState(false);
  const [f, setF] = useState({});

  const load = async () => {
    const [s, st] = await Promise.all([api.get("/settings"), api.get("/ai/status")]);
    setSettings(s.data); setStatus(st.data);
    setF({
      provider: s.data.ai.provider, model: s.data.ai.model,
      use_emergent_key: s.data.ai.use_emergent_key,
      enabled: s.data.ai.enabled,
      system_message: s.data.ai.system_message,
      byok_api_key: "",
    });
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      const body = { ...f };
      if (!body.byok_api_key) delete body.byok_api_key;
      await api.patch("/settings/ai", body);
      toast.success("Configuración IA actualizada");
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  if (!settings) return <div className="p-8 text-sm text-[#5E6878]">Cargando…</div>;
  const ai = settings.ai;
  const ready = status?.ready;

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-6">
      <div className="space-y-5">
        <div className={`border rounded-xl p-4 flex items-start gap-3 ${ready ? "bg-[#F0F7F5] border-[#CDE7E1]" : "bg-[#FFFBEB] border-[#FDE68A]"}`}>
          {ready ? <CheckCircle2 className="w-5 h-5 text-[#14776A] mt-0.5" /> : <AlertCircle className="w-5 h-5 text-[#B45309] mt-0.5" />}
          <div className="text-[13px]">
            <div className="font-display font-bold text-[14px]">{ready ? "IA lista" : "IA no operativa"}</div>
            <div className="text-[#5E6878] mt-0.5">
              Modo <strong className="text-[#1A1F2C]">{status?.mode}</strong> · proveedor <strong>{status?.provider}</strong> · modelo <strong>{status?.model}</strong>.
              {!ready && " — Verifique la clave o habilite el servicio."}
            </div>
          </div>
        </div>

        <div className="border border-[#E2E7EC] rounded-xl bg-white p-5 shadow-card">
          <h4 className="font-display font-bold text-[15px] mb-1">Proveedor y modelo</h4>
          <p className="text-[12.5px] text-[#5E6878] mb-4">Selecciona el proveedor de IA y el modelo a utilizar para tareas como resumen de propuestas, sugerencias de observación y borradores de actas.</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold">Proveedor</Label>
              <Select value={f.provider} onValueChange={(v) => setF({ ...f, provider: v, model: MODELS[v]?.[0] })}>
                <SelectTrigger className="rounded-lg" data-testid="ai-provider"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
                  <SelectItem value="gemini">Google Gemini</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold">Modelo</Label>
              <Select value={f.model} onValueChange={(v) => setF({ ...f, model: v })}>
                <SelectTrigger className="rounded-lg" data-testid="ai-model"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(MODELS[f.provider] || []).map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="border border-[#E2E7EC] rounded-xl bg-white p-5 shadow-card">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h4 className="font-display font-bold text-[15px]">Origen de la API key</h4>
              <p className="text-[12.5px] text-[#5E6878]">Use la Universal Key administrada por Emergent o registre su propia clave (BYOK).</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-wider text-[#5E6878]">{f.use_emergent_key ? "Universal" : "BYOK"}</span>
              <Switch checked={f.use_emergent_key} onCheckedChange={(v) => setF({ ...f, use_emergent_key: v })} data-testid="ai-use-emergent" />
            </div>
          </div>
          {!f.use_emergent_key && (
            <div>
              <Label className="text-xs font-semibold">API Key {f.provider === "openai" ? "OpenAI" : f.provider === "anthropic" ? "Anthropic" : "Gemini"}</Label>
              <div className="flex gap-2">
                <Input type={showByok ? "text" : "password"} value={f.byok_api_key} onChange={(e) => setF({ ...f, byok_api_key: e.target.value })}
                       placeholder={ai.has_byok_key ? ai.byok_api_key_masked : "sk-..."}
                       className="rounded-lg font-mono" data-testid="ai-byok-key" />
                <Button type="button" variant="outline" className="rounded-lg" onClick={() => setShowByok((s) => !s)}>
                  {showByok ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-[11px] text-[#5E6878] mt-1.5">{ai.has_byok_key ? "Ya hay una clave guardada. Sobreescribe solo si necesitas cambiarla." : "La clave se almacena cifrada en la base de datos."}</p>
            </div>
          )}
          {f.use_emergent_key && (
            <div className="bg-[#F1F4F7] rounded-lg p-3 text-[12.5px] text-[#3F4856]">
              KRINOS usa <strong>Emergent Universal Key</strong>. El consumo se descuenta del balance de tu cuenta Emergent. Ve a Profile → Universal Key para ver el saldo.
            </div>
          )}
        </div>

        <div className="border border-[#E2E7EC] rounded-xl bg-white p-5 shadow-card">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h4 className="font-display font-bold text-[15px]">Instrucciones del asistente</h4>
              <p className="text-[12.5px] text-[#5E6878]">Mensaje de sistema base que recibe el modelo en cada consulta.</p>
            </div>
            <Switch checked={f.enabled} onCheckedChange={(v) => setF({ ...f, enabled: v })} data-testid="ai-enabled" />
          </div>
          <Textarea rows={4} value={f.system_message || ""} onChange={(e) => setF({ ...f, system_message: e.target.value })} className="rounded-lg" />
        </div>

        <div className="flex justify-end">
          <Button onClick={save} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-lg gap-2" data-testid="ai-save-btn"><Save className="w-4 h-4" />Guardar cambios</Button>
        </div>
      </div>

      {/* Help side */}
      <aside className="lg:sticky lg:top-6 self-start space-y-3">
        <div className="border border-[#E2E7EC] rounded-xl bg-white p-5 shadow-card">
          <div className="text-[10.5px] uppercase tracking-[0.14em] font-display font-bold text-[#14776A] mb-2">Guía rápida</div>
          <h4 className="font-display font-bold text-[15px] mb-3">¿Cómo configurar la IA?</h4>
          <ol className="space-y-2 text-[12.5px] text-[#3F4856]">
            <li><strong>1.</strong> Elija el proveedor (OpenAI por defecto).</li>
            <li><strong>2.</strong> Active <em>Universal</em> para usar la key administrada por Emergent (recomendado).</li>
            <li><strong>3.</strong> Si prefiere BYOK, pegue su API key en formato <code className="font-mono text-[11px]">sk-...</code>.</li>
            <li><strong>4.</strong> Guarde y verifique el estado en la parte superior.</li>
          </ol>
          <div className="border-t border-[#E2E7EC] mt-4 pt-3">
            <div className="text-[10.5px] uppercase tracking-[0.14em] font-display font-bold text-[#5E6878] mb-2">Dónde obtener la API key</div>
            <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="flex items-center justify-between text-[12.5px] text-[#14776A] hover:underline py-1">
              OpenAI · platform.openai.com/api-keys <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" className="flex items-center justify-between text-[12.5px] text-[#14776A] hover:underline py-1">
              Anthropic · console.anthropic.com <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="flex items-center justify-between text-[12.5px] text-[#14776A] hover:underline py-1">
              Gemini · aistudio.google.com <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        <div className="border border-[#E2E7EC] rounded-xl bg-white p-5 shadow-card">
          <div className="text-[10.5px] uppercase tracking-[0.14em] font-display font-bold text-[#5E6878] mb-2">Capacidades activas</div>
          <ul className="space-y-1.5 text-[12.5px] text-[#3F4856]">
            <li className="flex items-center gap-2"><Sparkles className="w-3.5 h-3.5 text-[#14776A]" />Resumen de propuesta</li>
            <li className="flex items-center gap-2"><Sparkles className="w-3.5 h-3.5 text-[#14776A]" />Sugerencia de observación</li>
            <li className="flex items-center gap-2"><Sparkles className="w-3.5 h-3.5 text-[#14776A]" />Borrador de acta colectiva</li>
            <li className="flex items-center gap-2 text-[#9CA3AF]"><Sparkles className="w-3.5 h-3.5" />Detección de inconsistencias (próx.)</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}

// ============== SENDGRID ==============
function SendGridPanel() {  // Obsoleto - reemplazado por CorreosPanel. Se mantiene exportado en caso de tests previos.
  return <CorreosPanel />;
}

// =================================================================
//  Panel unificado de CORREOS (Gmail SMTP / SendGrid)
// =================================================================
function CorreosPanel() {
  const [settings, setSettings] = useState(null);
  const [show, setShow] = useState({ gmail: false, sg: false });
  const [f, setF] = useState({});

  const load = async () => {
    const r = await api.get("/settings");
    setSettings(r.data);
    const e = r.data.email || {};
    setF({
      provider: e.provider || "gmail",
      enabled: !!e.enabled,
      from_email: e.from_email || "",
      from_name: e.from_name || "KRINOS",
      test_recipient: e.test_recipient || "",
      gmail_user: e.gmail?.user || "",
      gmail_app_password: "",  // input limpio para nueva
      sg_api_key: "",
      sg_from_email: e.sendgrid?.from_email || "",
      sg_from_name: e.sendgrid?.from_name || "KRINOS",
    });
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      const body = {
        provider: f.provider,
        enabled: f.enabled,
        from_email: f.from_email,
        from_name: f.from_name,
        test_recipient: f.test_recipient,
        gmail: { user: f.gmail_user },
        sendgrid: { from_email: f.sg_from_email, from_name: f.sg_from_name },
      };
      if (f.gmail_app_password) body.gmail.app_password = f.gmail_app_password;
      if (f.sg_api_key) body.sendgrid.api_key = f.sg_api_key;
      await api.patch("/settings/email", body);
      toast.success("Configuración de correos guardada");
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const testSend = async () => {
    try {
      const r = await api.post("/settings/email/test");
      toast.success(r.data.message || "Correo enviado correctamente");
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  if (!settings) return <div className="p-8 text-sm text-[#5E6878]">Cargando…</div>;
  const email = settings.email || {};
  const provider = f.provider || "gmail";

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-6">
      <div className="space-y-5">
        {/* Header: selector de proveedor + switch enabled */}
        <div className="border border-[#E2E7EC] rounded-xl bg-white p-5 shadow-card">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h4 className="font-display font-bold text-[15px]">Envío de correos institucionales</h4>
              <p className="text-[12.5px] text-[#5E6878] mt-0.5">Bienvenidas, restablecimiento de contraseña, notificaciones a jurados y resultados.</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] uppercase tracking-wider text-[#5E6878]">{f.enabled ? "Habilitado" : "Deshabilitado"}</span>
              <Switch checked={!!f.enabled} onCheckedChange={(v) => setF({ ...f, enabled: v })} data-testid="email-enabled" />
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold mb-1.5 block">Proveedor activo</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setF({ ...f, provider: "gmail" })}
                className={`text-left rounded-lg border-2 p-3 transition-colors ${provider === "gmail" ? "border-[#14776A] bg-[#F0F7F5]" : "border-[#E2E7EC] bg-white hover:border-[#CBD2DA]"}`}
                data-testid="provider-gmail"
              >
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-[#14776A]" />
                  <span className="font-semibold text-[13px]">Gmail SMTP</span>
                  {provider === "gmail" && <CheckCircle2 className="w-4 h-4 text-[#14776A] ml-auto" />}
                </div>
                <p className="text-[11.5px] text-[#5E6878] mt-1">Tu Gmail + Contraseña de Aplicación. Sin costo. Hasta ~500 correos/día.</p>
              </button>
              <button
                type="button"
                onClick={() => setF({ ...f, provider: "sendgrid" })}
                className={`text-left rounded-lg border-2 p-3 transition-colors ${provider === "sendgrid" ? "border-[#14776A] bg-[#F0F7F5]" : "border-[#E2E7EC] bg-white hover:border-[#CBD2DA]"}`}
                data-testid="provider-sendgrid"
              >
                <div className="flex items-center gap-2">
                  <Send className="w-4 h-4 text-[#14776A]" />
                  <span className="font-semibold text-[13px]">SendGrid</span>
                  {provider === "sendgrid" && <CheckCircle2 className="w-4 h-4 text-[#14776A] ml-auto" />}
                </div>
                <p className="text-[11.5px] text-[#5E6878] mt-1">Servicio profesional. Free tier 100/día. Estadísticas y bounce control.</p>
              </button>
            </div>
          </div>
        </div>

        {/* Configuración GMAIL */}
        {provider === "gmail" && (
          <div className="border border-[#E2E7EC] rounded-xl bg-white p-5 shadow-card" data-testid="gmail-config">
            <h4 className="font-display font-bold text-[15px] mb-1 flex items-center gap-2"><Mail className="w-4 h-4 text-[#14776A]" /> Configuración Gmail SMTP</h4>
            <p className="text-[12.5px] text-[#5E6878] mb-4">Usa tu cuenta de Gmail con una <strong>Contraseña de Aplicación</strong> de 16 caracteres (NO tu contraseña habitual).</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold">Correo Gmail</Label>
                <Input value={f.gmail_user || ""} onChange={(e) => setF({ ...f, gmail_user: e.target.value })} placeholder="usuario@gmail.com" className="rounded-lg" data-testid="gmail-user" />
              </div>
              <div>
                <Label className="text-xs font-semibold">Contraseña de Aplicación</Label>
                <div className="flex gap-2">
                  <Input type={show.gmail ? "text" : "password"} value={f.gmail_app_password || ""} onChange={(e) => setF({ ...f, gmail_app_password: e.target.value })}
                         placeholder={email.gmail?.has_app_password ? email.gmail.app_password_masked : "abcd efgh ijkl mnop"}
                         className="rounded-lg font-mono" data-testid="gmail-app-password" />
                  <Button type="button" variant="outline" className="rounded-lg" onClick={() => setShow((s) => ({ ...s, gmail: !s.gmail }))}>
                    {show.gmail ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-[11px] text-[#5E6878] mt-1">{email.gmail?.has_app_password ? "Ya hay una contraseña registrada. Pega una nueva solo para reemplazarla." : "Formato: 16 caracteres divididos en 4 grupos de 4."}</p>
              </div>
              <div>
                <Label className="text-xs font-semibold">Email remitente</Label>
                <Input value={f.from_email || ""} onChange={(e) => setF({ ...f, from_email: e.target.value })} placeholder="usuario@gmail.com (o alias autorizado)" className="rounded-lg" data-testid="email-from-email" />
              </div>
              <div>
                <Label className="text-xs font-semibold">Nombre remitente</Label>
                <Input value={f.from_name || ""} onChange={(e) => setF({ ...f, from_name: e.target.value })} placeholder="KRINOS" className="rounded-lg" data-testid="email-from-name" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs font-semibold">Destinatario para correo de prueba</Label>
                <Input value={f.test_recipient || ""} onChange={(e) => setF({ ...f, test_recipient: e.target.value })} placeholder="tu.correo@dominio.com" className="rounded-lg" data-testid="email-test-recipient" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button onClick={testSend} variant="outline" className="rounded-lg gap-2" data-testid="email-test-btn"><Send className="w-4 h-4" />Enviar prueba</Button>
              <Button onClick={save} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-lg gap-2" data-testid="email-save-btn"><Save className="w-4 h-4" />Guardar</Button>
            </div>
          </div>
        )}

        {/* Configuración SENDGRID */}
        {provider === "sendgrid" && (
          <div className="border border-[#E2E7EC] rounded-xl bg-white p-5 shadow-card" data-testid="sendgrid-config">
            <h4 className="font-display font-bold text-[15px] mb-1 flex items-center gap-2"><Send className="w-4 h-4 text-[#14776A]" /> Configuración SendGrid</h4>
            <p className="text-[12.5px] text-[#5E6878] mb-4">Servicio profesional. Permiso requerido: <strong>Mail Send → Full Access</strong>.</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label className="text-xs font-semibold">SendGrid API Key</Label>
                <div className="flex gap-2">
                  <Input type={show.sg ? "text" : "password"} value={f.sg_api_key || ""} onChange={(e) => setF({ ...f, sg_api_key: e.target.value })}
                         placeholder={email.sendgrid?.has_api_key ? email.sendgrid.api_key_masked : "SG.xxxxxxxxxxxx..."}
                         className="rounded-lg font-mono" data-testid="sg-api-key" />
                  <Button type="button" variant="outline" className="rounded-lg" onClick={() => setShow((s) => ({ ...s, sg: !s.sg }))}>
                    {show.sg ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-[11px] text-[#5E6878] mt-1.5">{email.sendgrid?.has_api_key ? "Ya hay una key registrada." : "Genérala en SendGrid → Settings → API Keys."}</p>
              </div>
              <div>
                <Label className="text-xs font-semibold">Email remitente verificado</Label>
                <Input value={f.sg_from_email || ""} onChange={(e) => setF({ ...f, sg_from_email: e.target.value })} placeholder="notificaciones@krinos.com" className="rounded-lg" data-testid="sg-from-email" />
              </div>
              <div>
                <Label className="text-xs font-semibold">Nombre remitente</Label>
                <Input value={f.sg_from_name || ""} onChange={(e) => setF({ ...f, sg_from_name: e.target.value })} placeholder="KRINOS" className="rounded-lg" data-testid="sg-from-name" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs font-semibold">Destinatario para correo de prueba</Label>
                <Input value={f.test_recipient || ""} onChange={(e) => setF({ ...f, test_recipient: e.target.value })} placeholder="tu.correo@dominio.com" className="rounded-lg" data-testid="email-test-recipient-sg" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button onClick={testSend} variant="outline" className="rounded-lg gap-2" data-testid="email-test-btn-sg"><Send className="w-4 h-4" />Enviar prueba</Button>
              <Button onClick={save} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-lg gap-2" data-testid="email-save-btn-sg"><Save className="w-4 h-4" />Guardar</Button>
            </div>
          </div>
        )}

        {/* Plantillas embebidas */}
        <div className="border border-[#E2E7EC] rounded-xl bg-white p-5 shadow-card">
          <h4 className="font-display font-bold text-[15px] mb-3">Plantillas embebidas</h4>
          <p className="text-[12.5px] text-[#5E6878] mb-4">Se enviarán automáticamente cuando el servicio esté habilitado.</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              { title: "Bienvenida (Usuario)", desc: "Al crear un usuario o desde el botón 'Enviar bienvenida'.", trigger: "welcome" },
              { title: "Bienvenida (Jurado)", desc: "Al crear un jurado o tras resetear su contraseña con envío.", trigger: "welcome_jurado" },
              { title: "Recuperar contraseña", desc: "Cuando el usuario solicita el enlace desde el login.", trigger: "reset_password" },
              { title: "Recordatorio de evaluación", desc: "Próximamente. 3 días antes del cierre.", trigger: "recordatorio" },
              { title: "Habilitación documental", desc: "Próximamente. Al cambiar estado de propuesta.", trigger: "habilitacion" },
              { title: "Resultados", desc: "Próximamente. Al publicar ranking final.", trigger: "resultados" },
            ].map((t) => (
              <div key={t.trigger} className="border border-[#E2E7EC] rounded-lg p-3.5 bg-[#FAFBFC]">
                <div className="font-semibold text-[13.5px] text-[#1A1F2C]">{t.title}</div>
                <p className="text-[12px] text-[#5E6878] mt-1 leading-snug">{t.desc}</p>
                <code className="text-[10.5px] text-[#5E6878] font-mono mt-2 block">trigger: {t.trigger}</code>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Sidebar guías */}
      <aside className="lg:sticky lg:top-6 self-start space-y-3">
        {provider === "gmail" ? (
          <div className="border border-[#E2E7EC] rounded-xl bg-white p-5 shadow-card">
            <div className="text-[10.5px] uppercase tracking-[0.14em] font-display font-bold text-[#14776A] mb-2">Guía paso a paso</div>
            <h4 className="font-display font-bold text-[15px] mb-3">Cómo generar tu Contraseña de Aplicación de Gmail</h4>
            <ol className="space-y-2.5 text-[12.5px] text-[#3F4856]">
              <li><strong>1.</strong> Inicia sesión en tu cuenta Gmail.</li>
              <li><strong>2.</strong> Activa la <strong>Verificación en 2 pasos</strong> (es requisito obligatorio para generar contraseñas de aplicación).<br /><a href="https://myaccount.google.com/signinoptions/two-step-verification" target="_blank" rel="noreferrer" className="text-[#14776A] hover:underline inline-flex items-center gap-1 mt-1">Activar 2FA <ExternalLink className="w-3 h-3" /></a></li>
              <li><strong>3.</strong> Ve a <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="text-[#14776A] hover:underline inline-flex items-center gap-1">myaccount.google.com/apppasswords <ExternalLink className="w-3 h-3" /></a></li>
              <li><strong>4.</strong> Escribe un nombre (ej. "KRINOS") y clic en <strong>Crear</strong>.</li>
              <li><strong>5.</strong> Google te mostrará una contraseña de <strong>16 caracteres</strong> (4 grupos de 4 letras). Cópiala COMPLETA (sin espacios o con espacios, ambos funcionan).</li>
              <li><strong>6.</strong> Pégala aquí en el campo <em>Contraseña de Aplicación</em>, escribe tu correo Gmail, activa el switch arriba y guarda.</li>
              <li><strong>7.</strong> Envía un correo de prueba para confirmar.</li>
            </ol>
            <div className="border-t border-[#E2E7EC] mt-4 pt-3 space-y-1.5">
              <a href="https://support.google.com/accounts/answer/185833" target="_blank" rel="noreferrer" className="flex items-center justify-between text-[12.5px] text-[#14776A] hover:underline">
                Doc oficial de Google <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="flex items-center justify-between text-[12.5px] text-[#14776A] hover:underline">
                Crear Contraseña de Aplicación <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
            <div className="border-l-4 border-amber-400 bg-amber-50 rounded-r-lg p-3 mt-4 text-[12px]">
              <div className="flex gap-2"><AlertCircle className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" /><div>
                <strong>Límite Gmail:</strong> ~500 correos por día. Para volúmenes mayores usa SendGrid o un dominio profesional con Google Workspace.
              </div></div>
            </div>
          </div>
        ) : (
          <div className="border border-[#E2E7EC] rounded-xl bg-white p-5 shadow-card">
            <div className="text-[10.5px] uppercase tracking-[0.14em] font-display font-bold text-[#14776A] mb-2">Guía paso a paso</div>
            <h4 className="font-display font-bold text-[15px] mb-3">Configurar SendGrid</h4>
            <ol className="space-y-2.5 text-[12.5px] text-[#3F4856]">
              <li><strong>1.</strong> Crea una cuenta en SendGrid.</li>
              <li><strong>2.</strong> Verifica un <em>Single Sender</em> o dominio (Authenticate Domain).</li>
              <li><strong>3.</strong> Genera una API Key con permiso <strong>Mail Send → Full Access</strong>.</li>
              <li><strong>4.</strong> Pégala aquí junto con el email remitente verificado.</li>
              <li><strong>5.</strong> Activa el switch y prueba envío.</li>
            </ol>
            <div className="border-t border-[#E2E7EC] mt-4 pt-3 space-y-1.5">
              <a href="https://app.sendgrid.com/settings/api_keys" target="_blank" rel="noreferrer" className="flex items-center justify-between text-[12.5px] text-[#14776A] hover:underline">Crear API Key <ExternalLink className="w-3.5 h-3.5" /></a>
              <a href="https://app.sendgrid.com/settings/sender_auth" target="_blank" rel="noreferrer" className="flex items-center justify-between text-[12.5px] text-[#14776A] hover:underline">Verificar remitente <ExternalLink className="w-3.5 h-3.5" /></a>
            </div>
          </div>
        )}
        <div className="border-l-4 border-blue-400 bg-blue-50 rounded-r-lg p-4">
          <div className="flex gap-2.5">
            <Info className="w-4 h-4 text-blue-700 mt-0.5 shrink-0" />
            <div className="text-[12px] text-[#1A1F2C]">
              <strong>Recomendación</strong>
              <p className="text-[#5E6878] mt-1">Para producción institucional con volumen alto usa <strong>SendGrid</strong>. Para pruebas y operaciones internas, <strong>Gmail</strong> es la opción más rápida.</p>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}


// ============== BRANDING ==============
function BrandingPanel() {
  const [settings, setSettings] = useState(null);
  const [f, setF] = useState({});

  const load = () => api.get("/settings").then((r) => { setSettings(r.data); setF(r.data.branding); });
  useEffect(() => { load(); }, []);

  const save = async () => {
    try { await api.patch("/settings/branding", f); toast.success("Imagen gráfica actualizada"); load(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  if (!settings) return <div className="p-8 text-sm text-[#5E6878]">Cargando…</div>;

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-6">
      <div className="space-y-5">
        <div className="border border-[#E2E7EC] rounded-xl bg-white p-5 shadow-card">
          <h4 className="font-display font-bold text-[15px] mb-1">Identidad del producto</h4>
          <p className="text-[12.5px] text-[#5E6878] mb-4">Configura el nombre, el lema y los colores principales que se aplicarán en formularios, actas y reportes.</p>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs font-semibold">Nombre del producto</Label><Input value={f.product_name || ""} onChange={(e) => setF({ ...f, product_name: e.target.value })} className="rounded-lg" data-testid="brand-name" /></div>
            <div><Label className="text-xs font-semibold">Propietario (by)</Label><Input value={f.product_by || ""} onChange={(e) => setF({ ...f, product_by: e.target.value })} className="rounded-lg" data-testid="brand-by" /></div>
            <div className="col-span-2"><Label className="text-xs font-semibold">Tagline</Label><Input value={f.tagline || ""} onChange={(e) => setF({ ...f, tagline: e.target.value })} className="rounded-lg" data-testid="brand-tagline" /></div>
            <div><Label className="text-xs font-semibold">Color primario</Label>
              <div className="flex gap-2">
                <Input value={f.primary_color || ""} onChange={(e) => setF({ ...f, primary_color: e.target.value })} className="rounded-lg font-mono" />
                <div className="w-11 h-10 rounded-lg border border-[#E2E7EC]" style={{ background: f.primary_color }} />
              </div>
            </div>
            <div><Label className="text-xs font-semibold">Color secundario</Label>
              <div className="flex gap-2">
                <Input value={f.secondary_color || ""} onChange={(e) => setF({ ...f, secondary_color: e.target.value })} className="rounded-lg font-mono" />
                <div className="w-11 h-10 rounded-lg border border-[#E2E7EC]" style={{ background: f.secondary_color }} />
              </div>
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <Button onClick={save} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-lg gap-2" data-testid="brand-save-btn"><Save className="w-4 h-4" />Guardar</Button>
          </div>
        </div>
      </div>
      <aside className="lg:sticky lg:top-6 self-start">
        <div className="border border-[#E2E7EC] rounded-xl bg-white p-5 shadow-card">
          <div className="text-[10.5px] uppercase tracking-[0.14em] font-display font-bold text-[#5E6878] mb-2">Vista previa</div>
          <div className="rounded-xl overflow-hidden border border-[#E2E7EC]">
            <div className="p-4 text-white" style={{ background: f.primary_color }}>
              <div className="font-display font-extrabold text-[20px]">{f.product_name}</div>
              <div className="text-[10px] uppercase tracking-[0.16em] opacity-80">by {f.product_by}</div>
            </div>
            <div className="p-4 bg-white">
              <p className="text-[12.5px] text-[#3F4856]">{f.tagline}</p>
              <span className="inline-block mt-3 px-3 py-1.5 rounded-full text-[11px] font-semibold text-white" style={{ background: f.secondary_color }}>Acción secundaria</span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}


// ============== SISTEMA (reset operativo + usuarios de prueba + estados de propuesta) ==============
import { useAuth } from "@/contexts/AuthContext";

function SistemaPanel() {
  const { activeConvocatoriaId } = useAuth();
  const [busy, setBusy] = useState(false);
  const [resetForm, setResetForm] = useState({
    incluir_usuarios: true, incluir_auditoria: true,
    convocatoria_id: "", confirmacion: "",
  });
  const [resetResult, setResetResult] = useState(null);
  const [seedResult, setSeedResult] = useState(null);

  const doReset = async () => {
    if (resetForm.confirmacion !== "REINICIAR") {
      toast.error('Debes escribir REINICIAR para confirmar.');
      return;
    }
    if (!confirm("Última confirmación: ¿REINICIAR todos los datos operativos?\n\nSe borrarán propuestas, jurados, ternas, asignaciones, evaluaciones, rankings, actas y usuarios (excepto admin_general).\n\nSe preserva: convocatorias, campos, catálogos, criterios, desempates, plantillas y branding.")) return;
    setBusy(true);
    try {
      const body = {
        confirmacion: "REINICIAR",
        incluir_usuarios: resetForm.incluir_usuarios,
        incluir_auditoria: resetForm.incluir_auditoria,
        convocatoria_id: resetForm.convocatoria_id || null,
      };
      const r = await api.post("/admin/reset-datos", body);
      setResetResult(r.data);
      toast.success("Reset completado");
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  const doSeedUsers = async () => {
    setBusy(true);
    try {
      const qs = activeConvocatoriaId ? `?convocatoria_id=${activeConvocatoriaId}` : "";
      const r = await api.post(`/admin/seed-test-users${qs}`);
      setSeedResult(r.data);
      toast.success(`${r.data.creados} creados, ${r.data.actualizados} actualizados`);
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* RESET */}
      <div className="border-l-4 border-red-500 bg-red-50 rounded-r-lg p-5">
        <div className="flex gap-3 items-start mb-3">
          <AlertTriangle className="w-6 h-6 text-red-600 mt-0.5 shrink-0" />
          <div>
            <h3 className="font-display font-bold text-[16px] text-red-900">Reiniciar datos operativos</h3>
            <p className="text-[13px] text-red-800 mt-1">
              Borra <strong>propuestas, jurados, ternas, asignaciones, evaluaciones, rankings y actas</strong>.
              Preserva: convocatorias, campos, catálogos, criterios, desempates, plantillas de actas y branding.
              Úsalo solo para el <strong>lanzamiento oficial</strong>.
            </p>
          </div>
        </div>
        <div className="grid sm:grid-cols-3 gap-3 mt-4 bg-white rounded-md p-4 border border-red-200">
          <div className="col-span-3 flex items-center gap-3">
            <Switch checked={resetForm.incluir_usuarios} onCheckedChange={(v) => setResetForm({ ...resetForm, incluir_usuarios: v })} data-testid="reset-incluir-usuarios" />
            <Label className="text-[13px]">Eliminar también usuarios (excepto Administrador General)</Label>
          </div>
          <div className="col-span-3 flex items-center gap-3">
            <Switch checked={resetForm.incluir_auditoria} onCheckedChange={(v) => setResetForm({ ...resetForm, incluir_auditoria: v })} data-testid="reset-incluir-auditoria" />
            <Label className="text-[13px]">Eliminar registros de auditoría</Label>
          </div>
          <div className="col-span-3">
            <Label className="text-[12px] font-semibold">Convocatoria (opcional, si vacío afecta todas)</Label>
            <Input value={resetForm.convocatoria_id} onChange={(e) => setResetForm({ ...resetForm, convocatoria_id: e.target.value })} placeholder={activeConvocatoriaId ? `Por defecto: convocatoria activa (${activeConvocatoriaId})` : "Deja vacío para borrar TODAS las convocatorias"} className="rounded-md font-mono text-[11px]" data-testid="reset-convocatoria-id" />
            <Button type="button" size="sm" variant="outline" className="rounded-sm text-[11px] h-7 mt-1" onClick={() => setResetForm({ ...resetForm, convocatoria_id: activeConvocatoriaId || "" })}>Usar convocatoria activa</Button>
          </div>
          <div className="col-span-3">
            <Label className="text-[12px] font-semibold text-red-700">Escribe <strong>REINICIAR</strong> para habilitar el botón</Label>
            <Input value={resetForm.confirmacion} onChange={(e) => setResetForm({ ...resetForm, confirmacion: e.target.value.toUpperCase() })} placeholder="REINICIAR" className="rounded-md font-mono uppercase" data-testid="reset-confirm-input" />
          </div>
        </div>
        <div className="flex justify-end mt-3">
          <Button onClick={doReset} disabled={busy || resetForm.confirmacion !== "REINICIAR"} className="bg-red-600 hover:bg-red-700 rounded-md gap-2" data-testid="reset-execute-btn">
            <Trash2 className="w-4 h-4" /> Reiniciar datos
          </Button>
        </div>
        {resetResult && (
          <div className="mt-3 bg-white border border-red-200 rounded-md p-3 text-[12px] font-mono">
            <strong>Resumen:</strong>
            <ul className="mt-1">{Object.entries(resetResult.resumen || {}).map(([k, v]) => <li key={k}>· {k}: <strong>{v}</strong> borrado(s)</li>)}</ul>
          </div>
        )}
      </div>

      {/* SEED TEST USERS */}
      <div className="border border-[#E2E7EC] rounded-xl bg-white p-5 shadow-card">
        <h3 className="font-display font-bold text-[15px] flex items-center gap-2">
          <UsersIcon className="w-5 h-5 text-[#14776A]" /> Usuarios de prueba por rol
        </h3>
        <p className="text-[13px] text-[#5E6878] mt-1">
          Crea (o reactiva) 1 usuario de prueba por cada rol del sistema + 3 jurados (para conformar terna).
          Password compartida: <code className="font-mono text-[11px] bg-[#F1F4F7] px-1.5 py-0.5 rounded">Pruebas2026!</code>.
        </p>
        <div className="grid sm:grid-cols-2 gap-2 mt-3 text-[12px]">
          {[
            ["admin.conv@krinos.test", "Administrador de Convocatoria"],
            ["supervisor@krinos.test", "Supervisor"],
            ["invitado@krinos.test", "Invitado de Consulta"],
            ["auditor@krinos.test", "Auditor"],
            ["integrante@krinos.test", "Integrante de Terna"],
            ["jurado1@krinos.test", "Jurado #1"],
            ["jurado2@krinos.test", "Jurado #2"],
            ["jurado3@krinos.test", "Jurado #3"],
          ].map(([email, rol]) => (
            <div key={email} className="flex items-center justify-between bg-[#FAFBFC] rounded-md px-3 py-1.5 border border-border">
              <span className="font-mono">{email}</span>
              <span className="text-muted-foreground">{rol}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-end mt-4">
          <Button onClick={doSeedUsers} disabled={busy} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-md gap-2" data-testid="seed-test-users-btn">
            <RefreshCw className="w-4 h-4" /> Crear / reactivar usuarios de prueba
          </Button>
        </div>
        {seedResult && (
          <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-md p-3 text-[12px]">
            ✓ {seedResult.creados} creados, {seedResult.actualizados} actualizados.
          </div>
        )}
      </div>

      {/* Nota: el catálogo "Estados de Propuesta" se gestiona exclusivamente desde
          Configuración → Catálogos. Aquí no aparece duplicado para evitar confusión. */}
    </div>
  );
}

// ===========================================================================
// PANEL: Solicitudes de reapertura de evaluaciones (Jurado → Admin)
// ===========================================================================
function ReaperturasPanel() {
  const { activeConvocatoriaId } = useAuth();
  const [items, setItems] = React.useState([]);
  const [estado, setEstado] = React.useState("Pendiente");
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!activeConvocatoriaId) return;
    try {
      const r = await api.get(`/reapertura-solicitudes?convocatoria_id=${activeConvocatoriaId}${estado === "todas" ? "" : `&estado=${estado}`}`);
      setItems(r.data || []);
    } catch (e) { toast.error("No se pudieron cargar solicitudes"); }
  }, [activeConvocatoriaId, estado]);
  React.useEffect(() => { load(); }, [load]);

  const aprobar = async (sid) => {
    if (!confirm("Aprobar la reapertura. La evaluación volverá a estar editable para el jurado. ¿Continuar?")) return;
    setBusy(true);
    try { await api.post(`/reapertura-solicitudes/${sid}/aprobar`); toast.success("Solicitud aprobada"); load(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setBusy(false); }
  };
  const rechazar = async (sid) => {
    const motivo = window.prompt("Motivo del rechazo:");
    if (!motivo || !motivo.trim()) return;
    setBusy(true);
    try { await api.post(`/reapertura-solicitudes/${sid}/rechazar`, { motivo_rechazo: motivo }); toast.success("Solicitud rechazada"); load(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="border border-[#E2E7EC] rounded-xl bg-white p-5 shadow-card">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-display font-bold text-[15px] flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-[#14776A]" /> Solicitudes de reapertura
            </h3>
            <p className="text-[12.5px] text-[#5E6878] mt-0.5">
              Cuando un jurado solicita reabrir su evaluación finalizada, la solicitud aparece aquí para tu aprobación.
            </p>
          </div>
          <select value={estado} onChange={(e) => setEstado(e.target.value)} className="border border-border rounded-md text-[12.5px] px-3 py-1.5" data-testid="reap-filter-estado">
            <option value="Pendiente">Pendientes</option>
            <option value="Aprobada">Aprobadas</option>
            <option value="Rechazada">Rechazadas</option>
            <option value="todas">Todas</option>
          </select>
        </div>

        {!items.length ? (
          <div className="text-center py-10 text-muted-foreground">
            <RefreshCw className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-[13px]">Sin solicitudes {estado === "Pendiente" ? "pendientes" : ""} en esta convocatoria.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full dense-table">
              <thead>
                <tr>
                  <th>Jurado</th><th>Propuesta</th><th>Motivo</th><th>Fecha</th><th>Estado</th><th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((s) => (
                  <tr key={s.id} data-testid={`reap-row-${s.id}`}>
                    <td>
                      <div className="font-semibold text-[13px]">{s.jurado_nombre}</div>
                      <div className="text-[11px] text-muted-foreground">{s.jurado_email}</div>
                    </td>
                    <td>
                      <div className="font-mono text-[11px] text-muted-foreground tabular-nums">{s.propuesta_codigo}</div>
                      <div className="text-[12.5px] capitalize">{(s.propuesta_nombre || "").toLowerCase()}</div>
                    </td>
                    <td className="text-[12.5px] max-w-[28ch]" title={s.motivo}>{s.motivo}</td>
                    <td className="text-[11.5px] text-muted-foreground tabular-nums">
                      {new Date(s.created_at).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}
                    </td>
                    <td>
                      <Badge tone={s.estado === "Pendiente" ? "warning" : s.estado === "Aprobada" ? "success" : "muted"}>{s.estado}</Badge>
                    </td>
                    <td className="text-right">
                      {s.estado === "Pendiente" && (
                        <div className="inline-flex items-center gap-1">
                          <Button size="sm" onClick={() => aprobar(s.id)} disabled={busy} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-md gap-1 text-[12px]" data-testid={`reap-approve-${s.id}`}>
                            Aprobar
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => rechazar(s.id)} disabled={busy} className="rounded-md gap-1 text-[12px] text-red-600 border-red-200 hover:bg-red-50" data-testid={`reap-reject-${s.id}`}>
                            Rechazar
                          </Button>
                        </div>
                      )}
                      {s.estado !== "Pendiente" && s.motivo_rechazo && (
                        <span className="text-[10.5px] italic text-muted-foreground">"{s.motivo_rechazo}"</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

