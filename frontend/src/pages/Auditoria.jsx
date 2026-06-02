import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import PageHeader, { Badge } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Shield, Search } from "lucide-react";

export default function Auditoria() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    api.get("/reportes/auditoria?limit=500").then((r) => setItems(r.data)).catch(() => setItems([]));
  }, []);

  const filtered = items.filter((i) =>
    !q || [i.username, i.accion, i.entidad, i.registro_id, i.detalle].some((v) => v?.toLowerCase?.().includes(q.toLowerCase()))
  );

  return (
    <div className="flex-1 p-8 lg:p-10">
      <PageHeader
        eyebrow="Trazabilidad"
        title="Auditoría"
        subtitle="Historial completo de todas las acciones realizadas sobre la plataforma. Acceso restringido a administradores y auditores."
      />
      <div className="mb-4 relative max-w-md">
        <Search className="w-4 h-4 absolute left-2.5 top-3 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar usuario, acción, entidad…" className="pl-9 rounded-sm" data-testid="audit-search" />
      </div>
      <div className="border border-border rounded-sm bg-white overflow-x-auto">
        <table className="w-full dense-table">
          <thead><tr><th>Fecha</th><th>Usuario</th><th>Rol</th><th>Acción</th><th>Entidad</th><th>Registro</th><th>Detalle</th></tr></thead>
          <tbody>
            {filtered.map((it) => (
              <tr key={it.id}>
                <td className="font-mono text-xs">{new Date(it.fecha).toLocaleString("es-CO")}</td>
                <td className="font-semibold">{it.username}</td>
                <td><Badge tone="muted">{it.rol}</Badge></td>
                <td><Badge tone="info">{it.accion}</Badge></td>
                <td className="font-mono text-xs">{it.entidad}</td>
                <td className="font-mono text-[10px] text-muted-foreground">{it.registro_id?.slice(0, 8)}…</td>
                <td className="text-xs">{it.detalle || "—"}</td>
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan={7} className="text-center text-sm text-muted-foreground py-12"><Shield className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />Sin registros</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
