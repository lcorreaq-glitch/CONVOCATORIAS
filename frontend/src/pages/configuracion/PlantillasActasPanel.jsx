import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Save, FileText, Users, Map, Copy, AlertCircle, Sparkles, ImageIcon, Upload, Trash2 } from "lucide-react";

const TIPOS = [
  { key: "individual", label: "Acta Individual", icon: FileText, desc: "Una por jurado · resume sus evaluaciones individuales asignadas." },
  { key: "colectiva_terna", label: "Acta Colectiva (Terna)", icon: Users, desc: "Una por terna · consolida la deliberación colectiva del trío de jurados." },
  { key: "subregional", label: "Acta Subregional", icon: Map, desc: "Una por subregión · firmada por todos los jurados que evaluaron esa subregión.", subregionOnly: true },
];

const FIELDS = [
  { key: "encabezado", label: "Encabezado / Título", rows: 3, hint: "Aparece en la cabecera del PDF. Una línea por título / subtítulo." },
  { key: "considerandos", label: "Considerandos", rows: 8, hint: "Texto formal previo al certificado. Se reformatea con saltos de párrafo dobles." },
  { key: "certificacion", label: "Certificación", rows: 6, hint: "Declaración del jurado/terna sobre transparencia y conflicto de interés." },
  { key: "tabla_titulo", label: "Título de la tabla", rows: 1, hint: "Encabezado que precede a la tabla de resultados." },
  { key: "tabla_subtitulo", label: "Subtítulo de la tabla", rows: 2, hint: "Texto en cursiva debajo del título de la tabla." },
  { key: "texto_cierre", label: "Texto de cierre", rows: 5, hint: "Texto posterior a la tabla. Suele incluir la fecha de firma." },
  { key: "pie_firmantes_titulo", label: "Encabezado del bloque de firmantes", rows: 1, hint: "Aparece antes del listado de firmas." },
];

export default function PlantillasActasPanel({ convId }) {
  const [data, setData] = useState(null);
  const [activeTipo, setActiveTipo] = useState("individual");
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);
  const [branding, setBranding] = useState({ header_image_url: null, footer_image_url: null });

  const load = async () => {
    if (!convId) return;
    try {
      const [tpl, br] = await Promise.all([
        api.get(`/convocatorias/${convId}/acta-templates`),
        api.get(`/convocatorias/${convId}/acta-branding`),
      ]);
      setData(tpl.data);
      setBranding(br.data || { header_image_url: null, footer_image_url: null });
      const t = tpl.data.templates[activeTipo] || {};
      setDraft({ ...t });
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Error al cargar plantillas");
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [convId]);
  useEffect(() => {
    if (data) {
      const t = data.templates[activeTipo] || {};
      setDraft({ ...t });
    }
  }, [activeTipo, data]);

  const save = async () => {
    setBusy(true);
    try {
      const payload = {};
      FIELDS.forEach((f) => { if (draft[f.key] !== undefined) payload[f.key] = draft[f.key]; });
      await api.patch(`/convocatorias/${convId}/acta-templates/${activeTipo}`, payload);
      toast.success("Plantilla guardada");
      await load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Error al guardar");
    } finally { setBusy(false); }
  };

  const toggleSubregional = async (val) => {
    try {
      await api.patch(`/convocatorias/${convId}/uso-acta-subregional`, { enabled: val });
      toast.success(val ? "Acta subregional habilitada" : "Acta subregional deshabilitada");
      await load();
    } catch (e) {
      toast.error("Error al cambiar configuración");
    }
  };

  const copyTag = (tag) => {
    navigator.clipboard.writeText(tag);
    toast.success(`${tag} copiado`);
  };

  const uploadBrandingImage = async (kind, file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Solo imágenes (PNG, JPG)"); return; }
    const fd = new FormData(); fd.append("file", file);
    try {
      const up = await api.post("/upload/image", fd, { headers: { "Content-Type": "multipart/form-data" } });
      const payload = { [kind]: up.data.data_url };
      const r = await api.patch(`/convocatorias/${convId}/acta-branding`, payload);
      setBranding(r.data.branding);
      toast.success(kind === "header_image_url" ? "Encabezado cargado" : "Pie de página cargado");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Error al subir imagen");
    }
  };

  const clearBrandingImage = async (kind) => {
    try {
      const r = await api.patch(`/convocatorias/${convId}/acta-branding`, { [kind]: null });
      setBranding(r.data.branding);
      toast.success("Imagen eliminada");
    } catch (e) {
      toast.error("Error al eliminar imagen");
    }
  };

  if (!data) return <div className="text-muted-foreground text-sm">Cargando plantillas…</div>;

  const isDefault = data.templates[activeTipo]?._is_default;
  const tipoConfig = TIPOS.find((t) => t.key === activeTipo);

  return (
    <div className="space-y-6">
      {/* BLOQUE: Identidad institucional (header/footer images) */}
      <div className="border border-[#CDE7E1] rounded-lg bg-gradient-to-br from-[#F0F7F5] to-white p-5">
        <div className="flex items-center gap-2 mb-1">
          <ImageIcon className="w-4 h-4 text-[#0F5E54]" />
          <div className="text-[10px] uppercase tracking-[0.18em] font-display font-bold text-[#0F5E54]">Identidad gráfica institucional</div>
        </div>
        <p className="text-[12px] text-[#1A1F2C] mb-4">
          Sube las imágenes <strong>encabezado</strong> (logo + cabezote institucional) y <strong>pie de página</strong> que aparecerán en TODAS las actas PDF de esta convocatoria. Formato recomendado: PNG horizontal · ancho 1700px aprox. Para INC2026, usa la imagen gráfica oficial de la Gobernación de Antioquia.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          <BrandingSlot
            label="Encabezado (header)"
            sublabel="Aparece en la parte superior de cada página"
            value={branding.header_image_url}
            onUpload={(f) => uploadBrandingImage("header_image_url", f)}
            onClear={() => clearBrandingImage("header_image_url")}
            testIdPrefix="acta-header"
          />
          <BrandingSlot
            label="Pie de página (footer)"
            sublabel="Aparece al final del acta, después de las firmas"
            value={branding.footer_image_url}
            onUpload={(f) => uploadBrandingImage("footer_image_url", f)}
            onClear={() => clearBrandingImage("footer_image_url")}
            testIdPrefix="acta-footer"
          />
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
      {/* Sidebar: tipos + merge tags */}
      <div className="lg:col-span-1 space-y-4">
        <div className="space-y-2">
          {TIPOS.map((t) => {
            const disabled = t.subregionOnly && !data.uso_acta_subregional;
            const Icon = t.icon;
            return (
              <div
                key={t.key}
                role="button"
                tabIndex={disabled ? -1 : 0}
                onClick={() => !disabled && setActiveTipo(t.key)}
                onKeyDown={(e) => { if (!disabled && (e.key === "Enter" || e.key === " ")) setActiveTipo(t.key); }}
                data-testid={`plantilla-tipo-${t.key}`}
                className={`w-full text-left p-3 rounded-lg border transition-all ${
                  activeTipo === t.key
                    ? "bg-[#F0F7F5] border-[#14776A] shadow-sm"
                    : disabled
                    ? "opacity-50 cursor-not-allowed bg-white border-border"
                    : "bg-white border-border hover:border-[#CDE7E1] cursor-pointer"
                }`}>
                <div className="flex items-center gap-2 mb-1">
                  <Icon className="w-4 h-4 text-[#14776A]" />
                  <span className="font-display font-bold text-[13px]">{t.label}</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">{t.desc}</p>
                {t.subregionOnly && (
                  <div className="mt-2 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <Switch checked={data.uso_acta_subregional} onCheckedChange={toggleSubregional} data-testid="toggle-uso-subregional" />
                    <span className="text-[10.5px] text-muted-foreground">
                      {data.uso_acta_subregional ? "Habilitada" : "Deshabilitada"}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Merge tags */}
        <div className="border border-border bg-white rounded-lg p-3">
          <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider font-display font-bold text-[#14776A] mb-2">
            <Sparkles className="w-3 h-3" /> Etiquetas dinámicas
          </div>
          <p className="text-[10.5px] text-muted-foreground mb-2">Inserta cualquiera en los textos. Se reemplazan al generar el PDF.</p>
          <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
            {data.merge_tags.map((m) => (
              <button key={m.tag} onClick={() => copyTag(m.tag)}
                className="w-full text-left flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-secondary group">
                <div className="min-w-0">
                  <div className="font-mono text-[11px] text-[#0F5E54] truncate">{m.tag}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{m.descripcion}</div>
                </div>
                <Copy className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Editor */}
      <div className="lg:col-span-2 space-y-3">
        {tipoConfig && (
          <div className="rounded-lg border border-[#CDE7E1] bg-gradient-to-br from-[#F0F7F5] to-white p-4 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-[10px] uppercase tracking-[0.16em] font-display font-bold text-[#0F5E54]">Editando plantilla</div>
              <div className="font-display font-bold text-lg">{tipoConfig.label}</div>
              {isDefault ? (
                <div className="inline-flex items-center gap-1.5 text-[11px] text-amber-700 mt-1">
                  <AlertCircle className="w-3 h-3" /> Usando texto por defecto. Tus cambios crearán una versión personalizada.
                </div>
              ) : (
                <div className="text-[11px] text-[#0F5E54] mt-1 font-semibold">Plantilla personalizada activa.</div>
              )}
            </div>
            <Button onClick={save} disabled={busy} className="bg-[#14776A] hover:bg-[#0F5E54] gap-2 rounded-sm" data-testid="plantilla-save-btn">
              <Save className="w-4 h-4" /> Guardar plantilla
            </Button>
          </div>
        )}

        {FIELDS.map((f) => (
          <div key={f.key} className="border border-border bg-white rounded-lg p-4">
            <Label className="text-[12px] font-semibold flex items-center gap-1.5">
              {f.label}
            </Label>
            <p className="text-[10.5px] text-muted-foreground mb-2">{f.hint}</p>
            {f.rows === 1 ? (
              <Input
                value={draft[f.key] || ""}
                onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                className="rounded-sm"
                data-testid={`plantilla-input-${f.key}`}
              />
            ) : (
              <Textarea
                rows={f.rows}
                value={draft[f.key] || ""}
                onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                className="rounded-sm font-mono text-[12px] leading-relaxed"
                data-testid={`plantilla-input-${f.key}`}
              />
            )}
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}

function BrandingSlot({ label, sublabel, value, onUpload, onClear, testIdPrefix }) {
  return (
    <div className="border border-border bg-white rounded-md p-3">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="text-[12px] font-semibold">{label}</div>
          <div className="text-[10.5px] text-muted-foreground">{sublabel}</div>
        </div>
        {value && (
          <button onClick={onClear} className="text-red-500 hover:text-red-700 text-[11px] inline-flex items-center gap-1" data-testid={`${testIdPrefix}-clear`}>
            <Trash2 className="w-3 h-3" /> Quitar
          </button>
        )}
      </div>
      {value ? (
        <div className="border border-border rounded-sm bg-[#FAFBFC] p-2">
          <img src={value} alt={label} className="w-full max-h-24 object-contain" data-testid={`${testIdPrefix}-img`} />
        </div>
      ) : (
        <label className="flex items-center justify-center gap-2 border-2 border-dashed border-[#CDE7E1] rounded-sm bg-[#F0F7F5]/30 hover:bg-[#F0F7F5] cursor-pointer py-6 text-[12px] text-[#0F5E54] font-semibold transition-colors" data-testid={`${testIdPrefix}-upload-label`}>
          <Upload className="w-4 h-4" /> Subir imagen
          <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => onUpload(e.target.files?.[0])} data-testid={`${testIdPrefix}-input`} />
        </label>
      )}
    </div>
  );
}
