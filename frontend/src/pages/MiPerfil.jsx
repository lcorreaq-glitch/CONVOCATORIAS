import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader, { Badge } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import SignaturePad from "@/components/SignaturePad";
import { toast } from "sonner";
import {
  Sparkles, Loader2, UserCog, Upload, Image as ImageIcon, FileText, ExternalLink,
  Trash2, PenLine, IdCard, ShieldCheck, KeyRound, Save, Eye, EyeOff, AlertCircle,
} from "lucide-react";

const ROLE_LABEL = {
  admin_general: "Administrador General",
  admin_convocatoria: "Administrador de Convocatoria",
  supervisor: "Supervisor",
  jurado: "Jurado",
  integrante_terna: "Integrante de Terna",
  invitado: "Invitado de Consulta",
  auditor: "Auditor",
};

/**
 * MiPerfil — vista universal según el rol:
 *  - Si el usuario es jurado → carga su ficha de jurado (firma, hoja de vida, perfil IA).
 *  - Si NO es jurado → vista simplificada con datos básicos + cambio de contraseña.
 */
export default function MiPerfil() {
  const { user } = useAuth();
  const isJurado = user?.role === "jurado";

  if (!user) {
    return <div className="p-10 text-muted-foreground">Cargando perfil…</div>;
  }
  return isJurado ? <PerfilJurado /> : <PerfilUsuarioGeneral />;
}

// ===========================================================================
// Vista para usuarios NO-jurado (admins, supervisores, auditores, invitados...)
// ===========================================================================
function PerfilUsuarioGeneral() {
  const { user, refresh } = useAuth();
  const [info, setInfo] = useState({ name: "", email: "" });
  const [pwd, setPwd] = useState({ current: "", next: "", confirm: "" });
  const [show, setShow] = useState({ current: false, next: false, confirm: false });
  const [savingInfo, setSavingInfo] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);

  useEffect(() => {
    if (user) setInfo({ name: user.name || "", email: user.email || "" });
  }, [user]);

  const saveInfo = async () => {
    setSavingInfo(true);
    try {
      await api.patch("/auth/me", { name: info.name, email: info.email });
      toast.success("Datos actualizados");
      refresh?.();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setSavingInfo(false); }
  };

  const savePwd = async () => {
    if (!pwd.current || !pwd.next) { toast.error("Completa todos los campos"); return; }
    if (pwd.next.length < 6) { toast.error("La nueva contraseña debe tener al menos 6 caracteres"); return; }
    if (pwd.next !== pwd.confirm) { toast.error("Las contraseñas no coinciden"); return; }
    setSavingPwd(true);
    try {
      await api.post("/auth/change-password", { current_password: pwd.current, new_password: pwd.next });
      toast.success("Contraseña actualizada");
      setPwd({ current: "", next: "", confirm: "" });
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setSavingPwd(false); }
  };

  const initials = (user.name || user.username || "U").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="flex-1 p-8 lg:p-10 max-w-5xl">
      <PageHeader
        eyebrow="Tu cuenta en KRINOS"
        title="Mi Perfil"
        subtitle="Mantén tus datos actualizados y gestiona tu contraseña de acceso."
      />

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Sidebar tarjeta de identidad */}
        <div className="lg:col-span-1 space-y-4">
          <div className="rounded-xl border border-border bg-white p-5 text-center">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#14776A] to-[#0F5E54] text-white grid place-items-center mx-auto mb-4 font-display font-extrabold text-3xl shadow-md">
              {initials}
            </div>
            <div className="font-display font-bold text-[17px]">{user.name || user.username}</div>
            <div className="text-[12px] text-muted-foreground mt-0.5 break-all">{user.email}</div>
            <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold bg-[#F0F7F5] text-[#14776A] px-2.5 py-1 rounded-full border border-[#CDE7E1]">
              <ShieldCheck className="w-3 h-3" /> {ROLE_LABEL[user.role] || user.role}
            </div>
          </div>

          <div className="rounded-xl border-l-4 border-blue-400 bg-blue-50 p-4">
            <div className="flex gap-2.5">
              <AlertCircle className="w-4 h-4 text-blue-700 mt-0.5 shrink-0" />
              <div className="text-[12px] text-[#1A1F2C]">
                <strong>Consejo de seguridad</strong>
                <p className="text-[#5E6878] mt-1">Cambia tu contraseña con regularidad y nunca la compartas por correo o chat.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Datos editables + cambio password */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl border border-border bg-white p-5">
            <h3 className="font-display font-bold text-[15px] mb-3 flex items-center gap-2">
              <UserCog className="w-4 h-4 text-[#14776A]" /> Información de la cuenta
            </h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Nombre completo</Label>
                <Input value={info.name} onChange={(e) => setInfo({ ...info, name: e.target.value })}
                       className="rounded-lg" data-testid="mi-perfil-name" />
              </div>
              <div>
                <Label className="text-xs">Correo electrónico</Label>
                <Input type="email" value={info.email} onChange={(e) => setInfo({ ...info, email: e.target.value })}
                       className="rounded-lg" data-testid="mi-perfil-email" />
              </div>
              <div>
                <Label className="text-xs">Usuario (no editable)</Label>
                <Input value={user.username} readOnly className="rounded-lg bg-[#F1F4F7] font-mono text-[12.5px]" />
              </div>
              <div>
                <Label className="text-xs">Rol asignado</Label>
                <Input value={ROLE_LABEL[user.role] || user.role} readOnly className="rounded-lg bg-[#F1F4F7]" />
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <Button onClick={saveInfo} disabled={savingInfo} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-lg gap-2" data-testid="mi-perfil-save-info">
                {savingInfo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Guardar cambios
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-white p-5">
            <h3 className="font-display font-bold text-[15px] mb-1 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-[#14776A]" /> Cambiar contraseña
            </h3>
            <p className="text-[12.5px] text-[#5E6878] mb-4">
              Necesitarás tu contraseña actual para confirmar el cambio. La nueva debe tener al menos 6 caracteres.
            </p>
            <div className="grid gap-3">
              {[
                { key: "current", label: "Contraseña actual", placeholder: "Tu contraseña actual" },
                { key: "next", label: "Nueva contraseña", placeholder: "Mínimo 6 caracteres" },
                { key: "confirm", label: "Confirmar nueva contraseña", placeholder: "Repite la nueva contraseña" },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <Label className="text-xs">{label}</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      type={show[key] ? "text" : "password"}
                      value={pwd[key]}
                      onChange={(e) => setPwd({ ...pwd, [key]: e.target.value })}
                      placeholder={placeholder}
                      className="rounded-lg"
                      data-testid={`mi-perfil-pwd-${key}`}
                    />
                    <Button type="button" variant="outline" className="rounded-lg shrink-0" onClick={() => setShow((s) => ({ ...s, [key]: !s[key] }))}>
                      {show[key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-4">
              <Button onClick={savePwd} disabled={savingPwd} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-lg gap-2" data-testid="mi-perfil-save-pwd">
                {savingPwd ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                Actualizar contraseña
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Vista para Jurado — versión existente con firma, perfil IA, hoja de vida.
// ===========================================================================
function PerfilJurado() {
  const [jurado, setJurado] = useState(null);
  const [campos, setCampos] = useState([]);
  const [form, setForm] = useState({ telefono: "", perfil: "", foto_url: "", datos: {} });
  const [busy, setBusy] = useState(false);
  const [improving, setImproving] = useState(false);
  const [pwd, setPwd] = useState({ current: "", next: "", confirm: "" });
  const [savingPwd, setSavingPwd] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);

  useEffect(() => {
    api.get("/jurados/me").then(async (r) => {
      const j = r.data;
      setJurado(j);
      setForm({
        telefono: j.telefono || "", perfil: j.perfil || "",
        foto_url: j.foto_url || "", datos: j.datos || {},
      });
      // Cargar campos parametrizables para esta convocatoria
      if (j.convocatoria_id) {
        try {
          const rc = await api.get(`/campos?convocatoria_id=${j.convocatoria_id}&aplica_a=jurado`);
          setCampos(rc.data || []);
        } catch (_) { /* ignore */ }
      }
    }).catch(() => toast.error("No se pudo cargar tu perfil"));
  }, []);

  // Resolver claves dinámicas por rol_especial
  const byRol = (rol) => campos.find((c) => c.rol_especial === rol);
  const campoFirma = byRol("firma");
  const campoHV = byRol("hoja_vida");
  const campoCedula = byRol("documento");
  const campoFoto = byRol("foto");
  const keyFirma = campoFirma ? campoFirma.nombre_interno : "firma_url";
  const keyCedula = campoCedula ? campoCedula.nombre_interno : "cedula";
  const keyHV = campoHV ? campoHV.nombre_interno : "hoja_vida";
  const ROLES_ESPECIALES = new Set(["firma", "hoja_vida", "documento", "foto"]);
  const BASE_KEYS = new Set(["nombre", "email", "telefono", "perfil", "subregiones"]);
  // Campos extras que el jurado puede llenar desde Mi Perfil (anexos comunes y datos parametrizables)
  const camposExtras = campos.filter(
    (c) => !BASE_KEYS.has(c.nombre_interno) && !ROLES_ESPECIALES.has(c.rol_especial)
  );

  const submit = async () => {
    setBusy(true);
    try {
      await api.patch("/jurados/me", form);
      toast.success("Perfil actualizado");
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  const mejorarPerfilIA = async () => {
    if (!form.perfil.trim()) { toast.error("Escribe primero el perfil"); return; }
    setImproving(true);
    try {
      const { data } = await api.post("/ai/mejorar-texto", { texto: form.perfil, contexto: "perfil_jurado" });
      setForm((f) => ({ ...f, perfil: data.texto_mejorado }));
      toast.success("Perfil mejorado con IA");
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Error con IA"); }
    finally { setImproving(false); }
  };

  const onPickFoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData(); fd.append("file", file);
    try {
      const { data } = await api.post("/upload/image", fd, { headers: { "Content-Type": "multipart/form-data" } });
      if (campoFoto) {
        setForm((f) => ({ ...f, datos: { ...(f.datos || {}), [campoFoto.nombre_interno]: data.data_url } }));
      } else {
        setForm((f) => ({ ...f, foto_url: data.data_url }));
      }
      toast.success("Foto cargada");
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail) || "Error al subir foto"); }
  };

  const onPickHV = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData(); fd.append("file", file);
    try {
      const { data } = await api.post("/upload/file", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setForm((f) => ({ ...f, datos: { ...(f.datos || {}), [keyHV]: { url: data.data_url, name: data.filename, size: data.size } } }));
      toast.success(`Hoja de vida "${data.filename}" cargada`);
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail) || "Error"); }
  };

  const onPickAnexo = async (e, campo) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData(); fd.append("file", file);
    try {
      const { data } = await api.post("/upload/file", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setForm((f) => ({ ...f, datos: { ...(f.datos || {}), [campo.nombre_interno]: { url: data.data_url, name: data.filename, size: data.size } } }));
      toast.success(`${campo.nombre_visible} cargado`);
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail) || "Error"); }
  };

  const savePwd = async () => {
    if (!pwd.current || !pwd.next) { toast.error("Completa todos los campos"); return; }
    if (pwd.next.length < 6) { toast.error("La nueva contraseña debe tener al menos 6 caracteres"); return; }
    if (pwd.next !== pwd.confirm) { toast.error("Las contraseñas no coinciden"); return; }
    setSavingPwd(true);
    try {
      await api.post("/auth/change-password", { current_password: pwd.current, new_password: pwd.next });
      toast.success("Contraseña actualizada");
      setPwd({ current: "", next: "", confirm: "" });
      setPwdOpen(false);
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setSavingPwd(false); }
  };

  if (!jurado) return <div className="p-10 text-muted-foreground">Cargando perfil…</div>;

  return (
    <div className="flex-1 p-8 lg:p-10 max-w-5xl">
      <PageHeader
        eyebrow="Bienvenido al portal del jurado"
        title="Mi Perfil"
        subtitle="Mantén actualizada tu información para que el comité organizador pueda contactarte y validar tu experiencia."
      />

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <div className="rounded-xl border border-border bg-white p-5 text-center">
            <div className="w-32 h-32 rounded-full overflow-hidden mx-auto bg-secondary border-2 border-[#CDE7E1] mb-3">
              {(campoFoto ? form.datos?.[campoFoto.nombre_interno] : form.foto_url)
                ? <img src={campoFoto ? form.datos[campoFoto.nombre_interno] : form.foto_url} alt="" className="w-full h-full object-cover" />
                : <div className="w-full h-full grid place-items-center"><UserCog className="w-12 h-12 text-muted-foreground" /></div>}
            </div>
            <label className="inline-flex items-center gap-1.5 text-[12px] text-[#14776A] hover:underline cursor-pointer font-semibold" data-testid="mi-perfil-foto-upload">
              <ImageIcon className="w-3.5 h-3.5" /> Cambiar foto
              <input type="file" accept="image/*" className="hidden" onChange={onPickFoto} />
            </label>
            <div className="mt-4">
              <div className="font-display font-bold text-[16px]">{jurado.nombre}</div>
              <div className="text-[12px] text-muted-foreground">{jurado.email}</div>
              <Badge tone="info">Jurado</Badge>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-white p-4">
            <div className="text-[10.5px] uppercase tracking-wide font-display font-bold text-muted-foreground mb-2">Subregiones asignadas</div>
            <div className="flex flex-wrap gap-1">
              {(jurado.subregiones || []).map((s) => <Badge key={s} tone="muted">{s}</Badge>)}
              {!(jurado.subregiones || []).length && <span className="text-xs italic text-muted-foreground">Ninguna asignada</span>}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2 italic">Para cambiar tus subregiones contacta al administrador.</p>
          </div>
          <Button variant="outline" onClick={() => setPwdOpen((v) => !v)} className="w-full rounded-lg gap-2" data-testid="jurado-toggle-pwd">
            <KeyRound className="w-4 h-4" /> {pwdOpen ? "Ocultar cambio de contraseña" : "Cambiar contraseña"}
          </Button>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl border border-border bg-white p-5">
            <h3 className="font-display font-bold text-[15px] mb-3">Datos de contacto</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Teléfono</Label>
                <Input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} className="rounded-lg" data-testid="mi-perfil-telefono" />
              </div>
              <div>
                <Label className="text-xs flex items-center gap-1.5"><IdCard className="w-3 h-3" />{campoCedula?.nombre_visible || "Documento de identidad (C.C.)"}</Label>
                <Input
                  value={form.datos?.[keyCedula] || ""}
                  onChange={(e) => setForm({ ...form, datos: { ...(form.datos || {}), [keyCedula]: e.target.value } })}
                  className="rounded-lg font-mono"
                  placeholder="Sin puntos ni espacios"
                  data-testid="mi-perfil-cedula"
                />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-white p-5">
            <h3 className="font-display font-bold text-[15px] mb-1 flex items-center gap-2">
              <PenLine className="w-4 h-4 text-[#14776A]" />Firma para actas
            </h3>
            <p className="text-[11.5px] text-muted-foreground mb-3">
              Esta firma se imprimirá automáticamente en tus actas (individual, colectiva, subregional). Dibújala con el dedo o ratón, o sube una imagen PNG/JPG transparente.
            </p>
            <SignaturePad
              value={form.datos?.[keyFirma] || null}
              onChange={(v) => setForm({ ...form, datos: { ...(form.datos || {}), [keyFirma]: v } })}
              testIdPrefix="mi-perfil-firma"
            />
          </div>

          <div className="rounded-xl border border-border bg-white p-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-display font-bold text-[15px]">Perfil profesional</h3>
              <Button size="sm" variant="outline" onClick={mejorarPerfilIA} disabled={improving || !form.perfil.trim()}
                className="rounded-lg gap-1.5 text-[11px] h-7 border-[#14776A] text-[#14776A] hover:bg-[#F0F7F5]"
                data-testid="mi-perfil-mejorar-ia">
                {improving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                Mejorar con IA
              </Button>
            </div>
            <Textarea value={form.perfil} onChange={(e) => setForm({ ...form, perfil: e.target.value })} rows={5} className="rounded-lg" placeholder="Cuenta sobre tu formación y experiencia profesional…" data-testid="mi-perfil-perfil" />
          </div>

          <div className="rounded-xl border border-border bg-white p-5">
            <h3 className="font-display font-bold text-[15px] mb-3 flex items-center gap-2"><FileText className="w-4 h-4" />{campoHV?.nombre_visible || "Hoja de vida"}</h3>
            {form.datos?.[keyHV]?.url ? (
              <div className="flex items-center gap-2 border border-border rounded-lg p-2 bg-secondary/30">
                <FileText className="w-4 h-4 text-[#14776A]" />
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-semibold truncate">{form.datos[keyHV].name}</div>
                  <div className="text-[10.5px] text-muted-foreground">{((form.datos[keyHV].size || 0) / 1024).toFixed(1)} KB</div>
                </div>
                <a href={form.datos[keyHV].url} target="_blank" rel="noreferrer" download={form.datos[keyHV].name} className="text-[#14776A] hover:underline text-xs inline-flex items-center gap-1"><ExternalLink className="w-3 h-3" />ver</a>
                <button onClick={() => setForm({ ...form, datos: { ...form.datos, [keyHV]: null } })} className="text-muted-foreground hover:text-red-500 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ) : (
              <label className="flex items-center justify-center gap-2 border-2 border-dashed border-border rounded-lg p-4 hover:border-[#14776A] cursor-pointer" data-testid="mi-perfil-hv-upload">
                <Upload className="w-4 h-4 text-muted-foreground" />
                <span className="text-[12.5px] text-muted-foreground">Subir hoja de vida (PDF, DOCX, JPG)</span>
                <input type="file" className="hidden" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" onChange={onPickHV} />
              </label>
            )}
          </div>

          {/* Anexos parametrizables (campos con aplica_a=jurado sin rol especial). */}
          {camposExtras.length > 0 && (
            <div className="rounded-xl border border-border bg-white p-5">
              <h3 className="font-display font-bold text-[15px] mb-1">Información adicional solicitada</h3>
              <p className="text-[11.5px] text-muted-foreground mb-3">
                El administrador parametriza desde Configuración qué datos y anexos pedirte aquí.
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                {camposExtras.map((c) => (
                  <ExtraCampoInput
                    key={c.id}
                    campo={c}
                    value={form.datos?.[c.nombre_interno]}
                    onChange={(v) => setForm({ ...form, datos: { ...(form.datos || {}), [c.nombre_interno]: v } })}
                    onPickFile={onPickAnexo}
                  />
                ))}
              </div>
            </div>
          )}

          {pwdOpen && (
            <div className="rounded-xl border border-border bg-white p-5">
              <h3 className="font-display font-bold text-[15px] mb-1 flex items-center gap-2"><KeyRound className="w-4 h-4 text-[#14776A]" />Cambiar contraseña</h3>
              <p className="text-[12.5px] text-muted-foreground mb-3">Mínimo 6 caracteres.</p>
              <div className="grid sm:grid-cols-3 gap-3">
                <div><Label className="text-xs">Actual</Label><Input type="password" value={pwd.current} onChange={(e) => setPwd({ ...pwd, current: e.target.value })} className="rounded-lg" /></div>
                <div><Label className="text-xs">Nueva</Label><Input type="password" value={pwd.next} onChange={(e) => setPwd({ ...pwd, next: e.target.value })} className="rounded-lg" /></div>
                <div><Label className="text-xs">Confirmar</Label><Input type="password" value={pwd.confirm} onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })} className="rounded-lg" /></div>
              </div>
              <div className="flex justify-end mt-3">
                <Button onClick={savePwd} disabled={savingPwd} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-lg gap-2">
                  {savingPwd ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />} Actualizar
                </Button>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={submit} disabled={busy} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-lg gap-2" data-testid="mi-perfil-save">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {busy ? "Guardando…" : "Guardar cambios"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}


// ===========================================================================
// Input dinámico para anexos/campos extras parametrizables del jurado
// ===========================================================================
function ExtraCampoInput({ campo, value, onChange, onPickFile }) {
  const tipo = campo.tipo;
  const label = (
    <Label className="text-xs flex items-center gap-1.5">
      {campo.nombre_visible}
      {campo.obligatorio && <span className="text-red-500">*</span>}
    </Label>
  );
  if (tipo === "archivo") {
    const v = value && typeof value === "object" ? value : null;
    return (
      <div>
        {label}
        {v?.url ? (
          <div className="flex items-center gap-2 border border-border rounded-lg p-2 bg-secondary/30 mt-1">
            <FileText className="w-4 h-4 text-[#14776A]" />
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] font-semibold truncate">{v.name}</div>
              <div className="text-[10.5px] text-muted-foreground">{((v.size || 0) / 1024).toFixed(1)} KB</div>
            </div>
            <a href={v.url} target="_blank" rel="noreferrer" download={v.name} className="text-[#14776A] hover:underline text-xs inline-flex items-center gap-1">
              <ExternalLink className="w-3 h-3" />ver
            </a>
            <button onClick={() => onChange(null)} className="text-muted-foreground hover:text-red-500 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        ) : (
          <label className="flex items-center justify-center gap-2 border-2 border-dashed border-border rounded-lg p-3 hover:border-[#14776A] cursor-pointer mt-1" data-testid={`anexo-${campo.nombre_interno}`}>
            <Upload className="w-4 h-4 text-muted-foreground" />
            <span className="text-[12px] text-muted-foreground">Subir archivo</span>
            <input type="file" className="hidden" onChange={(e) => onPickFile(e, campo)} />
          </label>
        )}
      </div>
    );
  }
  if (tipo === "texto_largo" || tipo === "textarea") {
    return (
      <div className="sm:col-span-2">
        {label}
        <Textarea rows={3} value={value || ""} onChange={(e) => onChange(e.target.value)} className="rounded-lg" />
      </div>
    );
  }
  if (tipo === "si_no") {
    return (
      <div>
        {label}
        <select value={value === true ? "si" : value === false ? "no" : ""} onChange={(e) => onChange(e.target.value === "si" ? true : e.target.value === "no" ? false : null)} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">— Selecciona —</option>
          <option value="si">Sí</option>
          <option value="no">No</option>
        </select>
      </div>
    );
  }
  return (
    <div>
      {label}
      <Input
        type={tipo === "numero" ? "number" : tipo === "fecha" ? "date" : tipo === "hora" ? "time" : tipo === "email" ? "email" : tipo === "url" ? "url" : "text"}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg"
      />
    </div>
  );
}
