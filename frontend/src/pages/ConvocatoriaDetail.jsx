import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import PageHeader, { Badge, estadoTone } from "@/components/PageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Save, Plus, Trash2, Building2, Calendar, Settings2, FileText, Star } from "lucide-react";

const ESTADOS = ["Borrador", "Configurada", "Activa", "Suspendida", "Finalizada", "Anulada"];
const ETAPAS = ["Configuración", "Cargue de Propuestas", "Habilitación Documental",
  "Asignación de Evaluadores", "Evaluación Individual", "Evaluación Colectiva",
  "Consolidación", "Ranking y Desempates", "Publicación de Resultados", "Cierre"];
const TIPOS_ENT = ["Entidad Pública", "Entidad Pública Departamental", "Entidad Pública Municipal",
  "ONG", "Fundación", "Universidad", "Empresa Privada", "Cámara de Comercio", "Organismo Internacional"];

export default function ConvocatoriaDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [conv, setConv] = useState(null);
  const [f, setF] = useState(null);

  const load = () => api.get(`/convocatorias/${id}`).then((r) => { setConv(r.data); setF(JSON.parse(JSON.stringify(r.data))); });
  useEffect(() => { load(); }, [id]);

  const save = async () => {
    try {
      const body = { ...f };
      delete body.id; delete body.codigo;
      await api.patch(`/convocatorias/${id}`, body);
      toast.success("Convocatoria actualizada");
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  if (!f) return <div className="p-10 text-sm text-[#5E6878]">Cargando…</div>;

  // ===== Entidad helpers =====
  const updateEnt = (idx, key, value) => {
    const arr = [...(f.entidades || [])];
    arr[idx] = { ...arr[idx], [key]: value };
    setF({ ...f, entidades: arr });
  };
  const addEnt = () => {
    setF({ ...f, entidades: [...(f.entidades || []), {
      id: crypto.randomUUID(), nombre: "", tipo: "Entidad Pública",
      rol: "", nit: "", representante: "", cargo: "", correo: "",
      telefono: "", direccion: "", logo_url: "", pagina_web: "",
      texto_institucional: "", principal: !(f.entidades || []).length,
    }]});
  };
  const removeEnt = (idx) => {
    const arr = [...(f.entidades || [])]; arr.splice(idx, 1);
    setF({ ...f, entidades: arr });
  };
  const setPrincipal = (idx) => {
    const arr = (f.entidades || []).map((e, i) => ({ ...e, principal: i === idx }));
    setF({ ...f, entidades: arr });
  };

  const setFecha = (k, v) => setF({ ...f, fechas: { ...(f.fechas || {}), [k]: v } });
  const toggleEtapa = (et) => {
    const list = f.etapas_habilitadas || [];
    setF({ ...f, etapas_habilitadas: list.includes(et) ? list.filter((e) => e !== et) : [...list, et] });
  };

  return (
    <div className="flex-1 p-8 lg:p-10">
      <Link to="/convocatorias" className="inline-flex items-center text-sm text-[#5E6878] hover:text-[#1A1F2C] mb-3"><ArrowLeft className="w-4 h-4 mr-1" />Volver al listado</Link>
      <PageHeader
        eyebrow="Detalle y edición"
        title={f.nombre || "Convocatoria"}
        subtitle={`Código ${f.codigo} · Vigencia ${f.vigencia || "—"}`}
        actions={
          <>
            <Badge tone={estadoTone(f.estado)}>{f.estado}</Badge>
            <Button onClick={save} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-lg gap-2" data-testid="conv-save-btn"><Save className="w-4 h-4" />Guardar cambios</Button>
          </>
        }
      />

      <Tabs defaultValue="general">
        <TabsList className="rounded-lg bg-[#F1F4F7] p-1 mb-5">
          <TabsTrigger value="general" className="rounded-md gap-2" data-testid="conv-tab-general"><FileText className="w-4 h-4" />General</TabsTrigger>
          <TabsTrigger value="entidades" className="rounded-md gap-2" data-testid="conv-tab-entidades"><Building2 className="w-4 h-4" />Entidades ({(f.entidades || []).length})</TabsTrigger>
          <TabsTrigger value="fechas" className="rounded-md gap-2" data-testid="conv-tab-fechas"><Calendar className="w-4 h-4" />Etapas y Fechas</TabsTrigger>
          <TabsTrigger value="config" className="rounded-md gap-2" data-testid="conv-tab-config"><Settings2 className="w-4 h-4" />Configuración avanzada</TabsTrigger>
        </TabsList>

        {/* GENERAL */}
        <TabsContent value="general">
          <div className="border border-[#E2E7EC] rounded-xl bg-white p-6 shadow-card space-y-4 max-w-3xl">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-semibold">Código <span className="text-[#5E6878]">(no editable)</span></Label>
                <Input disabled value={f.codigo} className="rounded-lg font-mono bg-[#F7F9FB]" />
              </div>
              <div>
                <Label className="text-xs font-semibold">Vigencia</Label>
                <Input value={f.vigencia || ""} onChange={(e) => setF({ ...f, vigencia: e.target.value })} className="rounded-lg" data-testid="conv-vigencia" />
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold">Nombre de la convocatoria</Label>
              <Input value={f.nombre || ""} onChange={(e) => setF({ ...f, nombre: e.target.value })} className="rounded-lg" data-testid="conv-nombre" />
            </div>
            <div>
              <Label className="text-xs font-semibold">Tipo</Label>
              <Input value={f.tipo || ""} onChange={(e) => setF({ ...f, tipo: e.target.value })} className="rounded-lg" placeholder="Convocatoria de iniciativas comunitarias" />
            </div>
            <div>
              <Label className="text-xs font-semibold">Descripción</Label>
              <Textarea rows={4} value={f.descripcion || ""} onChange={(e) => setF({ ...f, descripcion: e.target.value })} className="rounded-lg" data-testid="conv-descripcion" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-semibold">Estado</Label>
                <Select value={f.estado} onValueChange={(v) => setF({ ...f, estado: v })}>
                  <SelectTrigger className="rounded-lg" data-testid="conv-estado"><SelectValue /></SelectTrigger>
                  <SelectContent>{ESTADOS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-semibold">Etapa actual</Label>
                <Select value={f.etapa_actual} onValueChange={(v) => setF({ ...f, etapa_actual: v })}>
                  <SelectTrigger className="rounded-lg" data-testid="conv-etapa"><SelectValue /></SelectTrigger>
                  <SelectContent>{ETAPAS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ENTIDADES */}
        <TabsContent value="entidades">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-[#5E6878]">Registre una o varias entidades asociadas (convocante, operadora, aliada, supervisora, financiadora). Marque cuál aparecerá como <strong>principal</strong> en encabezados de actas y documentos.</p>
            <Button onClick={addEnt} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-lg gap-2" data-testid="conv-add-entidad"><Plus className="w-4 h-4" />Agregar entidad</Button>
          </div>
          <div className="space-y-4">
            {(f.entidades || []).map((e, idx) => (
              <div key={e.id || idx} className={`border rounded-xl bg-white p-5 shadow-card ${e.principal ? "border-[#14776A] ring-1 ring-[#14776A]/20" : "border-[#E2E7EC]"}`}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <Building2 className="w-5 h-5 text-[#14776A]" />
                    <h4 className="font-display font-bold text-[15px]">Entidad {idx + 1}</h4>
                    {e.principal && <Badge tone="success">principal</Badge>}
                  </div>
                  <div className="flex items-center gap-2">
                    {!e.principal && (
                      <Button size="sm" variant="outline" className="rounded-lg gap-1.5" onClick={() => setPrincipal(idx)} data-testid={`conv-ent-set-principal-${idx}`}>
                        <Star className="w-3.5 h-3.5" /> Marcar como principal
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="rounded-lg text-[#B42318] hover:bg-red-50" onClick={() => removeEnt(idx)} data-testid={`conv-ent-remove-${idx}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2"><Label className="text-xs font-semibold">Nombre de la entidad</Label>
                    <Input value={e.nombre || ""} onChange={(ev) => updateEnt(idx, "nombre", ev.target.value)} className="rounded-lg" data-testid={`conv-ent-nombre-${idx}`} /></div>
                  <div><Label className="text-xs font-semibold">Tipo</Label>
                    <Select value={e.tipo || ""} onValueChange={(v) => updateEnt(idx, "tipo", v)}>
                      <SelectTrigger className="rounded-lg"><SelectValue /></SelectTrigger>
                      <SelectContent>{TIPOS_ENT.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select></div>
                  <div className="col-span-2"><Label className="text-xs font-semibold">Rol en la convocatoria</Label>
                    <Input value={e.rol || ""} onChange={(ev) => updateEnt(idx, "rol", ev.target.value)} placeholder="Convocante / Operadora / Aliada / Supervisora / Financiadora" className="rounded-lg" data-testid={`conv-ent-rol-${idx}`} /></div>
                  <div><Label className="text-xs font-semibold">NIT</Label>
                    <Input value={e.nit || ""} onChange={(ev) => updateEnt(idx, "nit", ev.target.value)} className="rounded-lg font-mono" /></div>
                  <div><Label className="text-xs font-semibold">Representante / Responsable</Label>
                    <Input value={e.representante || ""} onChange={(ev) => updateEnt(idx, "representante", ev.target.value)} className="rounded-lg" /></div>
                  <div><Label className="text-xs font-semibold">Cargo</Label>
                    <Input value={e.cargo || ""} onChange={(ev) => updateEnt(idx, "cargo", ev.target.value)} className="rounded-lg" /></div>
                  <div><Label className="text-xs font-semibold">Correo de contacto</Label>
                    <Input value={e.correo || ""} onChange={(ev) => updateEnt(idx, "correo", ev.target.value)} className="rounded-lg" /></div>
                  <div><Label className="text-xs font-semibold">Teléfono</Label>
                    <Input value={e.telefono || ""} onChange={(ev) => updateEnt(idx, "telefono", ev.target.value)} className="rounded-lg" /></div>
                  <div><Label className="text-xs font-semibold">Página web</Label>
                    <Input value={e.pagina_web || ""} onChange={(ev) => updateEnt(idx, "pagina_web", ev.target.value)} placeholder="https://..." className="rounded-lg" /></div>
                  <div className="col-span-2"><Label className="text-xs font-semibold">Dirección</Label>
                    <Input value={e.direccion || ""} onChange={(ev) => updateEnt(idx, "direccion", ev.target.value)} className="rounded-lg" /></div>
                  <div><Label className="text-xs font-semibold">URL del logo</Label>
                    <Input value={e.logo_url || ""} onChange={(ev) => updateEnt(idx, "logo_url", ev.target.value)} placeholder="https://.../logo.png" className="rounded-lg font-mono text-[12px]" /></div>
                  <div className="col-span-3"><Label className="text-xs font-semibold">Texto institucional para actas / comunicaciones</Label>
                    <Textarea rows={2} value={e.texto_institucional || ""} onChange={(ev) => updateEnt(idx, "texto_institucional", ev.target.value)} className="rounded-lg" /></div>
                </div>
                {e.logo_url && (
                  <div className="mt-3 pt-3 border-t border-[#E2E7EC] flex items-center gap-3">
                    <span className="text-[11px] uppercase tracking-wider font-bold text-[#5E6878]">Vista logo</span>
                    <img src={e.logo_url} alt={e.nombre} className="h-8 object-contain" onError={(ev) => { ev.target.style.display = "none"; }} />
                  </div>
                )}
              </div>
            ))}
            {!(f.entidades || []).length && (
              <div className="border border-dashed border-[#E2E7EC] rounded-xl bg-white py-12 text-center">
                <Building2 className="w-9 h-9 mx-auto text-[#9CA3AF] stroke-[1.4] mb-2" />
                <div className="font-display font-bold text-[15px]">Sin entidades</div>
                <p className="text-[13px] text-[#5E6878] mt-1">Agrega la entidad convocante para iniciar.</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* FECHAS */}
        <TabsContent value="fechas">
          <div className="grid lg:grid-cols-2 gap-6 max-w-5xl">
            <div className="border border-[#E2E7EC] rounded-xl bg-white p-5 shadow-card">
              <h4 className="font-display font-bold text-[15px] mb-3">Etapas habilitadas</h4>
              <p className="text-[12.5px] text-[#5E6878] mb-4">Activa las etapas que se utilizarán en esta convocatoria.</p>
              <div className="space-y-1.5">
                {ETAPAS.map((et) => (
                  <label key={et} className="flex items-center gap-2.5 p-2.5 rounded-lg hover:bg-[#F7F9FB] cursor-pointer">
                    <Switch checked={(f.etapas_habilitadas || []).includes(et)} onCheckedChange={() => toggleEtapa(et)} />
                    <span className="text-[13.5px]">{et}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="border border-[#E2E7EC] rounded-xl bg-white p-5 shadow-card">
              <h4 className="font-display font-bold text-[15px] mb-3">Fechas clave</h4>
              <div className="grid grid-cols-1 gap-3">
                {[
                  ["apertura_propuestas", "Apertura recepción propuestas"],
                  ["cierre_propuestas", "Cierre recepción propuestas"],
                  ["apertura_evaluacion_individual", "Apertura evaluación individual"],
                  ["cierre_evaluacion_individual", "Cierre evaluación individual"],
                  ["apertura_evaluacion_colectiva", "Apertura evaluación colectiva"],
                  ["cierre_evaluacion_colectiva", "Cierre evaluación colectiva"],
                  ["publicacion_resultados", "Publicación de resultados"],
                ].map(([k, label]) => (
                  <div key={k}>
                    <Label className="text-xs font-semibold">{label}</Label>
                    <Input type="date" value={(f.fechas || {})[k] || ""} onChange={(e) => setFecha(k, e.target.value)} className="rounded-lg" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* CONFIG AVANZADA */}
        <TabsContent value="config">
          <div className="border border-[#E2E7EC] rounded-xl bg-white p-5 shadow-card space-y-4 max-w-3xl">
            <div>
              <Label className="text-xs font-semibold">Modalidad de evaluación colectiva</Label>
              <Select value={f.modalidad_evaluacion_colectiva} onValueChange={(v) => setF({ ...f, modalidad_evaluacion_colectiva: v })}>
                <SelectTrigger className="rounded-lg"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="promedio_individuales">Promedio automático de evaluaciones individuales</SelectItem>
                  <SelectItem value="nueva_evaluacion">Nueva evaluación colectiva por la terna</SelectItem>
                  <SelectItem value="consenso">Puntaje único consensuado</SelectItem>
                  <SelectItem value="votacion">Votación</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold">Modelo de expediente documental</Label>
              <Select value={f.modelo_expediente} onValueChange={(v) => setF({ ...f, modelo_expediente: v })}>
                <SelectTrigger className="rounded-lg"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="interno">Interno (archivos en la plataforma)</SelectItem>
                  <SelectItem value="mixto">Mixto (parte en la plataforma, parte externa)</SelectItem>
                  <SelectItem value="externo">Externo (URL a repositorio externo)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
