import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader, { Badge, EmptyState } from "@/components/PageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Settings2, Trash2 } from "lucide-react";

const CAMPO_TIPOS = [
  "texto_corto", "texto_largo", "numero", "moneda", "porcentaje", "fecha",
  "hora", "email", "telefono", "url", "lista", "seleccion_multiple", "si_no",
];

export default function Configuracion() {
  const { activeConvocatoriaId } = useAuth();
  const [campos, setCampos] = useState([]);
  const [catalogos, setCatalogos] = useState([]);
  const [criterios, setCriterios] = useState([]);
  const [desempates, setDesempates] = useState([]);

  const reload = async () => {
    if (!activeConvocatoriaId) return;
    const [a, b, c, d] = await Promise.all([
      api.get(`/campos?convocatoria_id=${activeConvocatoriaId}`),
      api.get(`/catalogos?convocatoria_id=${activeConvocatoriaId}`),
      api.get(`/criterios?convocatoria_id=${activeConvocatoriaId}`),
      api.get(`/desempates?convocatoria_id=${activeConvocatoriaId}`),
    ]);
    setCampos(a.data); setCatalogos(b.data); setCriterios(c.data); setDesempates(d.data);
  };
  useEffect(() => { reload(); }, [activeConvocatoriaId]);

  if (!activeConvocatoriaId)
    return <div className="p-10 text-muted-foreground">Selecciona una convocatoria.</div>;

  return (
    <div className="flex-1 p-8 lg:p-10">
      <PageHeader
        eyebrow="Estructura paramétrica"
        title="Configuración"
        subtitle="Define los campos de propuestas, catálogos institucionales, criterios de evaluación y reglas de desempate de la convocatoria seleccionada."
      />

      <Tabs defaultValue="campos">
        <TabsList className="rounded-sm bg-secondary p-1">
          <TabsTrigger value="campos" className="rounded-sm" data-testid="tab-campos">Campos ({campos.length})</TabsTrigger>
          <TabsTrigger value="catalogos" className="rounded-sm" data-testid="tab-catalogos">Catálogos ({catalogos.length})</TabsTrigger>
          <TabsTrigger value="criterios" className="rounded-sm" data-testid="tab-criterios">Criterios ({criterios.length})</TabsTrigger>
          <TabsTrigger value="desempates" className="rounded-sm" data-testid="tab-desempates">Desempates ({desempates.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="campos" className="mt-6">
          <CamposPanel campos={campos} convId={activeConvocatoriaId} reload={reload} catalogos={catalogos} />
        </TabsContent>
        <TabsContent value="catalogos" className="mt-6">
          <CatalogosPanel catalogos={catalogos} convId={activeConvocatoriaId} reload={reload} />
        </TabsContent>
        <TabsContent value="criterios" className="mt-6">
          <CriteriosPanel criterios={criterios} convId={activeConvocatoriaId} reload={reload} />
        </TabsContent>
        <TabsContent value="desempates" className="mt-6">
          <DesempatesPanel desempates={desempates} convId={activeConvocatoriaId} reload={reload} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CamposPanel({ campos, convId, reload, catalogos }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ nombre_visible: "", nombre_interno: "", tipo: "texto_corto", obligatorio: false, orden: 0, uso_filtro: false, uso_ranking: false, uso_desempate: false });
  const submit = async () => {
    try {
      await api.post("/campos", { ...f, convocatoria_id: convId });
      toast.success("Campo creado");
      setOpen(false); reload();
      setF({ nombre_visible: "", nombre_interno: "", tipo: "texto_corto", obligatorio: false, orden: 0, uso_filtro: false, uso_ranking: false, uso_desempate: false });
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  const del = async (id) => {
    if (!confirm("¿Eliminar campo?")) return;
    await api.delete(`/campos/${id}`); reload();
  };
  return (
    <div>
      <div className="flex justify-end mb-3">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#14776A] hover:bg-[#0F5E54] rounded-sm gap-2"><Plus className="w-4 h-4" />Nuevo campo</Button>
          </DialogTrigger>
          <DialogContent className="rounded-sm max-w-lg">
            <DialogHeader><DialogTitle className="font-display">Nuevo campo</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Nombre visible</Label><Input value={f.nombre_visible} onChange={(e) => setF({ ...f, nombre_visible: e.target.value })} className="rounded-sm" /></div>
                <div><Label>Nombre interno</Label><Input value={f.nombre_interno} onChange={(e) => setF({ ...f, nombre_interno: e.target.value.replace(/[^a-z0-9_]/gi, "_").toLowerCase() })} className="rounded-sm font-mono" /></div>
              </div>
              <div><Label>Tipo</Label>
                <Select value={f.tipo} onValueChange={(v) => setF({ ...f, tipo: v })}>
                  <SelectTrigger className="rounded-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{CAMPO_TIPOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center justify-between border border-border rounded-sm p-2"><Label className="text-xs">Obligatorio</Label><Switch checked={f.obligatorio} onCheckedChange={(v) => setF({ ...f, obligatorio: v })} /></div>
                <div className="flex items-center justify-between border border-border rounded-sm p-2"><Label className="text-xs">Filtrable</Label><Switch checked={f.uso_filtro} onCheckedChange={(v) => setF({ ...f, uso_filtro: v })} /></div>
                <div className="flex items-center justify-between border border-border rounded-sm p-2"><Label className="text-xs">Uso ranking</Label><Switch checked={f.uso_ranking} onCheckedChange={(v) => setF({ ...f, uso_ranking: v })} /></div>
                <div className="flex items-center justify-between border border-border rounded-sm p-2"><Label className="text-xs">Desempate</Label><Switch checked={f.uso_desempate} onCheckedChange={(v) => setF({ ...f, uso_desempate: v })} /></div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} className="rounded-sm">Cancelar</Button>
              <Button onClick={submit} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-sm">Crear</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <div className="border border-border rounded-sm bg-white overflow-hidden">
        <table className="w-full dense-table">
          <thead><tr><th>#</th><th>Nombre</th><th>Interno</th><th>Tipo</th><th>Flags</th><th></th></tr></thead>
          <tbody>
            {campos.map((c, i) => (
              <tr key={c.id}>
                <td className="font-mono text-muted-foreground">{i + 1}</td>
                <td className="font-semibold">{c.nombre_visible}</td>
                <td className="font-mono text-xs">{c.nombre_interno}</td>
                <td><Badge tone="muted">{c.tipo}</Badge></td>
                <td>
                  <div className="flex gap-1 flex-wrap">
                    {c.obligatorio && <Badge tone="info">obligatorio</Badge>}
                    {c.uso_filtro && <Badge tone="default">filtrable</Badge>}
                    {c.uso_ranking && <Badge tone="success">ranking</Badge>}
                    {c.uso_desempate && <Badge tone="warning">desempate</Badge>}
                  </div>
                </td>
                <td className="text-right">
                  <button data-testid={`del-campo-${c.nombre_interno}`} onClick={() => del(c.id)} className="text-muted-foreground hover:text-red-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
            {!campos.length && <tr><td colSpan={6}><EmptyState title="Sin campos configurados" hint="Crea los campos que tendrá cada propuesta." icon={Settings2} /></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CatalogosPanel({ catalogos, convId, reload }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ nombre: "", descripcion: "", valores: "" });
  const submit = async () => {
    try {
      const valores = f.valores.split("\n").map((v) => v.trim()).filter(Boolean).map((v) => ({ valor: v, activo: true }));
      await api.post("/catalogos", { convocatoria_id: convId, nombre: f.nombre, descripcion: f.descripcion, activo: true, valores });
      toast.success("Catálogo creado");
      setOpen(false); reload(); setF({ nombre: "", descripcion: "", valores: "" });
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  return (
    <div>
      <div className="flex justify-end mb-3">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="bg-[#14776A] hover:bg-[#0F5E54] rounded-sm gap-2"><Plus className="w-4 h-4" />Nuevo catálogo</Button></DialogTrigger>
          <DialogContent className="rounded-sm max-w-lg">
            <DialogHeader><DialogTitle className="font-display">Nuevo catálogo</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Nombre</Label><Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} className="rounded-sm" /></div>
              <div><Label>Descripción</Label><Input value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} className="rounded-sm" /></div>
              <div>
                <Label>Valores (uno por línea)</Label>
                <textarea value={f.valores} onChange={(e) => setF({ ...f, valores: e.target.value })} rows={6} className="w-full border border-border rounded-sm px-3 py-2 text-sm font-mono" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} className="rounded-sm">Cancelar</Button>
              <Button onClick={submit} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-sm">Crear</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {catalogos.map((c) => (
          <div key={c.id} className="border border-border rounded-sm bg-white p-4">
            <div className="flex items-center justify-between">
              <div className="font-display font-bold">{c.nombre}</div>
              <Badge tone={c.activo ? "success" : "muted"}>{c.activo ? "activo" : "inactivo"}</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{c.descripcion}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {c.valores.slice(0, 10).map((v) => <Badge key={v.id} tone="muted">{v.valor}</Badge>)}
              {c.valores.length > 10 && <Badge tone="default">+{c.valores.length - 10}</Badge>}
            </div>
          </div>
        ))}
        {!catalogos.length && <div className="col-span-full"><EmptyState title="Sin catálogos" hint="Crea listas reutilizables." /></div>}
      </div>
    </div>
  );
}

function CriteriosPanel({ criterios, convId, reload }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ nombre: "", descripcion: "", puntaje_min: 0, puntaje_max: 10, ponderacion: 10, oficial: true, diferencial: false, orden: 0 });
  const submit = async () => {
    try {
      await api.post("/criterios", { ...f, convocatoria_id: convId });
      toast.success("Criterio creado");
      setOpen(false); reload();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  const del = async (id) => { if (!confirm("¿Eliminar criterio?")) return; await api.delete(`/criterios/${id}`); reload(); };

  const totalOficial = criterios.filter((c) => c.oficial).reduce((s, c) => s + (c.puntaje_max || 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm text-muted-foreground">
          Puntaje oficial máximo: <strong className="text-foreground tabular-nums">{totalOficial}</strong>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="bg-[#14776A] hover:bg-[#0F5E54] rounded-sm gap-2"><Plus className="w-4 h-4" />Nuevo criterio</Button></DialogTrigger>
          <DialogContent className="rounded-sm max-w-lg">
            <DialogHeader><DialogTitle className="font-display">Nuevo criterio</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Nombre</Label><Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} className="rounded-sm" /></div>
              <div><Label>Descripción</Label><Input value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} className="rounded-sm" /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Mín</Label><Input type="number" value={f.puntaje_min} onChange={(e) => setF({ ...f, puntaje_min: +e.target.value })} className="rounded-sm" /></div>
                <div><Label>Máx</Label><Input type="number" value={f.puntaje_max} onChange={(e) => setF({ ...f, puntaje_max: +e.target.value })} className="rounded-sm" /></div>
                <div><Label>Ponderación</Label><Input type="number" value={f.ponderacion} onChange={(e) => setF({ ...f, ponderacion: +e.target.value })} className="rounded-sm" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center justify-between border border-border rounded-sm p-2"><Label className="text-xs">Oficial (suma al total)</Label><Switch checked={f.oficial} onCheckedChange={(v) => setF({ ...f, oficial: v })} /></div>
                <div className="flex items-center justify-between border border-border rounded-sm p-2"><Label className="text-xs">Diferencial</Label><Switch checked={f.diferencial} onCheckedChange={(v) => setF({ ...f, diferencial: v })} /></div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} className="rounded-sm">Cancelar</Button>
              <Button onClick={submit} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-sm">Crear</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <div className="border border-border rounded-sm bg-white overflow-hidden">
        <table className="w-full dense-table">
          <thead><tr><th>#</th><th>Criterio</th><th>Rango</th><th>Ponderación</th><th>Tipo</th><th></th></tr></thead>
          <tbody>
            {criterios.map((c, i) => (
              <tr key={c.id}>
                <td className="font-mono text-muted-foreground">{c.orden || i + 1}</td>
                <td><div className="font-semibold">{c.nombre}</div><div className="text-xs text-muted-foreground">{c.descripcion}</div></td>
                <td className="font-mono tabular-nums">{c.puntaje_min} – {c.puntaje_max}</td>
                <td className="font-mono tabular-nums">{c.ponderacion}</td>
                <td>{c.diferencial ? <Badge tone="warning">diferencial</Badge> : <Badge tone="success">oficial</Badge>}</td>
                <td className="text-right"><button onClick={() => del(c.id)} className="text-muted-foreground hover:text-red-600"><Trash2 className="w-4 h-4" /></button></td>
              </tr>
            ))}
            {!criterios.length && <tr><td colSpan={6}><EmptyState title="Sin criterios" /></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DesempatesPanel({ desempates }) {
  return (
    <div className="border border-border rounded-sm bg-white overflow-hidden">
      <table className="w-full dense-table">
        <thead><tr><th>Orden</th><th>Regla</th><th>Campo</th><th>Comparación</th><th>Estado</th></tr></thead>
        <tbody>
          {desempates.map((d) => (
            <tr key={d.id}>
              <td className="font-mono tabular-nums">{d.orden}</td>
              <td className="font-semibold">{d.nombre}</td>
              <td className="font-mono text-xs">{d.campo}</td>
              <td><Badge tone="muted">{d.tipo_comparacion}</Badge></td>
              <td>{d.activo ? <Badge tone="success">activo</Badge> : <Badge tone="muted">inactivo</Badge>}</td>
            </tr>
          ))}
          {!desempates.length && <tr><td colSpan={5}><EmptyState title="Sin reglas de desempate" /></td></tr>}
        </tbody>
      </table>
    </div>
  );
}
