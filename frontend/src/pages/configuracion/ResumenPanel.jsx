import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge } from "@/components/PageHeader";
import { Database, ListChecks, ClipboardList, Trophy, AlertTriangle, FileText, Boxes, Sparkles } from "lucide-react";

/**
 * ResumenPanel: vista panorámica de cómo se vincula la configuración a la convocatoria
 * y cómo fluye hacia propuestas y evaluaciones.
 */
export default function ResumenPanel({ convId, refreshKey, onJump }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!convId) return;
    setLoading(true);
    api.get(`/convocatorias/${convId}/configuracion/resumen`)
      .then((r) => setData(r.data))
      .finally(() => setLoading(false));
  }, [convId, refreshKey]);

  if (loading || !data) return <div className="p-6 text-sm text-muted-foreground">Calculando resumen…</div>;

  const { convocatoria, counts, alertas, stats, catalogo_usage, desempate_refs } = data;
  const has_data = counts.campos + counts.catalogos + counts.criterios + counts.desempates > 0;

  return (
    <div className="space-y-6">
      {/* Banner contexto convocatoria */}
      <div className="rounded-xl border border-[#CDE7E1] bg-gradient-to-br from-[#F0F7F5] to-white p-5">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] font-display font-bold text-[#14776A]">
          <Sparkles className="w-3.5 h-3.5" />
          Convocatoria activa
        </div>
        <div className="mt-1.5 flex items-baseline gap-3 flex-wrap">
          <h2 className="font-display font-extrabold text-[24px] text-[#1A1F2C]">{convocatoria.nombre}</h2>
          <Badge tone="muted">{convocatoria.codigo}</Badge>
          <Badge tone="info">{convocatoria.estado}</Badge>
          {convocatoria.etapa_actual && <Badge tone="default">etapa: {convocatoria.etapa_actual}</Badge>}
        </div>
        <p className="text-[13px] text-[#5E6878] mt-2 max-w-3xl leading-relaxed">
          Todo lo que crees en este módulo (campos, catálogos, criterios y desempates) quedará vinculado a
          esta convocatoria. Cuando se carguen propuestas o se hagan evaluaciones, usarán esta estructura.
        </p>
      </div>

      {/* Diagrama de flujo */}
      <div className="grid lg:grid-cols-4 md:grid-cols-2 gap-3">
        <FlowCard
          icon={Database}
          color="#14776A"
          title="Campos"
          count={counts.campos}
          subtitle="forman el formulario de cada propuesta"
          flowTo={`${counts.propuestas} propuestas`}
          onClick={() => onJump && onJump("campos")}
          testId="resumen-card-campos"
        />
        <FlowCard
          icon={Boxes}
          color="#1D4ED8"
          title="Catálogos"
          count={counts.catalogos}
          subtitle="alimentan campos tipo lista"
          flowTo={`${stats.campos_tipo_lista} campos de lista`}
          onClick={() => onJump && onJump("catalogos")}
          testId="resumen-card-catalogos"
        />
        <FlowCard
          icon={ClipboardList}
          color="#B45309"
          title="Criterios"
          count={counts.criterios}
          subtitle="conforman la rúbrica de evaluación"
          flowTo={`${counts.evaluaciones_individuales} eval. indiv. · puntaje máx ${counts.puntaje_max_total}`}
          onClick={() => onJump && onJump("criterios")}
          testId="resumen-card-criterios"
        />
        <FlowCard
          icon={Trophy}
          color="#B42318"
          title="Desempates"
          count={counts.desempates}
          subtitle="orden para resolver empates en el ranking"
          flowTo="aplican al ranking final"
          onClick={() => onJump && onJump("desempates")}
          testId="resumen-card-desempates"
        />
      </div>

      {/* Alertas */}
      {(alertas.campos_lista_sin_catalogo.length > 0 || alertas.criterios_sin_ponderacion.length > 0 || alertas.puntaje_total_no_100) && (
        <div className="border border-[#FDE68A] bg-[#FFFBEB] rounded-xl p-4">
          <div className="flex items-center gap-2 text-[#B45309] font-semibold text-sm">
            <AlertTriangle className="w-4 h-4" /> Recomendaciones
          </div>
          <ul className="mt-2 space-y-1 text-[12.5px] text-[#7A4F00]">
            {alertas.campos_lista_sin_catalogo.length > 0 && (
              <li>
                · <strong>{alertas.campos_lista_sin_catalogo.length}</strong> campo(s) tipo lista/multi sin catálogo vinculado:{" "}
                {alertas.campos_lista_sin_catalogo.map((c) => c.nombre).join(", ")}
              </li>
            )}
            {alertas.criterios_sin_ponderacion.length > 0 && (
              <li>· {alertas.criterios_sin_ponderacion.length} criterio(s) oficial(es) sin puntaje máximo.</li>
            )}
            {alertas.puntaje_total_no_100 && (
              <li>· El puntaje oficial total suma <strong>{counts.puntaje_max_total}</strong>. Usualmente se calibra a 100.</li>
            )}
          </ul>
        </div>
      )}

      {/* Detalle: vinculación de catálogos */}
      {counts.catalogos > 0 && (
        <div className="rounded-xl border border-border bg-white p-5">
          <div className="flex items-center gap-2 font-display font-bold text-[15px] mb-3">
            <ListChecks className="w-4 h-4 text-[#14776A]" />
            Vinculación: catálogos → campos
          </div>
          <div className="space-y-2">
            {Object.entries(catalogo_usage).map(([catId, usos]) => (
              <div key={catId} className="flex items-start gap-3 text-[13px]">
                <Badge tone="info">catálogo</Badge>
                <span className="font-semibold text-[#1A1F2C] min-w-[140px]">
                  {(data.catalogos_by_id && data.catalogos_by_id[catId]) || catId.slice(0, 8)}
                </span>
                <span className="text-muted-foreground">→ usado por</span>
                <div className="flex flex-wrap gap-1.5">
                  {usos.length === 0
                    ? <span className="text-xs italic text-[#9CA3AF]">ningún campo aún</span>
                    : usos.map((u) => <Badge key={u.campo_id} tone="muted">{u.nombre_visible}</Badge>)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detalle: orden de desempates */}
      {desempate_refs.length > 0 && (
        <div className="rounded-xl border border-border bg-white p-5">
          <div className="flex items-center gap-2 font-display font-bold text-[15px] mb-3">
            <Trophy className="w-4 h-4 text-[#B45309]" />
            Orden de desempate aplicado al ranking
          </div>
          <ol className="space-y-2 text-[13px]">
            {desempate_refs.map((d, i) => (
              <li key={d.id} className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-[#FFFBEB] text-[#B45309] font-bold text-xs grid place-items-center border border-[#FDE68A]">{i + 1}</span>
                <span className="font-semibold">{d.nombre}</span>
                <span className="text-muted-foreground">→ se resuelve por</span>
                <Badge tone={d.referencia.fuente === "criterio" ? "warning" : d.referencia.fuente === "campo" ? "info" : "muted"}>
                  {d.referencia.fuente}: {d.referencia.label}
                </Badge>
              </li>
            ))}
          </ol>
        </div>
      )}

      {!has_data && (
        <div className="rounded-xl border border-dashed border-border bg-white p-10 text-center">
          <FileText className="w-9 h-9 mx-auto text-[#9CA3AF] mb-3" />
          <div className="font-display font-bold text-[16px]">Esta convocatoria aún no tiene configuración</div>
          <p className="text-[13px] text-[#5E6878] mt-2 max-w-md mx-auto">
            Comienza creando los campos del formulario o clona la configuración desde otra convocatoria.
          </p>
        </div>
      )}
    </div>
  );
}

function FlowCard({ icon: Icon, color, title, count, subtitle, flowTo, onClick, testId }) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className="text-left rounded-xl border border-border bg-white p-4 hover:border-[#14776A] hover:shadow-card transition-all"
    >
      <div className="flex items-center justify-between">
        <div className="w-9 h-9 rounded-lg grid place-items-center" style={{ background: `${color}15`, color }}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="text-3xl font-display font-extrabold tabular-nums" style={{ color }}>{count}</div>
      </div>
      <div className="font-display font-bold text-[15px] mt-2">{title}</div>
      <div className="text-[12px] text-[#5E6878] mt-1 leading-snug">{subtitle}</div>
      <div className="text-[11px] text-[#14776A] mt-3 font-semibold">→ {flowTo}</div>
    </button>
  );
}
