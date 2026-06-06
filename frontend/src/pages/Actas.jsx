import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatApiError, openPdf } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader, { Badge } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { FileText, Download, Zap, PenLine, Map, Users, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

const ESTADO_TONE = {
  "Emitible": "success",
  "Firmada": "success",
  "Pendiente": "muted",
  "Requiere firma": "warning",
  "Re-firma pendiente": "warning",
  "Falta firma terna": "warning",
  "Falta firmar": "warning",
};

export default function Actas() {
  const { activeConvocatoriaId, user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("individual");
  const [busy, setBusy] = useState(false);
  const [confirmForzar, setConfirmForzar] = useState(null);

  const isAdmin = ["admin_general", "admin_convocatoria", "supervisor"].includes(user?.role);
  // Forzar/anular/reabrir actas son acciones DESTRUCTIVAS reservadas a administradores
  // de convocatoria. Supervisor solo puede ver/descargar; no puede forzar.
  const canForzar = ["admin_general", "admin_convocatoria"].includes(user?.role);
  const isJurado = user?.role === "jurado";

  const load = async () => {
    if (!activeConvocatoriaId) return;
    try {
      const r = await api.get(`/actas-pendientes?convocatoria_id=${activeConvocatoriaId}`);
      // Si es jurado, filtrar lo que ve:
      //  - Individuales: solo SU fila (por jurado_id o por email)
      //  - Colectivas: solo ternas donde es integrante
      //  - Subregionales: solo subregiones donde tiene asignaciones
      if (user?.role === "jurado") {
        const d = r.data;
        const my_jid = user.jurado_id;
        const my_email = (user.email || "").toLowerCase();
        const isMineRow = (row) =>
          (my_jid && row.jurado_id === my_jid) ||
          (row.jurado_email && row.jurado_email.toLowerCase() === my_email);
        d.individual = (d.individual || []).filter(isMineRow);
        d.colectiva_terna = (d.colectiva_terna || []).filter(
          (row) => my_jid && (row.integrantes_ids || []).includes(my_jid),
        );
        const mis = new Set(d.mis_subregiones || []);
        d.subregional = (d.subregional || []).filter((row) => mis.has(row.subregion));
        setData(d);
      } else {
        setData(r.data);
      }
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Error al cargar actas");
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [activeConvocatoriaId]);

  const forzarIndividual = async (jurId) => {
    setBusy(true);
    try {
      await api.post(`/actas/individual-jurado/${jurId}/forzar`);
      toast.success("Acta individual activada");
      await load();
      setConfirmForzar(null);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Error");
    } finally { setBusy(false); }
  };

  const firmarMiActaIndividual = async () => {
    if (!user?.jurado_id) return;
    setBusy(true);
    try {
      await api.post(`/actas/individual-jurado/${user.jurado_id}/firmar`);
      toast.success("¡Tu acta individual ha sido firmada!");
      await load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Error");
    } finally { setBusy(false); }
  };

  const firmarColectiva = async (ternaId) => {
    setBusy(true);
    try {
      await api.post(`/actas/colectiva-terna/${ternaId}/firmar`);
      toast.success("Firma registrada");
      await load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Error");
    } finally { setBusy(false); }
  };

  const firmarSubregional = async (sub) => {
    setBusy(true);
    try {
      await api.post(`/actas/subregional/firmar`, { convocatoria_id: activeConvocatoriaId, subregion: sub });
      toast.success(`Firma registrada en ${sub}`);
      await load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Error");
    } finally { setBusy(false); }
  };

  if (!activeConvocatoriaId) return <div className="p-10 text-muted-foreground">Selecciona una convocatoria.</div>;
  if (!data) return <div className="p-10 text-muted-foreground">Cargando actas…</div>;

  return (
    <div className="flex-1 p-8 lg:p-10">
      <PageHeader
        eyebrow="Documentos oficiales"
        title="Actas"
        subtitle="Genera y firma las actas oficiales del proceso. El texto institucional se personaliza desde Configuración → Plantillas de Actas."
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="rounded-sm bg-secondary p-1">
          <TabsTrigger value="individual" className="rounded-sm gap-2" data-testid="actas-tab-individual">
            <FileText className="w-3.5 h-3.5" /> Individuales <span className="font-mono text-[10.5px] opacity-70">({data.individual.length})</span>
          </TabsTrigger>
          <TabsTrigger value="colectiva" className="rounded-sm gap-2" data-testid="actas-tab-colectiva">
            <Users className="w-3.5 h-3.5" /> Colectivas (Terna) <span className="font-mono text-[10.5px] opacity-70">({data.colectiva_terna.length})</span>
          </TabsTrigger>
          {data.uso_acta_subregional && (
            <TabsTrigger value="subregional" className="rounded-sm gap-2" data-testid="actas-tab-subregional">
              <Map className="w-3.5 h-3.5" /> Subregionales <span className="font-mono text-[10.5px] opacity-70">({data.subregional.length})</span>
            </TabsTrigger>
          )}
        </TabsList>

        {/* INDIVIDUAL */}
        <TabsContent value="individual" className="mt-6">
          {(() => {
            const myActa = isJurado ? data.individual.find((r) => r.jurado_id === user?.jurado_id) : null;
            const needsRefirma = myActa && (myActa.estado === "Re-firma pendiente" || myActa.acta_invalidada);
            if (needsRefirma) {
              return (
                <div className="mb-4 border border-amber-300 bg-amber-50 rounded-lg p-4 flex items-start gap-3" data-testid="acta-refirma-banner">
                  <AlertCircle className="w-5 h-5 text-amber-700 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <div className="font-display font-bold text-[14px] text-amber-900">Tu acta requiere re-firma</div>
                    <p className="text-[12.5px] text-amber-800 mt-0.5">
                      Has reabierto una o más evaluaciones después de haber firmado. La firma anterior fue invalidada para reflejar tus puntajes actualizados.
                      <strong> Por favor vuelve a firmar el acta</strong> cuando termines de ajustar tus evaluaciones.
                    </p>
                  </div>
                  {myActa.finalizadas === myActa.total && myActa.tiene_firma && (
                    <Button size="sm" onClick={firmarMiActaIndividual} disabled={busy} className="bg-amber-600 hover:bg-amber-700 text-white gap-1 rounded-md text-[12px]" data-testid="acta-refirma-btn">
                      <PenLine className="w-3.5 h-3.5" /> Re-firmar ahora
                    </Button>
                  )}
                </div>
              );
            }
            return null;
          })()}
          <IntroBanner
            icon={FileText}
            text="Una acta por jurado. Se genera cuando completa todas sus evaluaciones individuales (o el admin la fuerza). Requiere que el jurado tenga su firma cargada en Mi Perfil."
          />
          <div className="border border-border rounded-sm bg-white overflow-hidden">
            <table className="w-full dense-table">
              <thead><tr><th>Jurado</th><th>Subregión</th><th>Documento</th><th>Avance</th><th>Firma</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                {data.individual.map((r) => {
                  const isMine = user?.jurado_id === r.jurado_id;
                  const canDownload = r.estado === "Emitible" || r.estado === "Firmada" || r.estado === "Re-firma pendiente" || (r.estado === "Requiere firma" && isAdmin);
                  return (
                    <tr key={r.jurado_id}>
                      <td>
                        <div className="font-semibold">{r.jurado_nombre}</div>
                        <div className="text-[11px] text-muted-foreground">{r.jurado_email}</div>
                      </td>
                      <td className="text-xs">{(r.subregiones || []).join(", ") || "—"}</td>
                      <td className="font-mono text-xs">{r.documento || "—"}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-1.5 bg-secondary rounded-full overflow-hidden">
                            <div className="h-full bg-[#14776A]" style={{ width: `${r.porcentaje}%` }}></div>
                          </div>
                          <span className="font-mono text-xs">{r.finalizadas}/{r.total}</span>
                        </div>
                      </td>
                      <td>{r.tiene_firma ? <Badge tone="success">Cargada</Badge> : <Badge tone="warning">Falta</Badge>}</td>
                      <td>
                        <Badge tone={ESTADO_TONE[r.estado] || "default"}>{r.estado}</Badge>
                        {r.forzada && <span className="ml-1 text-[10px] text-amber-700 font-semibold">· forzada</span>}
                      </td>
                      <td className="text-right space-x-1.5">
                        {/* Solo Admin de convocatoria puede forzar (supervisor NO) */}
                        {(r.estado === "Pendiente" || r.estado === "Requiere firma" || !r.tiene_firma) && canForzar && (
                          <Button size="sm" variant="outline" onClick={() => setConfirmForzar(r)} className="gap-1 rounded-sm text-[11px] h-7 border-amber-300 text-amber-700 hover:bg-amber-50" data-testid={`actas-ind-forzar-${r.jurado_id}`}>
                            <Zap className="w-3 h-3" /> Forzar
                          </Button>
                        )}
                        {/* Jurado: si no tiene firma, mostrar botón naranja para ir a cargarla */}
                        {isJurado && isMine && !r.tiene_firma && (
                          <Button size="sm" onClick={() => navigate("/mi-perfil")} className="bg-amber-500 hover:bg-amber-600 text-white gap-1 rounded-sm text-[11px] h-7" data-testid="actas-ind-go-firma">
                            <PenLine className="w-3 h-3" /> Cargar firma
                          </Button>
                        )}
                        {/* Jurado: si tiene firma + avance 100% + no firmada aún O necesita re-firma */}
                        {isJurado && isMine && r.tiene_firma && r.finalizadas === r.total && r.total > 0 && (!r.firma_acta_at || r.estado === "Re-firma pendiente") && (
                          <Button size="sm" onClick={firmarMiActaIndividual} disabled={busy} className="bg-[#0F5E54] hover:bg-[#0B4A42] text-white gap-1 rounded-sm text-[11px] h-7" data-testid="actas-ind-firmar-mia">
                            <PenLine className="w-3 h-3" /> {r.estado === "Re-firma pendiente" ? "Re-firmar" : "Firmar mi acta"}
                          </Button>
                        )}
                        {canDownload && (
                          <Button size="sm" variant="outline" onClick={() => openPdf(`/actas/individual-jurado/${r.jurado_id}`)} className="gap-1 rounded-sm text-[11px] h-7" data-testid={`actas-ind-pdf-${r.jurado_id}`}>
                            <Download className="w-3 h-3" /> PDF
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!data.individual.length && (
                  <tr><td colSpan={7} className="text-center py-8 text-muted-foreground text-sm">Sin actas individuales pendientes.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* COLECTIVA TERNA */}
        <TabsContent value="colectiva" className="mt-6">
          <IntroBanner
            icon={Users}
            text="Una acta por terna. Se genera al cerrar todas las evaluaciones colectivas de la terna. Cada integrante debe firmar antes de descargar el PDF final."
          />
          <div className="border border-border rounded-sm bg-white overflow-hidden">
            <table className="w-full dense-table">
              <thead><tr><th>Terna</th><th>Subregión</th><th>Integrantes</th><th>Avance</th><th>Firmas</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                {data.colectiva_terna.map((r) => {
                  const canDownload = r.estado === "Emitible";
                  return (
                    <tr key={r.terna_id}>
                      <td>
                        <div className="font-mono text-xs text-muted-foreground">{r.terna_codigo}</div>
                        <div className="font-semibold">{r.terna_nombre || "—"}</div>
                      </td>
                      <td className="text-xs">{r.subregion || "—"}</td>
                      <td className="text-xs">{r.integrantes}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-1.5 bg-secondary rounded-full overflow-hidden">
                            <div className="h-full bg-[#14776A]" style={{ width: `${r.porcentaje}%` }}></div>
                          </div>
                          <span className="font-mono text-xs">{r.cerradas}/{r.total}</span>
                        </div>
                      </td>
                      <td className="font-mono text-xs">{r.firmas}/{r.integrantes}</td>
                      <td><Badge tone={ESTADO_TONE[r.estado] || "default"}>{r.estado}</Badge></td>
                      <td className="text-right space-x-1.5">
                        {(r.estado === "Falta firma terna" || r.estado === "Emitible") && isJurado && (
                          <Button size="sm" variant="outline" onClick={() => firmarColectiva(r.terna_id)} disabled={busy} className="gap-1 rounded-sm text-[11px] h-7" data-testid={`actas-col-firmar-${r.terna_id}`}>
                            <PenLine className="w-3 h-3" /> Firmar
                          </Button>
                        )}
                        {canDownload && (
                          <Button size="sm" variant="outline" onClick={() => openPdf(`/actas/colectiva-terna/${r.terna_id}`)} className="gap-1 rounded-sm text-[11px] h-7" data-testid={`actas-col-pdf-${r.terna_id}`}>
                            <Download className="w-3 h-3" /> PDF
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!data.colectiva_terna.length && (
                  <tr><td colSpan={7} className="text-center py-8 text-muted-foreground text-sm">Sin actas colectivas por terna.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* SUBREGIONAL */}
        {data.uso_acta_subregional && (
          <TabsContent value="subregional" className="mt-6">
            <IntroBanner
              icon={Map}
              text="Una acta por subregión. Se genera cuando todas las evaluaciones colectivas de la subregión están cerradas. Todos los jurados que evaluaron iniciativas de la subregión deben firmar."
            />
            <div className="border border-border rounded-sm bg-white overflow-hidden">
              <table className="w-full dense-table">
                <thead><tr><th>Subregión</th><th>Propuestas</th><th>Avance</th><th>Firmas</th><th>Estado</th><th></th></tr></thead>
                <tbody>
                  {data.subregional.map((r) => {
                    const canDownload = r.estado === "Emitible" || isAdmin;
                    return (
                      <tr key={r.subregion}>
                        <td className="font-semibold">{r.subregion}</td>
                        <td className="font-mono text-xs">{r.total}</td>
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-1.5 bg-secondary rounded-full overflow-hidden">
                              <div className="h-full bg-[#14776A]" style={{ width: `${r.porcentaje}%` }}></div>
                            </div>
                            <span className="font-mono text-xs">{r.cerradas}/{r.total}</span>
                          </div>
                        </td>
                        <td className="font-mono text-xs">{r.firmas}/{r.jurados}</td>
                        <td><Badge tone={ESTADO_TONE[r.estado] || "default"}>{r.estado}</Badge></td>
                        <td className="text-right space-x-1.5">
                          {(r.estado === "Falta firmar" || r.estado === "Emitible") && isJurado && (
                            <Button size="sm" variant="outline" onClick={() => firmarSubregional(r.subregion)} disabled={busy} className="gap-1 rounded-sm text-[11px] h-7" data-testid={`actas-sub-firmar-${r.subregion}`}>
                              <PenLine className="w-3 h-3" /> Firmar
                            </Button>
                          )}
                          {canDownload && (
                            <Button size="sm" variant="outline" onClick={() => openPdf(`/actas/subregional?convocatoria_id=${activeConvocatoriaId}&subregion=${encodeURIComponent(r.subregion)}`)} className="gap-1 rounded-sm text-[11px] h-7" data-testid={`actas-sub-pdf-${r.subregion}`}>
                              <Download className="w-3 h-3" /> PDF
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {!data.subregional.length && (
                    <tr><td colSpan={6} className="text-center py-8 text-muted-foreground text-sm">Sin actas subregionales pendientes.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>
        )}
      </Tabs>

      {/* Dialog confirmación forzar */}
      <Dialog open={!!confirmForzar} onOpenChange={(o) => !o && setConfirmForzar(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-600" />
              Forzar activación de acta
            </DialogTitle>
          </DialogHeader>
          {confirmForzar && (
            <div className="space-y-3">
              <p className="text-[13px]">
                El jurado <strong>{confirmForzar.jurado_nombre}</strong> tiene <strong>{confirmForzar.finalizadas} de {confirmForzar.total}</strong> evaluaciones finalizadas.
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-sm p-3 text-[12px] text-amber-900">
                <strong>¿Estás seguro?</strong> Al forzar la activación, el sistema marca el acta como emitible aunque no todas las evaluaciones estén finalizadas. El jurado aún necesita su firma cargada.
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setConfirmForzar(null)} className="rounded-sm">Cancelar</Button>
                <Button onClick={() => forzarIndividual(confirmForzar.jurado_id)} disabled={busy} className="bg-amber-600 hover:bg-amber-700 rounded-sm gap-2" data-testid="actas-ind-forzar-confirm">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  Sí, forzar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function IntroBanner({ icon: Icon, text }) {
  return (
    <div className="mb-4 rounded-lg border border-[#CDE7E1] bg-gradient-to-br from-[#F0F7F5] to-white p-3 flex items-start gap-2.5">
      <Icon className="w-4 h-4 text-[#0F5E54] mt-0.5 shrink-0" />
      <p className="text-[12.5px] text-[#1A1F2C] leading-relaxed">{text}</p>
    </div>
  );
}
