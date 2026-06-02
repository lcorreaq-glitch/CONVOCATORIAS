import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader, { Badge, estadoTone, EmptyState } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, UsersRound, Wand2 } from "lucide-react";
import { TID } from "@/constants/testIds";

export default function Ternas() {
  const { activeConvocatoriaId } = useAuth();
  const [items, setItems] = useState([]);
  const [jurados, setJurados] = useState([]);
  const [catalogos, setCatalogos] = useState([]);
  const [open, setOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [activeTernaId, setActiveTernaId] = useState(null);
  const [selectedSubregion, setSelectedSubregion] = useState("");
  const [f, setF] = useState({ nombre: "", tipo: "Terna", integrantes: [], territorio: "" });

  const load = async () => {
    if (!activeConvocatoriaId) return;
    const [t, j, c] = await Promise.all([
      api.get(`/ternas?convocatoria_id=${activeConvocatoriaId}`),
      api.get(`/jurados?convocatoria_id=${activeConvocatoriaId}`),
      api.get(`/catalogos?convocatoria_id=${activeConvocatoriaId}`),
    ]);
    setItems(t.data); setJurados(j.data); setCatalogos(c.data);
  };
  useEffect(() => { load(); }, [activeConvocatoriaId]);

  const subregiones = catalogos.find((x) => x.nombre.toLowerCase().includes("subreg"))?.valores || [];

  const submit = async () => {
    try {
      await api.post("/ternas", { ...f, convocatoria_id: activeConvocatoriaId });
      toast.success("Terna creada"); setOpen(false); load();
      setF({ nombre: "", tipo: "Terna", integrantes: [], territorio: "" });
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const toggleIntegrante = (j) => {
    const ex = f.integrantes.find((x) => x.jurado_id === j.id);
    if (ex) setF({ ...f, integrantes: f.integrantes.filter((x) => x.jurado_id !== j.id) });
    else setF({ ...f, integrantes: [...f.integrantes, { jurado_id: j.id, nombre: j.nombre, rol: "Evaluador" }] });
  };

  const asignarSubregion = async () => {
    if (!activeTernaId || !selectedSubregion) return;
    try {
      const r = await api.post("/asignaciones/masiva-subregion", {
        convocatoria_id: activeConvocatoriaId, terna_id: activeTernaId, subregion: selectedSubregion,
      });
      toast.success(`${r.data.asignaciones_creadas} asignaciones creadas`);
      setAssignOpen(false);
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  if (!activeConvocatoriaId) return <div className="p-10 text-muted-foreground">Selecciona una convocatoria.</div>;

  return (
    <div className="flex-1 p-8 lg:p-10">
      <PageHeader
        eyebrow="Grupos de deliberación"
        title="Ternas / Grupos"
        subtitle="Agrupa jurados en ternas para evaluación colectiva. Asigna propuestas por subregión con un solo clic."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="bg-[#14776A] hover:bg-[#0F5E54] rounded-sm gap-2" data-testid={TID.createBtn}><Plus className="w-4 h-4" />Nueva terna</Button></DialogTrigger>
            <DialogContent className="rounded-sm max-w-xl">
              <DialogHeader><DialogTitle className="font-display">Nueva terna</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Nombre</Label><Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} className="rounded-sm" data-testid="terna-nombre" placeholder="Terna Urabá" /></div>
                  <div><Label>Territorio (subregión)</Label>
                    <Select value={f.territorio} onValueChange={(v) => setF({ ...f, territorio: v })}>
                      <SelectTrigger className="rounded-sm"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>{subregiones.map((s) => <SelectItem key={s.id} value={s.valor}>{s.valor}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="mb-2 block">Integrantes ({f.integrantes.length})</Label>
                  <div className="border border-border rounded-sm p-2 max-h-56 overflow-y-auto space-y-1">
                    {jurados.map((j) => {
                      const checked = !!f.integrantes.find((x) => x.jurado_id === j.id);
                      return (
                        <label key={j.id} className="flex items-center gap-2 p-1.5 hover:bg-secondary rounded-sm cursor-pointer text-sm">
                          <Checkbox checked={checked} onCheckedChange={() => toggleIntegrante(j)} />
                          <span>{j.nombre}</span>
                          <span className="text-xs text-muted-foreground ml-auto font-mono">{j.email}</span>
                        </label>
                      );
                    })}
                    {!jurados.length && <p className="text-xs text-muted-foreground p-2">Primero registra jurados.</p>}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)} className="rounded-sm">Cancelar</Button>
                <Button onClick={submit} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-sm" data-testid={TID.saveBtn}>Crear</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {items.map((t) => (
          <div key={t.id} className="border border-border rounded-sm bg-white p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="font-mono text-[11px] text-muted-foreground">{t.codigo}</div>
                <div className="font-display font-bold text-lg">{t.nombre}</div>
              </div>
              <Badge tone={estadoTone(t.estado)}>{t.estado}</Badge>
            </div>
            {t.territorio && <div className="text-xs mb-2"><span className="text-muted-foreground">Territorio:</span> <strong>{t.territorio}</strong></div>}
            <div className="text-xs text-muted-foreground mb-2">{t.integrantes?.length || 0} integrantes</div>
            <div className="space-y-1">
              {t.integrantes?.slice(0, 4).map((i) => (
                <div key={i.jurado_id} className="text-sm flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-[#14776A] rounded-full" /> {i.nombre}
                </div>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-border">
              <Button size="sm" variant="outline" className="rounded-sm gap-2 w-full" data-testid={`assign-subregion-${t.codigo}`} onClick={() => { setActiveTernaId(t.id); setAssignOpen(true); }}>
                <Wand2 className="w-3.5 h-3.5" /> Asignar por subregión
              </Button>
            </div>
          </div>
        ))}
        {!items.length && <div className="col-span-full"><EmptyState title="Sin ternas creadas" hint="Conforma equipos de evaluadores para el proceso colectivo." icon={UsersRound} /></div>}
      </div>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="rounded-sm max-w-md">
          <DialogHeader><DialogTitle className="font-display">Asignar propuestas por subregión</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Se crearán asignaciones individuales y colectivas para todas las propuestas habilitadas de la subregión.</p>
            <Select value={selectedSubregion} onValueChange={setSelectedSubregion}>
              <SelectTrigger className="rounded-sm"><SelectValue placeholder="Subregión…" /></SelectTrigger>
              <SelectContent>{subregiones.map((s) => <SelectItem key={s.id} value={s.valor}>{s.valor}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)} className="rounded-sm">Cancelar</Button>
            <Button onClick={asignarSubregion} disabled={!selectedSubregion} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-sm" data-testid="confirm-assign-subregion">Asignar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
