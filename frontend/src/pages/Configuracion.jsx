import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader, { Badge } from "@/components/PageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import ResumenPanel from "./configuracion/ResumenPanel";
import CamposPanel from "./configuracion/CamposPanel";
import CatalogosPanel from "./configuracion/CatalogosPanel";
import CriteriosPanel from "./configuracion/CriteriosPanel";
import DesempatesPanel from "./configuracion/DesempatesPanel";
import AccionesGlobales from "./configuracion/AccionesGlobales";

export default function Configuracion() {
  const { activeConvocatoriaId } = useAuth();
  const [campos, setCampos] = useState([]);
  const [catalogos, setCatalogos] = useState([]);
  const [criterios, setCriterios] = useState([]);
  const [desempates, setDesempates] = useState([]);
  const [conv, setConv] = useState(null);
  const [tab, setTab] = useState("resumen");

  const reload = async () => {
    if (!activeConvocatoriaId) return;
    const [c, a, b, cc, d] = await Promise.all([
      api.get(`/convocatorias/${activeConvocatoriaId}`),
      api.get(`/campos?convocatoria_id=${activeConvocatoriaId}`),
      api.get(`/catalogos?convocatoria_id=${activeConvocatoriaId}`),
      api.get(`/criterios?convocatoria_id=${activeConvocatoriaId}`),
      api.get(`/desempates?convocatoria_id=${activeConvocatoriaId}`),
    ]);
    setConv(c.data);
    setCampos(a.data); setCatalogos(b.data); setCriterios(cc.data); setDesempates(d.data);
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [activeConvocatoriaId]);

  if (!activeConvocatoriaId)
    return <div className="p-10 text-muted-foreground">Selecciona una convocatoria en la cabecera para configurar.</div>;

  return (
    <div className="flex-1 p-8 lg:p-10">
      <PageHeader
        eyebrow={conv ? `Configurando: ${conv.codigo}` : "Estructura paramétrica"}
        title="Configuración"
        subtitle={
          conv
            ? `Todo lo que crees aquí queda vinculado a la convocatoria "${conv.nombre}". Cuando se carguen propuestas o se evalúe, usarán esta estructura.`
            : "Define los campos de propuestas, catálogos institucionales, criterios de evaluación y reglas de desempate de la convocatoria seleccionada."
        }
        actions={conv && (
          <AccionesGlobales convId={activeConvocatoriaId} convNombre={conv.nombre} onChange={reload} />
        )}
      />

      {conv && (
        <div className="mb-6 flex items-center gap-2 flex-wrap text-[12.5px]">
          <span className="text-muted-foreground">Convocatoria activa:</span>
          <Badge tone="info">{conv.estado}</Badge>
          {conv.etapa_actual && <Badge tone="default">etapa: {conv.etapa_actual}</Badge>}
          <span className="text-muted-foreground ml-2">|</span>
          <span className="text-muted-foreground">{campos.length} campos · {catalogos.length} catálogos · {criterios.length} criterios · {desempates.length} desempates</span>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="rounded-sm bg-secondary p-1">
          <TabsTrigger value="resumen" className="rounded-sm" data-testid="tab-resumen">Resumen</TabsTrigger>
          <TabsTrigger value="campos" className="rounded-sm" data-testid="tab-campos">Campos ({campos.length})</TabsTrigger>
          <TabsTrigger value="catalogos" className="rounded-sm" data-testid="tab-catalogos">Catálogos ({catalogos.length})</TabsTrigger>
          <TabsTrigger value="criterios" className="rounded-sm" data-testid="tab-criterios">Criterios ({criterios.length})</TabsTrigger>
          <TabsTrigger value="desempates" className="rounded-sm" data-testid="tab-desempates">Desempates ({desempates.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="resumen" className="mt-6">
          <ResumenPanel convId={activeConvocatoriaId} refreshKey={`${campos.length}-${catalogos.length}-${criterios.length}-${desempates.length}`} onJump={(t) => setTab(t)} />
        </TabsContent>
        <TabsContent value="campos" className="mt-6">
          <CamposPanel campos={campos} convId={activeConvocatoriaId} reload={reload} catalogos={catalogos} />
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
      </Tabs>
    </div>
  );
}
