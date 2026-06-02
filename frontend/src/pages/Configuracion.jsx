import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader, { Badge } from "@/components/PageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Info, FileText, Users } from "lucide-react";

import ResumenPanel from "./configuracion/ResumenPanel";
import CamposPanel from "./configuracion/CamposPanel";
import CatalogosPanel from "./configuracion/CatalogosPanel";
import CriteriosPanel from "./configuracion/CriteriosPanel";
import DesempatesPanel from "./configuracion/DesempatesPanel";
import PlantillasActasPanel from "./configuracion/PlantillasActasPanel";
import AccionesGlobales from "./configuracion/AccionesGlobales";

export default function Configuracion() {
  const { activeConvocatoriaId, setConv } = useAuth();
  const [campos, setCampos] = useState([]);
  const [catalogos, setCatalogos] = useState([]);
  const [criterios, setCriterios] = useState([]);
  const [desempates, setDesempates] = useState([]);
  const [convs, setConvs] = useState([]);
  const [tab, setTab] = useState("resumen");
  const [aplicaA, setAplicaA] = useState("propuesta"); // sub-tab dentro de Campos

  const conv = convs.find((c) => c.id === activeConvocatoriaId);
  // separar campos por aplica_a (compatibilidad: sin aplica_a → propuesta)
  const camposPropuesta = campos.filter((c) => (c.aplica_a || "propuesta") === "propuesta");
  const camposJurado = campos.filter((c) => c.aplica_a === "jurado");
  const camposVisibles = aplicaA === "jurado" ? camposJurado : camposPropuesta;

  const reload = async () => {
    if (!activeConvocatoriaId) return;
    const [cs, a, b, cc, d] = await Promise.all([
      api.get(`/convocatorias`),
      api.get(`/campos?convocatoria_id=${activeConvocatoriaId}`),
      api.get(`/catalogos?convocatoria_id=${activeConvocatoriaId}`),
      api.get(`/criterios?convocatoria_id=${activeConvocatoriaId}`),
      api.get(`/desempates?convocatoria_id=${activeConvocatoriaId}`),
    ]);
    setConvs(cs.data);
    setCampos(a.data); setCatalogos(b.data); setCriterios(cc.data); setDesempates(d.data);
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [activeConvocatoriaId]);

  if (!activeConvocatoriaId)
    return <div className="p-10 text-muted-foreground">Selecciona una convocatoria.</div>;

  return (
    <div className="flex-1 p-8 lg:p-10">
      <PageHeader
        eyebrow="Estructura paramétrica"
        title="Configuración de Convocatoria"
        subtitle="Define qué información lleva cada propuesta, qué evalúan los jurados y cómo se resuelven los empates."
        actions={conv && <AccionesGlobales convId={activeConvocatoriaId} convNombre={conv.nombre} onChange={reload} />}
      />

      {/* SWITCHER de convocatoria — siempre visible y claro */}
      <div className="mb-6 rounded-xl border border-[#CDE7E1] bg-gradient-to-br from-[#F0F7F5] to-white p-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] font-display font-bold text-[#14776A] shrink-0">
            <Sparkles className="w-3.5 h-3.5" />
            Estás configurando
          </div>
          <Select value={activeConvocatoriaId} onValueChange={setConv}>
            <SelectTrigger className="rounded-lg bg-white h-11 min-w-[320px] flex-1 max-w-2xl font-semibold text-[14px]" data-testid="conv-switcher">
              <SelectValue placeholder="Selecciona convocatoria…" />
            </SelectTrigger>
            <SelectContent>
              {convs.map((c) => (
                <SelectItem key={c.id} value={c.id} className="py-2">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-muted-foreground">{c.codigo}</span>
                      <span className="font-semibold">{c.nombre}</span>
                    </div>
                    <span className="text-[10.5px] text-muted-foreground">{c.estado} · {c.etapa_actual || "—"}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {conv && (
            <div className="flex items-center gap-2 flex-wrap">
              <Badge tone="info">{conv.estado}</Badge>
              {conv.etapa_actual && <Badge tone="default">etapa: {conv.etapa_actual}</Badge>}
            </div>
          )}
        </div>
        <p className="mt-3 text-[12px] text-[#5E6878] flex items-start gap-1.5 leading-relaxed">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#14776A]" />
          Todo lo que crees aquí (campos, catálogos, criterios y desempates) queda vinculado a esta convocatoria.
          Si tienes varias convocatorias, cambia desde aquí o desde el panel lateral.
          {convs.length > 1 && <span className="ml-1 font-semibold text-[#14776A]">Hay {convs.length} convocatorias disponibles.</span>}
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="rounded-sm bg-secondary p-1">
          <TabsTrigger value="resumen" className="rounded-sm" data-testid="tab-resumen">Resumen</TabsTrigger>
          <TabsTrigger value="campos" className="rounded-sm" data-testid="tab-campos">Campos ({campos.length})</TabsTrigger>
          <TabsTrigger value="catalogos" className="rounded-sm" data-testid="tab-catalogos">Catálogos ({catalogos.length})</TabsTrigger>
          <TabsTrigger value="criterios" className="rounded-sm" data-testid="tab-criterios">Criterios ({criterios.length})</TabsTrigger>
          <TabsTrigger value="desempates" className="rounded-sm" data-testid="tab-desempates">Desempates ({desempates.length})</TabsTrigger>
          <TabsTrigger value="plantillas" className="rounded-sm" data-testid="tab-plantillas">Plantillas de Actas</TabsTrigger>
        </TabsList>

        <TabsContent value="resumen" className="mt-6">
          <ResumenPanel convId={activeConvocatoriaId} refreshKey={`${campos.length}-${catalogos.length}-${criterios.length}-${desempates.length}`} onJump={(t) => setTab(t)} />
        </TabsContent>
        <TabsContent value="campos" className="mt-6">
          {/* Sub-tabs: campos de propuesta vs campos de jurado */}
          <div className="mb-4 inline-flex rounded-lg border border-border bg-white p-1">
            <button
              onClick={() => setAplicaA("propuesta")}
              className={`px-3 py-1.5 rounded-md text-[12.5px] font-semibold inline-flex items-center gap-1.5 transition-colors ${aplicaA === "propuesta" ? "bg-[#14776A] text-white" : "text-muted-foreground hover:text-foreground"}`}
              data-testid="subtab-campos-propuesta"
            >
              <FileText className="w-3.5 h-3.5" />
              Campos de Propuesta
              <span className="font-mono text-[11px] opacity-80">({camposPropuesta.length})</span>
            </button>
            <button
              onClick={() => setAplicaA("jurado")}
              className={`px-3 py-1.5 rounded-md text-[12.5px] font-semibold inline-flex items-center gap-1.5 transition-colors ${aplicaA === "jurado" ? "bg-[#14776A] text-white" : "text-muted-foreground hover:text-foreground"}`}
              data-testid="subtab-campos-jurado"
            >
              <Users className="w-3.5 h-3.5" />
              Campos de Jurado
              <span className="font-mono text-[11px] opacity-80">({camposJurado.length})</span>
            </button>
          </div>
          <CamposPanel campos={camposVisibles} convId={activeConvocatoriaId} reload={reload} catalogos={catalogos} aplicaA={aplicaA} />
        </TabsContent>
        <TabsContent value="catalogos" className="mt-6">
          <CatalogosPanel catalogos={catalogos} convId={activeConvocatoriaId} reload={reload} campos={campos} />
        </TabsContent>
        <TabsContent value="criterios" className="mt-6">
          <CriteriosPanel criterios={criterios} convId={activeConvocatoriaId} reload={reload} />
        </TabsContent>
        <TabsContent value="desempates" className="mt-6">
          <DesempatesPanel desempates={desempates} convId={activeConvocatoriaId} reload={reload} criterios={criterios} campos={campos} />
        </TabsContent>
        <TabsContent value="plantillas" className="mt-6">
          <PlantillasActasPanel convId={activeConvocatoriaId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
