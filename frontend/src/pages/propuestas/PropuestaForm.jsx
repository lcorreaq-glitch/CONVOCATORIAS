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
import { AlertCircle, Info, ChevronDown, Check, FileEdit } from "lucide-react";

/**
 * Formulario dinámico para crear/editar una propuesta.
 * Renderiza los inputs según los `campos` configurados de la convocatoria
 * y rellena las opciones de listas con los `catalogos` correspondientes.
 *
 * Props:
 *  - open, onOpenChange
 *  - convocatoriaId
 *  - campos: lista de campos configurados (ordenados)
 *  - catalogos: lista de catálogos disponibles
 *  - propuesta: si existe, modo edición; null = creación
 *  - onSaved(p): callback con la propuesta creada/actualizada
 */
export default function PropuestaForm({ open, onOpenChange, convocatoriaId, campos, catalogos, propuesta, onSaved }) {
  const isEdit = !!propuesta;
  const [form, setForm] = useState({ codigo: "", nombre: "", organizacion: "", datos: {} });
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});

  // Catálogos indexados por id
  const catById = useMemo(() => Object.fromEntries(catalogos.map((c) => [c.id, c])), [catalogos]);

  useEffect(() => {
    if (!open) return;
    if (propuesta) {
      setForm({
        codigo: propuesta.codigo || "",
        nombre: propuesta.nombre || "",
        organizacion: propuesta.organizacion || "",
        datos: propuesta.datos || {},
      });
    } else {
      setForm({ codigo: "", nombre: "", organizacion: "", datos: {} });
    }
    setErrors({});
  }, [open, propuesta]);

  const setDato = (key, value) => setForm((f) => ({ ...f, datos: { ...f.datos, [key]: value } }));

  const validate = () => {
    const errs = {};
    if (!form.nombre.trim()) errs.nombre = "Obligatorio";
    campos.forEach((c) => {
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
    if (!validate()) {
      toast.error("Revisa los campos obligatorios señalados en rojo");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        convocatoria_id: convocatoriaId,
        codigo: form.codigo || undefined,
        nombre: form.nombre.trim(),
        organizacion: form.organizacion || form.datos.nombre_organizacion || "",
        datos: form.datos,
        estado: propuesta?.estado || "Registrada",
      };
      let resp;
      if (isEdit) {
        resp = await api.patch(`/propuestas/${propuesta.id}`, payload);
      } else {
        resp = await api.post("/propuestas", payload);
      }
      toast.success(isEdit ? "Propuesta actualizada" : `Propuesta ${resp.data.codigo} creada`);
      onSaved && onSaved(resp.data);
      onOpenChange(false);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Error al guardar");
    } finally { setBusy(false); }
  };

  // Agrupar campos por sección visual (4 grupos)
  const grupos = useMemo(() => {
    const territoriales = ["subregion", "municipio"];
    const organizacionales = ["tipo_organizacion", "enfoque_poblacional", "nombre_organizacion", "nit_rut", "id_organismo_comunal", "representante_legal"];
    const propuestaFlds = ["linea", "tematica"];
    const filtered = (keys) => campos.filter((c) => keys.includes(c.nombre_interno));
    const otros = campos.filter((c) =>
      !territoriales.includes(c.nombre_interno) &&
      !organizacionales.includes(c.nombre_interno) &&
      !propuestaFlds.includes(c.nombre_interno)
    );
    return [
      { title: "Información territorial", items: filtered(territoriales) },
      { title: "Información de la organización", items: filtered(organizacionales) },
      { title: "Categorización de la propuesta", items: filtered(propuestaFlds) },
      { title: "Datos administrativos y adicionales", items: otros },
    ].filter((g) => g.items.length > 0);
  }, [campos]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-lg max-w-3xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <FileEdit className="w-5 h-5 text-[#14776A]" />
            <DialogTitle className="font-display text-[18px]">
              {isEdit ? `Editar propuesta ${propuesta.codigo}` : "Nueva propuesta"}
            </DialogTitle>
          </div>
          <p className="text-[12px] text-muted-foreground mt-1">
            Los campos marcados con <span className="text-red-600">*</span> son obligatorios. El formulario se adapta automáticamente a la convocatoria activa.
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Campos base de la propuesta */}
          <Section title="Identificación de la propuesta">
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Código <span className="text-muted-foreground font-normal">(opcional, autogenerado)</span></Label>
                <Input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} placeholder="P-0001" className="rounded-lg" disabled={isEdit} data-testid="prop-codigo" />
              </div>
              <div className="sm:col-span-2">
                <RequiredLabel error={errors.nombre}>Nombre de la propuesta</RequiredLabel>
                <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className={`rounded-lg ${errors.nombre ? "border-red-400" : ""}`} data-testid="prop-nombre" />
              </div>
            </div>
          </Section>

          {grupos.map((g) => (
            <Section key={g.title} title={g.title}>
              <div className="grid sm:grid-cols-2 gap-3">
                {g.items.map((c) => (
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
          ))}

          {campos.length === 0 && (
            <div className="border border-dashed border-border rounded-lg p-6 text-center text-sm text-muted-foreground">
              <Info className="w-5 h-5 mx-auto mb-2" />
              Esta convocatoria no tiene campos configurados. Ve a <strong className="text-[#14776A]">Configuración → Campos</strong> para agregarlos.
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border shrink-0 bg-secondary/30">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-lg">Cancelar</Button>
          <Button onClick={submit} disabled={busy} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-lg" data-testid="prop-submit-btn">
            {busy ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear propuesta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }) {
  return (
    <div className="mb-5">
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
  const id = `field-${campo.nombre_interno}`;
  const label = (
    <Label className="text-xs flex items-center gap-1" htmlFor={id}>
      {campo.nombre_visible}
      {campo.obligatorio && <span className="text-red-600">*</span>}
      {campo.catalogo_id && <span className="text-[9.5px] text-muted-foreground font-normal italic">(de catálogo)</span>}
      {error && <span className="text-red-600 text-[10px] ml-auto flex items-center gap-1"><AlertCircle className="w-3 h-3" />{error}</span>}
    </Label>
  );

  const inputCls = `rounded-lg ${error ? "border-red-400" : ""}`;
  const valores = catalogo?.valores?.filter((v) => v.activo !== false) || [];

  switch (campo.tipo) {
    case "texto_largo":
      return (
        <div className="col-span-full">
          {label}
          <Textarea id={id} value={value || ""} onChange={(e) => onChange(e.target.value)} className={inputCls} rows={3} data-testid={`prop-field-${campo.nombre_interno}`} />
        </div>
      );
    case "numero":
    case "moneda":
    case "porcentaje":
      return (
        <div>{label}
          <Input id={id} type="number" value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} className={inputCls} data-testid={`prop-field-${campo.nombre_interno}`} />
        </div>
      );
    case "fecha":
      return (<div>{label}
        <Input id={id} type="date" value={value || ""} onChange={(e) => onChange(e.target.value)} className={inputCls} data-testid={`prop-field-${campo.nombre_interno}`} />
      </div>);
    case "hora":
      return (<div>{label}
        <Input id={id} type="time" value={value || ""} onChange={(e) => onChange(e.target.value)} className={inputCls} data-testid={`prop-field-${campo.nombre_interno}`} />
      </div>);
    case "email":
      return (<div>{label}
        <Input id={id} type="email" value={value || ""} onChange={(e) => onChange(e.target.value)} className={inputCls} data-testid={`prop-field-${campo.nombre_interno}`} />
      </div>);
    case "telefono":
      return (<div>{label}
        <Input id={id} type="tel" value={value || ""} onChange={(e) => onChange(e.target.value)} className={inputCls} data-testid={`prop-field-${campo.nombre_interno}`} />
      </div>);
    case "url":
      return (<div className="col-span-full">{label}
        <Input id={id} type="url" value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder="https://…" className={inputCls} data-testid={`prop-field-${campo.nombre_interno}`} />
      </div>);
    case "si_no":
      return (
        <div className="flex items-center justify-between border border-border rounded-lg px-3 py-2 bg-white">
          <div>{label}</div>
          <Switch checked={!!value} onCheckedChange={onChange} data-testid={`prop-field-${campo.nombre_interno}`} />
        </div>
      );
    case "lista":
      if (!catalogo) {
        return (<div>{label}
          <Input id={id} value={value || ""} onChange={(e) => onChange(e.target.value)} className={inputCls} placeholder="(catálogo no vinculado)" data-testid={`prop-field-${campo.nombre_interno}`} />
        </div>);
      }
      return (
        <div>{label}
          <Select value={value || ""} onValueChange={onChange}>
            <SelectTrigger className={inputCls} data-testid={`prop-field-${campo.nombre_interno}`}>
              <SelectValue placeholder="Selecciona…" />
            </SelectTrigger>
            <SelectContent>
              {valores.map((v) => <SelectItem key={v.id} value={v.valor}>{v.valor}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      );
    case "seleccion_multiple":
      return (
        <div className="col-span-full">{label}
          <MultiSelect value={value || []} onChange={onChange} options={valores} testId={`prop-field-${campo.nombre_interno}`} />
        </div>
      );
    case "texto_corto":
    default:
      return (<div>{label}
        <Input id={id} value={value || ""} onChange={(e) => onChange(e.target.value)} className={inputCls} data-testid={`prop-field-${campo.nombre_interno}`} />
      </div>);
  }
}

function MultiSelect({ value, onChange, options, testId }) {
  const selected = Array.isArray(value) ? value : [];
  const toggle = (v) => {
    if (selected.includes(v)) onChange(selected.filter((x) => x !== v));
    else onChange([...selected, v]);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-full flex items-center justify-between gap-2 rounded-lg border border-border bg-white px-3 h-10 text-sm"
          data-testid={testId}
        >
          <div className="flex flex-wrap gap-1 items-center flex-1 min-w-0">
            {selected.length === 0
              ? <span className="text-muted-foreground">Selecciona…</span>
              : selected.map((s) => <Badge key={s} tone="muted">{s}</Badge>)}
          </div>
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2 max-h-72 overflow-auto">
        {!options.length && <div className="text-xs text-muted-foreground p-2">Sin opciones</div>}
        {options.map((opt) => {
          const isOn = selected.includes(opt.valor);
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => toggle(opt.valor)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left hover:bg-secondary ${isOn ? "bg-[#F0F7F5]" : ""}`}
            >
              <span className={`w-4 h-4 rounded border ${isOn ? "bg-[#14776A] border-[#14776A]" : "border-border"} grid place-items-center`}>
                {isOn && <Check className="w-3 h-3 text-white" />}
              </span>
              {opt.valor}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
