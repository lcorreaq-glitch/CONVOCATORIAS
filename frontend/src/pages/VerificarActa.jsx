import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ShieldCheck, ShieldAlert, Loader2, Calendar, FileBadge2, Award, ExternalLink } from "lucide-react";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const TIPO_LABEL = {
  individual: "Acta Individual de Jurado",
  colectiva: "Acta Colectiva de Terna",
  subregional: "Acta Subregional",
};

/**
 * Página pública (sin autenticación) para verificar la autenticidad de una acta
 * mediante el código impreso en el PDF o el QR escaneado.
 */
export default function VerificarActa() {
  const { codigo } = useParams();
  const [estado, setEstado] = useState("cargando");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancel = false;
    async function fetch() {
      try {
        const r = await axios.get(`${BACKEND_URL}/api/actas/verificar/${codigo}`);
        if (cancel) return;
        setData(r.data);
        setEstado("valida");
      } catch (e) {
        if (cancel) return;
        setError(e.response?.data?.detail || "Acta no encontrada o código inválido");
        setEstado("invalida");
      }
    }
    fetch();
    return () => { cancel = true; };
  }, [codigo]);

  return (
    <div className="min-h-screen bg-[#F7FAF9] flex items-center justify-center p-6">
      <div className="w-full max-w-2xl bg-white border border-border rounded-xl shadow-lg overflow-hidden" data-testid="verificar-acta-card">
        <div className="px-8 pt-8 pb-4 border-b border-border bg-gradient-to-br from-[#0F5E54] to-[#14776A] text-white">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] font-display font-bold opacity-80 mb-1">
            <FileBadge2 className="w-3.5 h-3.5" /> Verificación pública de actas — KRINOS
          </div>
          <h1 className="font-display text-[26px] font-bold leading-tight">
            Validador de actas institucionales
          </h1>
          <p className="text-[12.5px] opacity-90 mt-1">
            Comprueba la autenticidad y trazabilidad de una acta emitida por la plataforma.
          </p>
        </div>

        <div className="p-8">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Código verificado</div>
          <div className="font-mono text-[20px] tracking-[0.18em] font-bold text-[#0F5E54] mb-6" data-testid="verificar-codigo">{codigo}</div>

          {estado === "cargando" && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Consultando la plataforma…
            </div>
          )}

          {estado === "invalida" && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-5 flex items-start gap-3" data-testid="verificar-error">
              <ShieldAlert className="w-6 h-6 text-red-500 mt-0.5 shrink-0" />
              <div>
                <h3 className="font-display font-bold text-red-800 text-[15px] mb-1">Acta no verificada</h3>
                <p className="text-[13px] text-red-700 leading-relaxed">
                  {error}. El código puede haber sido transcrito incorrectamente. Verifica que coincida con el que aparece junto al QR del PDF original.
                </p>
              </div>
            </div>
          )}

          {estado === "valida" && data && (
            <div className="space-y-4" data-testid="verificar-valida">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 flex items-start gap-3">
                <ShieldCheck className="w-7 h-7 text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <h3 className="font-display font-bold text-emerald-800 text-[15px] mb-1">
                    Acta auténtica y registrada en KRINOS
                  </h3>
                  <p className="text-[12.5px] text-emerald-700">
                    Esta acta fue emitida por la plataforma con los datos que se muestran a continuación.
                  </p>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <Field icon={Award} label="Tipo de acta" value={TIPO_LABEL[data.tipo] || data.tipo} />
                <Field icon={Calendar} label="Emisión inicial" value={fmtDate(data.emitida_inicialmente)} />
                <Field icon={Calendar} label="Última emisión" value={fmtDate(data.ultima_emision)} />
                <Field icon={FileBadge2} label="Convocatoria" value={`${data.convocatoria?.codigo || "—"} · ${data.convocatoria?.nombre || ""}`} />
              </div>

              {data.meta && Object.keys(data.meta).length > 0 && (
                <div className="rounded-lg border border-border bg-[#F7FAF9] p-4">
                  <div className="text-[11px] uppercase tracking-wide font-display font-bold text-[#14776A] mb-2">Metadatos del acta</div>
                  <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-[12.5px]">
                    {Object.entries(data.meta).map(([k, v]) => (
                      <React.Fragment key={k}>
                        <dt className="text-muted-foreground capitalize">{k.replace(/_/g, " ")}</dt>
                        <dd className="font-mono text-[12px] text-foreground">{Array.isArray(v) ? v.join(", ") : String(v)}</dd>
                      </React.Fragment>
                    ))}
                  </dl>
                </div>
              )}
            </div>
          )}

          <div className="border-t border-border mt-8 pt-5 text-center text-[11px] text-muted-foreground">
            <Link to="/login" className="inline-flex items-center gap-1 hover:text-[#14776A] hover:underline">
              <ExternalLink className="w-3 h-3" /> Ingresar a KRINOS
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ icon: Icon, label, value }) {
  return (
    <div className="border border-border rounded-lg p-3 bg-white">
      <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-wide font-display font-bold text-muted-foreground mb-1">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className="text-[13px] font-semibold text-[#1A1F2C] break-words">{value || "—"}</div>
    </div>
  );
}

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
  } catch (_) { return iso; }
}
