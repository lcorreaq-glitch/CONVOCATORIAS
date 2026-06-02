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
        </TabsList>

        <TabsContent value="usuarios"><UsersPanel /></TabsContent>
        <TabsContent value="roles"><RolesPanel /></TabsContent>
        <TabsContent value="ia"><AIPanel /></TabsContent>
        <TabsContent value="sendgrid"><SendGridPanel /></TabsContent>
        <TabsContent value="branding"><BrandingPanel /></TabsContent>
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
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [f, setF] = useState({ username: "", email: "", name: "", password: "", role: "supervisor" });

  const load = () => api.get("/users").then((r) => setItems(r.data));
  useEffect(() => { load(); }, []);

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
                  {Object.entries(ROLES_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
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
                <td>{ROLES_LABELS[u.role] || u.role}</td>
                <td>{u.active ? <Badge tone="success">activo</Badge> : <Badge tone="danger">inactivo</Badge>}</td>
                <td className="text-right space-x-2">
                  <Button size="sm" variant="outline" className="rounded-lg" onClick={() => startEdit(u)}>Editar</Button>
                  <Button size="sm" variant="outline" className="rounded-lg" onClick={() => toggleActive(u)}>{u.active ? "Desactivar" : "Activar"}</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============== ROLES ==============
function RolesPanel() {
  const [matrix, setMatrix] = useState(null);
  useEffect(() => { api.get("/permissions/matrix").then((r) => setMatrix(r.data)); }, []);
  if (!matrix) return <div className="p-8 text-sm text-[#5E6878]">Cargando matriz de permisos…</div>;

  return (
    <div>
      <div className="border-l-4 border-[#14776A] bg-[#F0F7F5] rounded-r-lg p-4 mb-5 flex gap-3">
        <Info className="w-5 h-5 text-[#14776A] mt-0.5 shrink-0" />
        <div className="text-[13px] text-[#1A1F2C]">
          <strong className="font-display">Matriz predefinida (versión {matrix.version})</strong>
          <p className="text-[#5E6878] mt-1">{matrix.note}</p>
        </div>
      </div>
      <div className="border border-[#E2E7EC] rounded-xl bg-white overflow-x-auto shadow-card">
        <table className="w-full dense-table">
          <thead>
            <tr>
              <th className="!text-left sticky left-0 bg-background z-10">Módulo</th>
              {matrix.roles.map((r) => <th key={r} className="!text-center min-w-[110px]">{ROLES_LABELS[r] || r}</th>)}
            </tr>
          </thead>
          <tbody>
            {matrix.modules.map((m) => (
              <tr key={m}>
                <td className="sticky left-0 bg-white font-semibold capitalize">{m}</td>
                {matrix.roles.map((r) => {
                  const acts = matrix.permissions[r][m] || [];
                  return (
                    <td key={r} className="!text-center">
                      {acts.length === 0
                        ? <span className="text-[#CBD2DA]">—</span>
                        : (
                          <div className="flex flex-wrap gap-1 justify-center">
                            {acts.map((a) => <Badge key={a} tone="success">{a}</Badge>)}
                          </div>
                        )
                      }
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
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
function SendGridPanel() {
  const [settings, setSettings] = useState(null);
  const [show, setShow] = useState(false);
  const [f, setF] = useState({});

  const load = () => api.get("/settings").then((r) => { setSettings(r.data); setF({
    api_key: "",
    from_email: r.data.sendgrid.from_email,
    from_name: r.data.sendgrid.from_name,
    enabled: r.data.sendgrid.enabled,
    test_recipient: r.data.sendgrid.test_recipient,
  }); });
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      const body = { ...f };
      if (!body.api_key) delete body.api_key;
      await api.patch("/settings/sendgrid", body);
      toast.success("Configuración SendGrid guardada");
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const testSend = async () => {
    try {
      const r = await api.post("/settings/sendgrid/test");
      toast.info(r.data.message || "Prueba enviada");
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  if (!settings) return <div className="p-8 text-sm text-[#5E6878]">Cargando…</div>;
  const sg = settings.sendgrid;

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-6">
      <div className="space-y-5">
        <div className="border border-[#E2E7EC] rounded-xl bg-white p-5 shadow-card">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h4 className="font-display font-bold text-[15px]">Envío institucional con SendGrid</h4>
              <p className="text-[12.5px] text-[#5E6878]">Habilite el envío de correos automáticos: invitación a jurados, recordatorios, restablecimiento de contraseña y notificaciones de resultados.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-wider text-[#5E6878]">{f.enabled ? "Habilitado" : "Deshabilitado"}</span>
              <Switch checked={f.enabled} onCheckedChange={(v) => setF({ ...f, enabled: v })} data-testid="sg-enabled" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label className="text-xs font-semibold">SendGrid API Key</Label>
              <div className="flex gap-2">
                <Input type={show ? "text" : "password"} value={f.api_key} onChange={(e) => setF({ ...f, api_key: e.target.value })}
                       placeholder={sg.has_api_key ? sg.api_key_masked : "SG.xxxxxxxxxxxx..."}
                       className="rounded-lg font-mono" data-testid="sg-api-key" />
                <Button type="button" variant="outline" className="rounded-lg" onClick={() => setShow((s) => !s)}>
                  {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-[11px] text-[#5E6878] mt-1.5">{sg.has_api_key ? "Ya hay una key registrada. Pegue una nueva solo para reemplazarla." : "Permiso recomendado: Mail Send (Full Access)."}</p>
            </div>
            <div>
              <Label className="text-xs font-semibold">Email remitente verificado</Label>
              <Input value={f.from_email || ""} onChange={(e) => setF({ ...f, from_email: e.target.value })} placeholder="notificaciones@krinos.com" className="rounded-lg" data-testid="sg-from-email" />
            </div>
            <div>
              <Label className="text-xs font-semibold">Nombre remitente</Label>
              <Input value={f.from_name || ""} onChange={(e) => setF({ ...f, from_name: e.target.value })} placeholder="KRINOS" className="rounded-lg" data-testid="sg-from-name" />
            </div>
            <div className="col-span-2">
              <Label className="text-xs font-semibold">Destinatario para prueba</Label>
              <Input value={f.test_recipient || ""} onChange={(e) => setF({ ...f, test_recipient: e.target.value })} placeholder="su.correo@dominio.com" className="rounded-lg" data-testid="sg-test-recipient" />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button onClick={testSend} variant="outline" className="rounded-lg gap-2" data-testid="sg-test-btn"><Send className="w-4 h-4" />Enviar prueba</Button>
            <Button onClick={save} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-lg gap-2" data-testid="sg-save-btn"><Save className="w-4 h-4" />Guardar</Button>
          </div>
        </div>

        <div className="border border-[#E2E7EC] rounded-xl bg-white p-5 shadow-card">
          <h4 className="font-display font-bold text-[15px] mb-3">Plantillas embebidas</h4>
          <p className="text-[12.5px] text-[#5E6878] mb-4">Las siguientes plantillas se enviarán automáticamente cuando el servicio esté habilitado y la convocatoria active el evento correspondiente.</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              { title: "Invitación a jurado", desc: "Cuando un jurado es creado o asignado a una convocatoria.", trigger: "jurado_invitado" },
              { title: "Recordatorio de evaluación", desc: "3 días antes del cierre de la etapa individual.", trigger: "recordatorio_evaluacion" },
              { title: "Resultado disponible", desc: "Cuando una propuesta es habilitada / no habilitada.", trigger: "habilitacion" },
              { title: "Publicación de resultados", desc: "Al cerrar la convocatoria con ranking definitivo.", trigger: "resultados" },
              { title: "Restablecer contraseña", desc: "A solicitud del usuario.", trigger: "reset_password" },
              { title: "Acta firmada", desc: "Notifica a firmantes cuando se completa una firma.", trigger: "acta_firmada" },
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

      <aside className="lg:sticky lg:top-6 self-start space-y-3">
        <div className="border border-[#E2E7EC] rounded-xl bg-white p-5 shadow-card">
          <div className="text-[10.5px] uppercase tracking-[0.14em] font-display font-bold text-[#14776A] mb-2">Guía paso a paso</div>
          <h4 className="font-display font-bold text-[15px] mb-3">Configurar SendGrid</h4>
          <ol className="space-y-2.5 text-[12.5px] text-[#3F4856]">
            <li><strong>1.</strong> Cree una cuenta en SendGrid.</li>
            <li><strong>2.</strong> Verifique un <em>Single Sender</em> o un dominio (Authenticate Domain) — desde Settings → Sender Authentication.</li>
            <li><strong>3.</strong> Genere una API Key con permiso <strong>Mail Send → Full Access</strong>.</li>
            <li><strong>4.</strong> Péguela en este formulario junto con el email remitente verificado.</li>
            <li><strong>5.</strong> Active el switch y pruebe envíando un correo de prueba.</li>
          </ol>
          <div className="border-t border-[#E2E7EC] mt-4 pt-3 space-y-1.5">
            <a href="https://app.sendgrid.com/settings/api_keys" target="_blank" rel="noreferrer" className="flex items-center justify-between text-[12.5px] text-[#14776A] hover:underline">
              Crear API Key <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <a href="https://app.sendgrid.com/settings/sender_auth" target="_blank" rel="noreferrer" className="flex items-center justify-between text-[12.5px] text-[#14776A] hover:underline">
              Verificar remitente <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <a href="https://docs.sendgrid.com/" target="_blank" rel="noreferrer" className="flex items-center justify-between text-[12.5px] text-[#14776A] hover:underline">
              Documentación oficial <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
        <div className="border-l-4 border-amber-400 bg-amber-50 rounded-r-lg p-4">
          <div className="flex gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
            <div className="text-[12px] text-[#1A1F2C]">
              <strong>Modo configuración</strong>
              <p className="text-[#5E6878] mt-1">Los formularios y plantillas ya están listos. El envío real se activará cuando registre una API Key válida y verifique el remitente en SendGrid.</p>
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
