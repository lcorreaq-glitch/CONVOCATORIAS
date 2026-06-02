import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader, { Badge } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Sparkles, Loader2, UserCog, Upload, Image as ImageIcon, FileText, ExternalLink, Trash2 } from "lucide-react";

/**
 * MiPerfil: vista para el rol Jurado.
 * Permite editar campos seguros (telefono, perfil), subir foto y hoja de vida.
 * Datos críticos (email, nombre, subregiones) están solo lectura — los administra el admin.
 */
export default function MiPerfil() {
  const { user } = useAuth();
  const [jurado, setJurado] = useState(null);
  const [form, setForm] = useState({ telefono: "", perfil: "", foto_url: "", datos: {} });
  const [busy, setBusy] = useState(false);
  const [improving, setImproving] = useState(false);
  const [campos, setCampos] = useState([]);

  useEffect(() => {
    api.get("/jurados/me").then(async (r) => {
      const j = r.data;
      setJurado(j);
      setForm({
        telefono: j.telefono || "", perfil: j.perfil || "",
        foto_url: j.foto_url || "", datos: j.datos || {},
      });
      if (j.convocatoria_id) {
        const cr = await api.get(`/campos?convocatoria_id=${j.convocatoria_id}&aplica_a=jurado`);
        setCampos(cr.data);
      }
    }).catch((e) => toast.error("No se pudo cargar tu perfil"));
  }, []);

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
      setForm((f) => ({ ...f, foto_url: data.data_url }));
      toast.success("Foto cargada");
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail) || "Error al subir foto"); }
  };

  const onPickHV = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData(); fd.append("file", file);
    try {
      const { data } = await api.post("/upload/file", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setForm((f) => ({ ...f, datos: { ...f.datos, hoja_vida: { url: data.data_url, name: data.filename, size: data.size } } }));
      toast.success(`Hoja de vida "${data.filename}" cargada`);
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail) || "Error"); }
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
        {/* Sidebar foto + datos básicos solo lectura */}
        <div className="lg:col-span-1 space-y-4">
          <div className="rounded-xl border border-border bg-white p-5 text-center">
            <div className="w-32 h-32 rounded-full overflow-hidden mx-auto bg-secondary border-2 border-[#CDE7E1] mb-3">
              {form.foto_url ? <img src={form.foto_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full grid place-items-center"><UserCog className="w-12 h-12 text-muted-foreground" /></div>}
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
        </div>

        {/* Datos editables */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl border border-border bg-white p-5">
            <h3 className="font-display font-bold text-[15px] mb-3">Datos de contacto</h3>
            <div>
              <Label className="text-xs">Teléfono</Label>
              <Input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} className="rounded-lg" data-testid="mi-perfil-telefono" />
            </div>
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
            <h3 className="font-display font-bold text-[15px] mb-3 flex items-center gap-2"><FileText className="w-4 h-4" />Hoja de vida</h3>
            {form.datos.hoja_vida?.url ? (
              <div className="flex items-center gap-2 border border-border rounded-lg p-2 bg-secondary/30">
                <FileText className="w-4 h-4 text-[#14776A]" />
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-semibold truncate">{form.datos.hoja_vida.name}</div>
                  <div className="text-[10.5px] text-muted-foreground">{((form.datos.hoja_vida.size || 0) / 1024).toFixed(1)} KB</div>
                </div>
                <a href={form.datos.hoja_vida.url} target="_blank" rel="noreferrer" download={form.datos.hoja_vida.name} className="text-[#14776A] hover:underline text-xs inline-flex items-center gap-1"><ExternalLink className="w-3 h-3" />ver</a>
                <button onClick={() => setForm({ ...form, datos: { ...form.datos, hoja_vida: null } })} className="text-muted-foreground hover:text-red-500 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ) : (
              <label className="flex items-center justify-center gap-2 border-2 border-dashed border-border rounded-lg p-4 hover:border-[#14776A] cursor-pointer" data-testid="mi-perfil-hv-upload">
                <Upload className="w-4 h-4 text-muted-foreground" />
                <span className="text-[12.5px] text-muted-foreground">Subir hoja de vida (PDF, DOCX, JPG)</span>
                <input type="file" className="hidden" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" onChange={onPickHV} />
              </label>
            )}
          </div>

          <div className="flex justify-end">
            <Button onClick={submit} disabled={busy} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-lg" data-testid="mi-perfil-save">
              {busy ? "Guardando…" : "Guardar cambios"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
