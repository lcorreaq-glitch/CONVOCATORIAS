import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader, { Badge, EmptyState } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Workflow, Trash2 } from "lucide-react";

export default function Asignaciones() {
  const { activeConvocatoriaId } = useAuth();
  const [asignaciones, setAsignaciones] = useState([]);
  const [propuestas, setPropuestas] = useState([]);
  const [jurados, setJurados] = useState([]);
  const [ternas, setTernas] = useState([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ propuesta_id: "", jurado_id: "", terna_id: "", tipo_evaluacion: "individual" });

  const load = async () => {
    if (!activeConvocatoriaId) return;
    const [a, p, j, t] = await Promise.all([
      api.get(`/asignaciones?convocatoria_id=${activeConvocatoriaId}`),
      api.get(`/propuestas?convocatoria_id=${activeConvocatoriaId}`),
      api.get(`/jurados?convocatoria_id=${activeConvocatoriaId}`),
      api.get(`/ternas?convocatoria_id=${activeConvocatoriaId}`),
    ]);
    setAsignaciones(a.data); setPropuestas(p.data); setJurados(j.data); setTernas(t.data);
  };
  useEffect(() => { load(); }, [activeConvocatoriaId]);

  const submit = async () => {
    try {
      const payload = { ...f, convocatoria_id: activeConvocatoriaId };
      if (!payload.jurado_id) delete payload.jurado_id;
      if (!payload.terna_id) delete payload.terna_id;
      await api.post("/asignaciones", payload);
      toast.success("Asignación creada"); setOpen(false); load();
      setF({ propuesta_id: "", jurado_id: "", terna_id: "", tipo_evaluacion: "individual" });
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const cancelar = async (id) => {
    if (!confirm("¿Cancelar asignación?")) return;
    await api.delete(`/asignaciones/${id}`); load();
  };

  const propMap = Object.fromEntries(propuestas.map((p) => [p.id, p]));
  const jurMap = Object.fromEntries(jurados.map((j) => [j.id, j]));
  const ternaMap = Object.fromEntries(ternas.map((t) => [t.id, t]));

  if (!activeConvocatoriaId) return <div className="p-10 text-muted-foreground">Selecciona una convocatoria.</div>;

  return (
    <div className="flex-1 p-8 lg:p-10">
      <PageHeader
        eyebrow="Distribución"
        title="Asignaciones"
        subtitle="Relaciona propuestas con jurados (evaluación individual) o ternas (evaluación colectiva). Al asignar a un jurado individual, se crea automáticamente una evaluación en estado Borrador."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="bg-[#14776A] hover:bg-[#0F5E54] rounded-sm gap-2"><Plus className="w-4 h-4" />Nueva asignación</Button></DialogTrigger>
            <DialogContent className="rounded-sm max-w-lg">
              <DialogHeader><DialogTitle className="font-display">Nueva asignación</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold">Propuesta</label>
                  <Select value={f.propuesta_id} onValueChange={(v) => setF({ ...f, propuesta_id: v })}>
                    <SelectTrigger className="rounded-sm" data-testid="asig-propuesta"><SelectValue placeholder="Selecciona propuesta" /></SelectTrigger>
                    <SelectContent>{propuestas.map((p) => <SelectItem key={p.id} value={p.id}>{p.codigo} · {p.nombre}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-bold">Tipo de evaluación</label>
                  <Select value={f.tipo_evaluacion} onValueChange={(v) => setF({ ...f, tipo_evaluacion: v })}>
                    <SelectTrigger className="rounded-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="individual">Individual</SelectItem>
                      <SelectItem value="colectiva">Colectiva</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {f.tipo_evaluacion === "individual" && (
                  <div>
                    <label className="text-xs font-bold">Jurado</label>
                    <Select value={f.jurado_id} onValueChange={(v) => setF({ ...f, jurado_id: v })}>
                      <SelectTrigger className="rounded-sm" data-testid="asig-jurado"><SelectValue placeholder="Selecciona jurado" /></SelectTrigger>
                      <SelectContent>{jurados.map((j) => <SelectItem key={j.id} value={j.id}>{j.nombre}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
                {f.tipo_evaluacion === "colectiva" && (
                  <div>
                    <label className="text-xs font-bold">Terna</label>
                    <Select value={f.terna_id} onValueChange={(v) => setF({ ...f, terna_id: v })}>
                      <SelectTrigger className="rounded-sm"><SelectValue placeholder="Selecciona terna" /></SelectTrigger>
                      <SelectContent>{ternas.map((t) => <SelectItem key={t.id} value={t.id}>{t.codigo} · {t.nombre}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)} className="rounded-sm">Cancelar</Button>
                <Button onClick={submit} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-sm">Crear</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="border border-border rounded-sm bg-white overflow-x-auto">
        <table className="w-full dense-table">
          <thead><tr><th>Propuesta</th><th>Tipo</th><th>Jurado / Terna</th><th>Etapa</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {asignaciones.map((a) => {
              const p = propMap[a.propuesta_id];
              const target = a.jurado_id ? jurMap[a.jurado_id]?.nombre : ternaMap[a.terna_id]?.nombre;
              return (
                <tr key={a.id}>
                  <td><div className="font-mono text-xs text-muted-foreground">{p?.codigo}</div><div className="font-semibold">{p?.nombre}</div></td>
                  <td><Badge tone={a.tipo_evaluacion === "individual" ? "info" : "success"}>{a.tipo_evaluacion}</Badge></td>
                  <td>{target || "—"}</td>
                  <td className="text-xs text-muted-foreground">{a.etapa}</td>
                  <td><Badge tone="default">{a.estado}</Badge></td>
                  <td className="text-right">
                    {a.estado !== "Cancelada" && (
                      <button onClick={() => cancelar(a.id)} className="text-muted-foreground hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {!asignaciones.length && <tr><td colSpan={6}><EmptyState title="Sin asignaciones" hint="Asigna propuestas a jurados o ternas." icon={Workflow} /></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
