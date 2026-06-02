import React, { useEffect, useState } from "react";
import { api, formatApiError, downloadFile } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader, { Badge, estadoTone, EmptyState } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Upload, Download, Users } from "lucide-react";
import { TID } from "@/constants/testIds";

export default function Jurados() {
  const { activeConvocatoriaId } = useAuth();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [file, setFile] = useState(null);
  const [f, setF] = useState({ nombre: "", email: "", telefono: "", perfil: "", especialidad: "", linea_experiencia: "", territorio: "", password: "Jurado2026!" });

  const load = () => activeConvocatoriaId && api.get(`/jurados?convocatoria_id=${activeConvocatoriaId}`).then((r) => setItems(r.data));
  useEffect(() => { load(); }, [activeConvocatoriaId]);

  const submit = async () => {
    try {
      await api.post("/jurados", { ...f, convocatoria_id: activeConvocatoriaId, crear_usuario: true });
      toast.success("Jurado creado (con usuario asociado)");
      setOpen(false); load();
      setF({ nombre: "", email: "", telefono: "", perfil: "", especialidad: "", linea_experiencia: "", territorio: "", password: "Jurado2026!" });
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const downloadTemplate = () => downloadFile(`/jurados-template`, "plantilla_jurados.xlsx").catch((e) => toast.error(e.message));

  const handleImport = async () => {
    if (!file) return;
    const fd = new FormData();
    fd.append("convocatoria_id", activeConvocatoriaId);
    fd.append("file", file);
    try {
      const r = await api.post("/jurados-import", fd);
      toast.success(`${r.data.creados} jurados creados, ${r.data.rechazados} errores`);
      setImportOpen(false); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  if (!activeConvocatoriaId) return <div className="p-10 text-muted-foreground">Selecciona una convocatoria.</div>;

  return (
    <div className="flex-1 p-8 lg:p-10">
      <PageHeader
        eyebrow="Equipo evaluador"
        title="Jurados"
        subtitle="Registro de evaluadores con perfil, especialidad y territorio. Al crear un jurado se genera automáticamente su usuario de acceso."
        actions={
          <>
            <Button variant="outline" className="rounded-sm gap-2" onClick={downloadTemplate}><Download className="w-4 h-4" />Plantilla</Button>
            <Dialog open={importOpen} onOpenChange={setImportOpen}>
              <DialogTrigger asChild><Button variant="outline" className="rounded-sm gap-2"><Upload className="w-4 h-4" />Importar</Button></DialogTrigger>
              <DialogContent className="rounded-sm max-w-md">
                <DialogHeader><DialogTitle className="font-display">Importar jurados</DialogTitle></DialogHeader>
                <input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0])} className="block w-full text-sm" data-testid="jurados-import-input" />
                <p className="text-xs text-muted-foreground">Cada jurado tendrá usuario con contraseña inicial <code className="font-mono">Jurado2026!</code></p>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setImportOpen(false)} className="rounded-sm">Cancelar</Button>
                  <Button onClick={handleImport} disabled={!file} className="bg-[#059669] hover:bg-[#047857] rounded-sm">Importar</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button className="bg-[#059669] hover:bg-[#047857] rounded-sm gap-2" data-testid={TID.createBtn}><Plus className="w-4 h-4" />Nuevo jurado</Button></DialogTrigger>
              <DialogContent className="rounded-sm max-w-lg">
                <DialogHeader><DialogTitle className="font-display">Nuevo jurado</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Nombre</Label><Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} className="rounded-sm" data-testid="jurado-nombre" /></div>
                    <div><Label>Email</Label><Input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className="rounded-sm" data-testid="jurado-email" /></div>
                    <div><Label>Teléfono</Label><Input value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} className="rounded-sm" /></div>
                    <div><Label>Especialidad</Label><Input value={f.especialidad} onChange={(e) => setF({ ...f, especialidad: e.target.value })} className="rounded-sm" /></div>
                    <div><Label>Línea</Label><Input value={f.linea_experiencia} onChange={(e) => setF({ ...f, linea_experiencia: e.target.value })} className="rounded-sm" /></div>
                    <div><Label>Territorio</Label><Input value={f.territorio} onChange={(e) => setF({ ...f, territorio: e.target.value })} className="rounded-sm" /></div>
                  </div>
                  <div><Label>Perfil</Label><Input value={f.perfil} onChange={(e) => setF({ ...f, perfil: e.target.value })} className="rounded-sm" /></div>
                  <div><Label>Contraseña inicial</Label><Input value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} className="rounded-sm font-mono" /></div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)} className="rounded-sm">Cancelar</Button>
                  <Button onClick={submit} className="bg-[#059669] hover:bg-[#047857] rounded-sm" data-testid={TID.saveBtn}>Crear</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        }
      />

      <div className="border border-border rounded-sm bg-white overflow-x-auto">
        <table className="w-full dense-table" data-testid={TID.juradosTable}>
          <thead><tr><th>Nombre</th><th>Email</th><th>Especialidad</th><th>Línea</th><th>Territorio</th><th>Estado</th></tr></thead>
          <tbody>
            {items.map((j) => (
              <tr key={j.id}>
                <td className="font-semibold">{j.nombre}</td>
                <td className="font-mono text-xs">{j.email}</td>
                <td>{j.especialidad || "—"}</td>
                <td>{j.linea_experiencia || "—"}</td>
                <td>{j.territorio || "—"}</td>
                <td><Badge tone={estadoTone(j.estado)}>{j.estado}</Badge></td>
              </tr>
            ))}
            {!items.length && <tr><td colSpan={6}><EmptyState title="Sin jurados" hint="Importa el equipo evaluador desde Excel o créalos manualmente." icon={Users} /></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
