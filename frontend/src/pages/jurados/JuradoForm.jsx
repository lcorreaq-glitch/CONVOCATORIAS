import React, { useState, useEffect, useMemo } from "react";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/PageHeader";
import { toast } from "sonner";
import { AlertCircle, Info, ChevronDown, Check, UserCog, Upload, FileText, Sparkles, Loader2, ExternalLink, Trash2 } from "lucide-react";

/**
 * Formulario dinámico para crear/editar un jurado.
 * Renderiza inputs según campos configurados con aplica_a=jurado.
 *
 * Diferencias respecto a PropuestaForm:
 * - Soporta tipo "archivo" (Hoja de vida) con upload
 * - Botón "Mejorar con IA" en el campo Perfil
 * - SOLO modo edición o creación (sin previewMode)
 */
export default function JuradoForm({ open, onOpenChange, convocatoriaId, campos, catalogos, jurado, onSaved }) {
  const isEdit = !!jurado;
  const [form, setForm] = useState({ nombre: "", email: "", telefono: "", perfil: "",
                                      subregiones: [], password: "Jurado2026!", datos: {}, foto_url: "" });
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [improving, setImproving] = useState(false);
  const catById = useMemo(() => Object.fromEntries(catalogos.map((c) => [c.id, c])), [catalogos]);

  useEffect(() => {
    if (!open) return;
    if (jurado) {
      setForm({
        nombre: jurado.nombre || "", email: jurado.email || "",
        telefono: jurado.telefono || "", perfil: jurado.perfil || "",
        subregiones: jurado.subregiones || [],
        password: "", datos: jurado.datos || {}, foto_url: jurado.foto_url || "",
      });
    } else {
      setForm({ nombre: "", email: "", telefono: "", perfil: "",
                subregiones: [], password: "Jurado2026!", datos: {}, foto_url: "" });
    }
    setErrors({});
  }, [open, jurado]);

  const setDato = (key, value) => setForm((f) => ({ ...f, datos: { ...f.datos, [key]: value } }));

  // Campos extra (no base): los campos jurado configurados que no estén entre nombre/email/telefono/perfil/subregiones
  const BASE_KEYS = new Set(["nombre", "email", "telefono", "perfil", "subregiones"]);
  const camposExtra = useMemo(() => campos.filter((c) => !BASE_KEYS.has(c.nombre_interno)), [campos]);

  // Catálogo de subregiones (campo base)
  const campoSubregion = campos.find((c) => c.nombre_interno === "subregiones");
  const subregionesOpts = campoSubregion?.catalogo_id ? (catById[campoSubregion.catalogo_id]?.valores || []) : [];

  const validate = () => {
    const errs = {};
    if (!form.nombre.trim()) errs.nombre = "Obligatorio";
    if (!form.email.trim()) errs.email = "Obligatorio";
    if (!form.telefono.trim()) errs.telefono = "Obligatorio";
    if (form.subregiones.length === 0) errs.subregiones = "Selecciona al menos una";
    camposExtra.forEach((c) => {
      if (c.obligatorio) {
        const v = form.datos[c.nombre_interno];
        const empty = v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
        if (empty) errs[c.nombre_interno] = "Obligatorio";
      }
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const submit = async () => {
    if (!validate()) { toast.error("Revisa los campos marcados en rojo"); return; }
    setBusy(true);
    try {
      const payload = {
        convocatoria_id: convocatoriaId,
        nombre: form.nombre.trim(), email: form.email.trim().toLowerCase(),
        telefono: form.telefono, perfil: form.perfil,
        subregiones: form.subregiones,
        datos: form.datos, foto_url: form.foto_url,
      };
      let resp;
      if (isEdit) {
        resp = await api.patch(`/jurados/${jurado.id}`, payload);
      } else {
        resp = await api.post("/jurados", { ...payload, crear_usuario: true, password: form.password || "Jurado2026!" });
      }
      toast.success(isEdit ? "Jurado actualizado" : "Jurado creado y usuario asociado");
      onSaved && onSaved(resp.data);
      onOpenChange(false);
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Error al guardar"); }
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-lg max-w-3xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <UserCog className="w-5 h-5 text-[#14776A]" />
            <DialogTitle className="font-display text-[18px]">
              {isEdit ? `Editar jurado: ${jurado.nombre}` : "Nuevo jurado"}
            </DialogTitle>
          </div>
          <p className="text-[12px] text-muted-foreground mt-1">
            Campos marcados con <span className="text-red-600">*</span> son obligatorios.
            {!isEdit && " Al crear se generará un usuario con rol Jurado y contraseña inicial."}
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Datos básicos */}
          <Section title="Datos personales">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <RequiredLabel error={errors.nombre}>Nombre completo</RequiredLabel>
                <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className={`rounded-lg ${errors.nombre ? "border-red-400" : ""}`} data-testid="jur-nombre" />
              </div>
              <div>
                <RequiredLabel error={errors.email}>Email</RequiredLabel>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={`rounded-lg ${errors.email ? "border-red-400" : ""}`} disabled={isEdit} data-testid="jur-email" />
              </div>
              <div>
                <RequiredLabel error={errors.telefono}>Teléfono</RequiredLabel>
                <Input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} className={`rounded-lg ${errors.telefono ? "border-red-400" : ""}`} data-testid="jur-telefono" />
              </div>
              {!isEdit && (
                <div>
                  <Label className="text-xs">Contraseña inicial</Label>
                  <Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="rounded-lg font-mono" data-testid="jur-password" />
                </div>
              )}
            </div>
          </Section>

          {/* Subregiones (campo base, multiselect) */}
          <Section title="Subregiones donde puede actuar">
            <RequiredLabel error={errors.subregiones}>Selecciona una o varias subregiones</RequiredLabel>
            <MultiSelect
              value={form.subregiones}
              onChange={(v) => setForm({ ...form, subregiones: v })}
              options={subregionesOpts}
              placeholder="Selecciona subregiones…"
              testId="jur-subregiones"
            />
            <p className="text-[10.5px] text-muted-foreground mt-1">Este jurado podrá ser asignado a ternas de cualquiera de estas subregiones.</p>
          </Section>

          {/* Perfil profesional con IA */}
          <Section title="Perfil profesional">
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs">Resumen de formación y experiencia</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={mejorarPerfilIA}
                disabled={improving || !form.perfil.trim()}
                className="rounded-lg gap-1.5 text-[11px] h-7 border-[#14776A] text-[#14776A] hover:bg-[#F0F7F5]"
                data-testid="jur-mejorar-ia"
              >
                {improving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                Mejorar con IA
              </Button>
            </div>
            <Textarea value={form.perfil} onChange={(e) => setForm({ ...form, perfil: e.target.value })} rows={4} className="rounded-lg" placeholder="Ej. Ingeniera industrial, magíster en gestión de proyectos…" data-testid="jur-perfil" />
          </Section>

          {/* Campos extra dinámicos */}
          {camposExtra.length > 0 && (
            <Section title="Información adicional">
              <div className="grid sm:grid-cols-2 gap-3">
                {camposExtra.map((c) => (
                  <DynamicField
                    key={c.id}
                    campo={c}
                    catalogo={c.catalogo_id ? catById[c.catalogo_id] : null}
                    value={form.datos[c.nombre_interno]}
                    onChange={(v) => setDato(c.nombre_interno, v)}
                    error={errors[c.nombre_interno]}
                  />
                ))}
              </div>
            </Section>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border shrink-0 bg-secondary/30">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-lg">Cancelar</Button>
          <Button onClick={submit} disabled={busy} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-lg" data-testid="jur-submit-btn">
            {busy ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear jurado"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <h3 className="text-[11px] uppercase tracking-[0.14em] font-display font-bold text-[#14776A] mb-2.5">{title}</h3>
      {children}
    </div>
  );
}

function RequiredLabel({ children, error }) {
  return (
    <Label className="text-xs flex items-center gap-1">
      {children} <span className="text-red-600">*</span>
      {error && <span className="text-red-600 text-[10px] ml-auto flex items-center gap-1"><AlertCircle className="w-3 h-3" />{error}</span>}
    </Label>
  );
}

function DynamicField({ campo, catalogo, value, onChange, error }) {
  const label = (
    <Label className="text-xs flex items-center gap-1">
      {campo.nombre_visible}
      {campo.obligatorio && <span className="text-red-600">*</span>}
      {error && <span className="text-red-600 text-[10px] ml-auto flex items-center gap-1"><AlertCircle className="w-3 h-3" />{error}</span>}
    </Label>
  );
  const inputCls = `rounded-lg ${error ? "border-red-400" : ""}`;
  const valores = catalogo?.valores?.filter((v) => v.activo !== false) || [];

  switch (campo.tipo) {
    case "archivo":
      return <div className="col-span-full"><FileUpload label={label} value={value} onChange={onChange} testId={`jur-field-${campo.nombre_interno}`} /></div>;
    case "texto_largo":
      return <div className="col-span-full">{label}<Textarea value={value || ""} onChange={(e) => onChange(e.target.value)} className={inputCls} rows={3} /></div>;
    case "numero": case "moneda": case "porcentaje":
      return <div>{label}<Input type="number" value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} className={inputCls} /></div>;
    case "fecha":
      return <div>{label}<Input type="date" value={value || ""} onChange={(e) => onChange(e.target.value)} className={inputCls} /></div>;
    case "email":
      return <div>{label}<Input type="email" value={value || ""} onChange={(e) => onChange(e.target.value)} className={inputCls} /></div>;
    case "telefono":
      return <div>{label}<Input type="tel" value={value || ""} onChange={(e) => onChange(e.target.value)} className={inputCls} /></div>;
    case "url":
      return <div className="col-span-full">{label}<Input type="url" value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder="https://…" className={inputCls} /></div>;
    case "si_no":
      return (<div className="flex items-center justify-between border border-border rounded-lg px-3 py-2 bg-white"><div>{label}</div><Switch checked={!!value} onCheckedChange={onChange} /></div>);
    case "lista":
      if (!catalogo) return <div>{label}<Input value={value || ""} onChange={(e) => onChange(e.target.value)} className={inputCls} placeholder="(catálogo no vinculado)" /></div>;
      return (<div>{label}<Select value={value || ""} onValueChange={onChange}><SelectTrigger className={inputCls}><SelectValue placeholder="Selecciona…" /></SelectTrigger><SelectContent>{valores.map((v) => <SelectItem key={v.id} value={v.valor}>{v.valor}</SelectItem>)}</SelectContent></Select></div>);
    case "seleccion_multiple":
      return <div className="col-span-full">{label}<MultiSelect value={value || []} onChange={onChange} options={valores} /></div>;
    default:
      return <div>{label}<Input value={value || ""} onChange={(e) => onChange(e.target.value)} className={inputCls} /></div>;
  }
}

function FileUpload({ label, value, onChange, testId }) {
  const [uploading, setUploading] = useState(false);
  const onPick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/upload/file", fd, { headers: { "Content-Type": "multipart/form-data" } });
      onChange({ url: data.data_url, name: data.filename, size: data.size, content_type: data.content_type });
      toast.success(`Archivo "${data.filename}" subido`);
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail) || "Error al subir"); }
    finally { setUploading(false); e.target.value = ""; }
  };

  return (
    <div>
      {label}
      {value && typeof value === "object" && value.url ? (
        <div className="flex items-center gap-2 border border-border rounded-lg p-2 bg-secondary/30">
          <FileText className="w-4 h-4 text-[#14776A] shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-semibold truncate">{value.name}</div>
            <div className="text-[10.5px] text-muted-foreground">{(value.size / 1024).toFixed(1)} KB</div>
          </div>
          <a href={value.url} target="_blank" rel="noreferrer" download={value.name} className="text-[#14776A] hover:underline text-xs inline-flex items-center gap-1" data-testid={`${testId}-download`}>
            <ExternalLink className="w-3 h-3" />ver
          </a>
          <button type="button" onClick={() => onChange(null)} className="text-muted-foreground hover:text-red-500 p-1" data-testid={`${testId}-remove`}>
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <label className="flex items-center justify-center gap-2 border-2 border-dashed border-border rounded-lg p-3 hover:border-[#14776A] cursor-pointer transition-colors">
          {uploading ? <Loader2 className="w-4 h-4 animate-spin text-[#14776A]" /> : <Upload className="w-4 h-4 text-muted-foreground" />}
          <span className="text-[12.5px] text-muted-foreground">{uploading ? "Subiendo…" : "Click para subir archivo (PDF, DOCX, JPG, máx 10 MB)"}</span>
          <input type="file" className="hidden" onChange={onPick} accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.zip,.txt" data-testid={testId} />
        </label>
      )}
    </div>
  );
}

function MultiSelect({ value, onChange, options, placeholder = "Selecciona…", testId }) {
  const selected = Array.isArray(value) ? value : [];
  const toggle = (v) => {
    if (selected.includes(v)) onChange(selected.filter((x) => x !== v));
    else onChange([...selected, v]);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="w-full flex items-center justify-between gap-2 rounded-lg border border-border bg-white px-3 min-h-10 text-sm py-1.5" data-testid={testId}>
          <div className="flex flex-wrap gap-1 items-center flex-1 min-w-0">
            {selected.length === 0 ? <span className="text-muted-foreground">{placeholder}</span> : selected.map((s) => <Badge key={s} tone="info">{s}</Badge>)}
          </div>
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2 max-h-72 overflow-auto">
        {!options.length && <div className="text-xs text-muted-foreground p-2">Sin opciones</div>}
        {options.map((opt) => {
          const isOn = selected.includes(opt.valor);
          return (
            <button key={opt.id || opt.valor} type="button" onClick={() => toggle(opt.valor)} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left hover:bg-secondary ${isOn ? "bg-[#F0F7F5]" : ""}`}>
              <span className={`w-4 h-4 rounded border ${isOn ? "bg-[#14776A] border-[#14776A]" : "border-border"} grid place-items-center`}>{isOn && <Check className="w-3 h-3 text-white" />}</span>
              {opt.valor}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
