import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Save, FileText, Users, Map, Copy, AlertCircle, Sparkles } from "lucide-react";

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

  const load = async () => {
    if (!convId) return;
    try {
      const r = await api.get(`/convocatorias/${convId}/acta-templates`);
      setData(r.data);
      const t = r.data.templates[activeTipo] || {};
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

  if (!data) return <div className="text-muted-foreground text-sm">Cargando plantillas…</div>;

  const isDefault = data.templates[activeTipo]?._is_default;
  const tipoConfig = TIPOS.find((t) => t.key === activeTipo);

  return (
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
  );
}
