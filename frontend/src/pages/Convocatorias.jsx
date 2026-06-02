import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import PageHeader, { Badge, estadoTone } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, FolderOpen, Pencil, Trash2, Sparkles, FileText, Layers } from "lucide-react";
import { TID } from "@/constants/testIds";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";
import PlantillaWizard from "./configuracion/PlantillaWizard";

export default function Convocatorias() {
  const { setConv, user } = useAuth();
  const [items, setItems] = useState([]);
  const [step, setStep] = useState(0); // 0=closed 1=choose mode 2=form
  const [chosenTemplateId, setChosenTemplateId] = useState(null); // si quiere clonar
  const [form, setForm] = useState({ codigo: "", nombre: "", descripcion: "", vigencia: "", tipo: "" });
  const [created, setCreated] = useState(null); // convocatoria recién creada
  const [wizardOpenForConv, setWizardOpenForConv] = useState(null); // {convId, convNombre} para abrir wizard sobre una existente

  const load = () => api.get("/convocatorias").then((r) => setItems(r.data));
  useEffect(() => { load(); }, []);

  const startNew = () => {
    setStep(1);
    setChosenTemplateId(null);
    setForm({ codigo: "", nombre: "", descripcion: "", vigencia: "", tipo: "" });
    setCreated(null);
  };

  const onCreate = async () => {
    try {
      const r = await api.post("/convocatorias", { ...form, estado: "Borrador" });
      toast.success(`Convocatoria ${r.data.codigo} creada`);
      setCreated(r.data);
      load();
      if (chosenTemplateId) {
        // El wizard de plantilla se abrirá automáticamente con la convocatoria recién creada y preselectedSourceId
        setStep(3);
      } else {
        setStep(0);
        setForm({ codigo: "", nombre: "", descripcion: "", vigencia: "", tipo: "" });
      }
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  const onDelete = async (c) => {
    const yes = confirm(`¿Eliminar la convocatoria "${c.nombre}"?\n\nEsta acción puede afectar propuestas, jurados y configuración asociada. Se cancelará si existen evaluaciones registradas.`);
    if (!yes) return;
    try {
      const r = await api.delete(`/convocatorias/${c.id}`);
      if (r.data.blocked) {
        const det = Object.entries(r.data.bloqueos || {}).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(" · ");
        toast.error(`No se puede eliminar: ${r.data.reason}\nBloqueos → ${det}\nSugerencia: ${r.data.sugerencia}`, { duration: 10000 });
        return;
      }
      toast.success(`Convocatoria ${c.codigo} eliminada`);
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const canCreate = user?.role === "admin_general" || user?.role === "admin_convocatoria";

  return (
    <div className="flex-1 p-8 lg:p-10">
      <PageHeader
        eyebrow="Catálogo de procesos"
        title="Convocatorias"
        subtitle="Gestiona y configura todos los procesos de selección, evaluación y reconocimiento. Cada convocatoria opera de manera independiente con sus propios campos, jurados y criterios."
        actions={canCreate && (
          <Button onClick={startNew} data-testid={TID.createBtn} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-sm gap-2">
            <Plus className="w-4 h-4" /> Nueva convocatoria
          </Button>
        )}
      />

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {items.map((c) => (
          <div
            key={c.id}
            data-testid={`conv-card-${c.codigo}`}
            className="border border-border rounded-sm bg-white p-5 hover:border-[#CDE7E1] transition-colors group flex flex-col"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="font-mono text-[11px] text-muted-foreground">{c.codigo}</div>
              <Badge tone={estadoTone(c.estado)}>{c.estado}</Badge>
            </div>
            <div className="font-display font-bold text-lg leading-tight">{c.nombre}</div>
            <p className="text-xs text-muted-foreground mt-2 line-clamp-2 flex-1">{c.descripcion}</p>
            <div className="mt-4 pt-3 border-t border-border flex items-center gap-3 text-[11px] text-muted-foreground">
              <span>Vigencia <strong className="text-foreground">{c.vigencia}</strong></span>
              <span className="w-px h-3 bg-border" />
              <span>Etapa <strong className="text-foreground">{c.etapa_actual || "—"}</strong></span>
            </div>
            <div className="mt-4 flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" className="rounded-lg gap-2 flex-1" onClick={() => setConv(c.id)} data-testid={`conv-activate-${c.codigo}`}>
                Activar como contexto
              </Button>
              {canCreate && (
                <Link to={`/convocatorias/${c.id}`} data-testid={`conv-edit-${c.codigo}`}>
                  <Button size="sm" className="bg-[#14776A] hover:bg-[#0F5E54] rounded-lg gap-2">
                    <Pencil className="w-3.5 h-3.5" /> Editar
                  </Button>
                </Link>
              )}
              {user?.role === "admin_general" && (
                <Button size="sm" variant="outline" className="rounded-lg text-[#B42318] hover:bg-red-50" onClick={() => onDelete(c)} data-testid={`conv-delete-${c.codigo}`}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
            {canCreate && items.length > 1 && (
              <button
                onClick={() => setWizardOpenForConv({ convId: c.id, convNombre: c.nombre })}
                className="mt-2 text-[11px] text-[#14776A] hover:underline flex items-center gap-1 font-semibold"
                data-testid={`conv-template-${c.codigo}`}
                title="Copiar la estructura de OTRA convocatoria hacia ésta"
              >
                <Sparkles className="w-3 h-3" /> Usar otra como plantilla para esta
              </button>
            )}
          </div>
        ))}
        {!items.length && (
          <div className="col-span-full border border-dashed border-border rounded-sm bg-white py-14 px-6 text-center">
            <FolderOpen className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
            <div className="font-display font-bold">Sin convocatorias</div>
            <p className="text-sm text-muted-foreground">Crea la primera convocatoria para comenzar.</p>
          </div>
        )}
      </div>

      {/* === ASISTENTE NUEVA CONVOCATORIA === */}
      <Dialog open={step === 1 || step === 2} onOpenChange={(v) => { if (!v) setStep(0); }}>
        <DialogContent className="rounded-lg max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">{step === 1 ? "Nueva convocatoria — ¿cómo quieres empezar?" : "Datos básicos"}</DialogTitle>
          </DialogHeader>

          {step === 1 && (
            <div className="grid sm:grid-cols-2 gap-3 py-2">
              <button
                onClick={() => { setChosenTemplateId(null); setStep(2); }}
                className="border-2 border-border hover:border-[#14776A] rounded-xl p-5 text-left transition-colors group"
                data-testid="start-blank"
              >
                <div className="w-10 h-10 rounded-lg bg-secondary grid place-items-center mb-3 group-hover:bg-[#F0F7F5]">
                  <FileText className="w-5 h-5 text-[#5E6878]" />
                </div>
                <div className="font-display font-bold text-[15px]">En blanco</div>
                <p className="text-[12px] text-muted-foreground mt-1 leading-snug">
                  Empieza desde cero y configura cada campo, catálogo y criterio paso a paso.
                </p>
              </button>
              <button
                onClick={() => setStep("choose-template")}
                disabled={items.length === 0}
                className="border-2 border-border hover:border-[#14776A] rounded-xl p-5 text-left transition-colors group disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="start-from-template"
              >
                <div className="w-10 h-10 rounded-lg bg-[#F0F7F5] grid place-items-center mb-3 group-hover:bg-[#CDE7E1]">
                  <Layers className="w-5 h-5 text-[#14776A]" />
                </div>
                <div className="font-display font-bold text-[15px]">Desde una plantilla</div>
                <p className="text-[12px] text-muted-foreground mt-1 leading-snug">
                  Copia la estructura de una convocatoria existente y solo ajusta lo necesario. Mucho más rápido.
                </p>
                {items.length === 0 && <p className="text-[10.5px] text-muted-foreground mt-2 italic">No hay convocatorias previas para usar como plantilla.</p>}
              </button>
            </div>
          )}

          {step === "choose-template" && (
            <div className="space-y-2 max-h-[400px] overflow-auto pr-1">
              <p className="text-[12.5px] text-muted-foreground">Selecciona la convocatoria que vas a usar como plantilla:</p>
              {items.map((c) => (
                <button
                  key={c.id}
                  onClick={() => { setChosenTemplateId(c.id); setStep(2); }}
                  className="w-full text-left border border-border hover:border-[#14776A] rounded-xl p-3 transition-colors"
                  data-testid={`template-choice-${c.codigo}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge tone="muted">{c.codigo}</Badge>
                        <span className="font-semibold text-[13.5px]">{c.nombre}</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-1">{c.estado} · {c.etapa_actual || "—"}</div>
                    </div>
                    <Sparkles className="w-4 h-4 text-[#14776A]" />
                  </div>
                </button>
              ))}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              {chosenTemplateId && (
                <div className="rounded-lg bg-[#F0F7F5] border border-[#CDE7E1] p-2 text-[12px] flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-[#14776A]" />
                  Usará como plantilla: <strong>{items.find((x) => x.id === chosenTemplateId)?.nombre}</strong>
                  <button className="ml-auto text-[#14776A] underline" onClick={() => setStep("choose-template")}>cambiar</button>
                </div>
              )}
              <div><Label>Código</Label><Input data-testid="conv-codigo" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} placeholder="INC2027" className="rounded-sm" /></div>
              <div><Label>Nombre</Label><Input data-testid="conv-nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="rounded-sm" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Vigencia</Label><Input value={form.vigencia} onChange={(e) => setForm({ ...form, vigencia: e.target.value })} placeholder="2027" className="rounded-sm" /></div>
                <div><Label>Tipo</Label><Input value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} placeholder="Estímulo" className="rounded-sm" /></div>
              </div>
              <div><Label>Descripción</Label><Textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} rows={3} className="rounded-sm" /></div>
            </div>
          )}

          <DialogFooter>
            {step === 1 && <Button variant="outline" onClick={() => setStep(0)} className="rounded-lg">Cancelar</Button>}
            {step === "choose-template" && (
              <>
                <Button variant="outline" onClick={() => setStep(1)} className="rounded-lg">Volver</Button>
              </>
            )}
            {step === 2 && (
              <>
                <Button variant="outline" onClick={() => setStep(chosenTemplateId ? "choose-template" : 1)} className="rounded-lg">Volver</Button>
                <Button data-testid={TID.saveBtn} onClick={onCreate} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-lg">
                  {chosenTemplateId ? "Crear y abrir plantilla" : "Crear"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Wizard de plantilla — se abre tras crear con plantilla o al hacer click en "Usar otra como plantilla" en una card */}
      {step === 3 && created && chosenTemplateId && (
        <PlantillaWizard
          open={true}
          onOpenChange={(v) => { if (!v) { setStep(0); setCreated(null); setChosenTemplateId(null); load(); } }}
          targetConvId={created.id}
          targetConvNombre={created.nombre}
          preselectedSourceId={chosenTemplateId}
          onDone={load}
        />
      )}
      {wizardOpenForConv && (
        <PlantillaWizard
          open={true}
          onOpenChange={(v) => { if (!v) setWizardOpenForConv(null); }}
          targetConvId={wizardOpenForConv.convId}
          targetConvNombre={wizardOpenForConv.convNombre}
          onDone={load}
        />
      )}
    </div>
  );
}
