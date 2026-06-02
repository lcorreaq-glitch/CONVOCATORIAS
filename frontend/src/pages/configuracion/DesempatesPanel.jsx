import React, { useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Badge, EmptyState } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Pencil } from "lucide-react";
import SortableTable from "./SortableTable";

const TIPOS = [
  { value: "mayor_valor", label: "Mayor valor primero" },
  { value: "menor_valor", label: "Menor valor primero" },
  { value: "fecha_mas_antigua", label: "Fecha más antigua primero" },
  { value: "fecha_mas_reciente", label: "Fecha más reciente primero" },
  { value: "hora_mas_antigua", label: "Hora más antigua primero" },
  { value: "hora_mas_reciente", label: "Hora más reciente primero" },
  { value: "sorteo", label: "Sorteo aleatorio" },
];

/**
 * "fuente" controla qué tipo de referencia es:
 *   - "criterio": se almacena como `criterio:<nombre>` (compatibilidad con código existente)
 *   - "campo":    se almacena como `<nombre_interno>` (compatibilidad con desempates clásicos como `fecha_radicacion`)
 *   - "sorteo":   se almacena como `sorteo`
 */
function decodeCampo(campo, criterios, campos) {
  if (!campo) return { fuente: "criterio", ref: "" };
  if (campo === "sorteo") return { fuente: "sorteo", ref: "" };
  if (campo.startsWith("criterio:")) {
    const name = campo.split(":", 2)[1];
    const c = criterios.find((c) => c.nombre.toLowerCase() === name.toLowerCase());
    return { fuente: "criterio", ref: c?.id || "" };
  }
  if (campo.startsWith("criterio_id:")) {
    return { fuente: "criterio", ref: campo.split(":", 2)[1] };
  }
  if (campo.startsWith("campo:")) {
    const interno = campo.split(":", 2)[1];
    const ca = campos.find((c) => c.nombre_interno === interno);
    return { fuente: "campo", ref: ca?.id || "" };
  }
  const ca = campos.find((c) => c.nombre_interno === campo);
  if (ca) return { fuente: "campo", ref: ca.id };
  return { fuente: "criterio", ref: "" };
}

function encodeCampo(fuente, ref, criterios, campos) {
  if (fuente === "sorteo") return "sorteo";
  if (fuente === "criterio") {
    const c = criterios.find((c) => c.id === ref);
    return c ? `criterio:${c.nombre}` : "";
  }
  if (fuente === "campo") {
    const ca = campos.find((c) => c.id === ref);
    return ca ? ca.nombre_interno : "";
  }
  return "";
}

export default function DesempatesPanel({ desempates, convId, reload, criterios = [], campos = [] }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const blank = { orden: 0, nombre: "", fuente: "criterio", ref: "", tipo_comparacion: "mayor_valor", activo: true };
  const [f, setF] = useState(blank);

  const startEdit = (d) => {
    const decoded = decodeCampo(d.campo, criterios, campos);
    setEditing(d);
    setF({ orden: d.orden, nombre: d.nombre, fuente: decoded.fuente, ref: decoded.ref, tipo_comparacion: d.tipo_comparacion, activo: d.activo });
    setOpen(true);
  };
  const startNew = () => {
    setEditing(null);
    setF({ ...blank, orden: (desempates.length || 0) + 1 });
    setOpen(true);
  };

  const submit = async () => {
    try {
      const campo = encodeCampo(f.fuente, f.ref, criterios, campos);
      if (!campo && f.fuente !== "sorteo") {
        toast.error("Debes seleccionar un criterio o campo de referencia");
        return;
      }
      const payload = {
        orden: f.orden,
        nombre: f.nombre,
        campo,
        tipo_comparacion: f.fuente === "sorteo" ? "sorteo" : f.tipo_comparacion,
        activo: f.activo,
      };
      if (editing) await api.patch(`/desempates/${editing.id}`, payload);
      else await api.post("/desempates", { ...payload, convocatoria_id: convId });
      toast.success(editing ? "Regla actualizada" : "Regla creada");
      setOpen(false); setEditing(null); reload();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  const del = async (id) => { if (!confirm("¿Eliminar regla?")) return; await api.delete(`/desempates/${id}`); reload(); };

  const onReorder = async (ids) => {
    try { await api.post("/desempates/reordenar", { convocatoria_id: convId, ids }); reload(); }
    catch (e) { toast.error("No se pudo reordenar"); }
  };

  const refLabel = (d) => {
    const decoded = decodeCampo(d.campo, criterios, campos);
    if (decoded.fuente === "sorteo") return { tone: "muted", text: "Sorteo aleatorio" };
    if (decoded.fuente === "criterio") {
      const c = criterios.find((c) => c.id === decoded.ref);
      return { tone: "warning", text: `Criterio: ${c?.nombre || d.campo}` };
    }
    const ca = campos.find((c) => c.id === decoded.ref);
    return { tone: "info", text: `Campo: ${ca?.nombre_visible || d.campo}` };
  };

  const columns = [
    { key: "orden", label: "Orden", sortable: true, width: 60, render: (_r, i) => <span className="font-mono tabular-nums">{i + 1}</span> },
    { key: "nombre", label: "Regla", sortable: true, render: (d) => <span className="font-semibold">{d.nombre}</span> },
    { key: "referencia", label: "Se resuelve por", sortable: false, render: (d) => {
      const r = refLabel(d);
      return <Badge tone={r.tone}>{r.text}</Badge>;
    }},
    { key: "tipo_comparacion", label: "Comparación", sortable: true, render: (d) => (
      <Badge tone="muted">{TIPOS.find((t) => t.value === d.tipo_comparacion)?.label || d.tipo_comparacion}</Badge>
    )},
    { key: "activo", label: "Estado", sortable: true, render: (d) => d.activo ? <Badge tone="success">activo</Badge> : <Badge tone="muted">inactivo</Badge> },
    { key: "_actions", label: "", width: 80, render: (d) => (
      <div className="text-right space-x-1">
        <button onClick={() => startEdit(d)} className="text-[#14776A] hover:text-[#0F5E54] p-1"><Pencil className="w-4 h-4 inline" /></button>
        <button onClick={() => del(d.id)} className="text-muted-foreground hover:text-red-600 p-1"><Trash2 className="w-4 h-4 inline" /></button>
      </div>
    )},
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-display font-bold text-[16px]">Reglas de desempate</h3>
          <p className="text-[12.5px] text-[#5E6878] mt-0.5">
            Cuando dos o más propuestas tienen el mismo puntaje, se aplican estas reglas <strong>en orden</strong> hasta resolver el empate.
            Apuntan a un <strong>criterio de evaluación</strong>, un <strong>campo de la propuesta</strong> o, como última instancia, <strong>sorteo</strong>.
          </p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { if (!v) { setEditing(null); setF(blank); } setOpen(v); }}>
          <DialogTrigger asChild><Button onClick={startNew} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-lg gap-2" data-testid="add-desempate-btn"><Plus className="w-4 h-4" />Nueva regla</Button></DialogTrigger>
          <DialogContent className="rounded-lg max-w-lg">
            <DialogHeader><DialogTitle className="font-display">{editing ? "Editar regla" : "Nueva regla de desempate"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Orden</Label><Input type="number" value={f.orden} onChange={(e) => setF({ ...f, orden: +e.target.value })} className="rounded-lg" /></div>
                <div className="col-span-2"><Label>Nombre de la regla</Label><Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Ej. Mayor puntaje en Incidencia social" className="rounded-lg" /></div>
              </div>

              <div>
                <Label>Fuente de la comparación</Label>
                <Select value={f.fuente} onValueChange={(v) => setF({ ...f, fuente: v, ref: "" })}>
                  <SelectTrigger className="rounded-lg" data-testid="desempate-fuente"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="criterio">Criterio de evaluación</SelectItem>
                    <SelectItem value="campo">Campo de la propuesta</SelectItem>
                    <SelectItem value="sorteo">Sorteo (azar)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {f.fuente === "criterio" && (
                <div>
                  <Label>Criterio</Label>
                  <Select value={f.ref} onValueChange={(v) => setF({ ...f, ref: v })}>
                    <SelectTrigger className="rounded-lg" data-testid="desempate-criterio-select"><SelectValue placeholder="Selecciona un criterio…" /></SelectTrigger>
                    <SelectContent>
                      {criterios.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre} (máx {c.puntaje_max})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {f.fuente === "campo" && (
                <div>
                  <Label>Campo</Label>
                  <Select value={f.ref} onValueChange={(v) => setF({ ...f, ref: v })}>
                    <SelectTrigger className="rounded-lg" data-testid="desempate-campo-select"><SelectValue placeholder="Selecciona un campo…" /></SelectTrigger>
                    <SelectContent>
                      {campos.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre_visible} <span className="text-xs text-muted-foreground">({c.tipo})</span></SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {f.fuente !== "sorteo" && (
                <div>
                  <Label className="flex items-center gap-1.5">
                    Tipo de comparación
                    <span className="text-[10px] text-muted-foreground font-normal italic">(opciones del sistema)</span>
                  </Label>
                  <Select value={f.tipo_comparacion} onValueChange={(v) => setF({ ...f, tipo_comparacion: v })}>
                    <SelectTrigger className="rounded-lg"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIPOS.filter((t) => t.value !== "sorteo").map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-[10.5px] text-muted-foreground mt-1 leading-snug">
                    Define cómo se ordenan dos propuestas al comparar. Para fechas/horas usa los tipos correspondientes.
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between border border-border rounded-lg p-2"><Label className="text-xs">Activo</Label><Switch checked={!!f.activo} onCheckedChange={(v) => setF({ ...f, activo: v })} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} className="rounded-lg">Cancelar</Button>
              <Button onClick={submit} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-lg" data-testid="desempate-submit-btn">{editing ? "Guardar" : "Crear"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <SortableTable
        items={desempates}
        columns={columns}
        onReorder={onReorder}
        searchKeys={["nombre", "campo"]}
        searchPlaceholder="Buscar reglas…"
        testIdPrefix="desempate-row"
        emptyState={<EmptyState title="Sin reglas de desempate" hint="Crea reglas para resolver puntajes iguales en el ranking final." />}
      />
    </div>
  );
}
