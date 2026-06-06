/**
 * Modal de consentimiento de Habeas Data (Ley 1581 de 2012).
 *
 * Se muestra automáticamente en el primer login del JURADO cuando
 * `user.habeas_consent_required` es true (devuelto por /auth/me).
 *
 * - No se puede cerrar sin aceptar (debe marcar el checkbox y enviar).
 * - Al aceptar, se registra fecha, IP, user-agent y versión de la política.
 * - Existe un botón "Salir" que cierra sesión por si el usuario rechaza.
 */
import React, { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, ShieldCheck, AlertCircle, LogOut } from "lucide-react";
import { toast } from "sonner";

export default function HabeasDataConsent() {
  const { user, refresh, logout } = useAuth();
  const [policy, setPolicy] = useState(null);
  const [accept, setAccept] = useState(false);
  const [busy, setBusy] = useState(false);

  const required = user?.role === "jurado" && user?.habeas_consent_required === true;

  useEffect(() => {
    if (!required) return;
    api.get("/auth/habeas-consent/text").then((r) => setPolicy(r.data)).catch(() => {
      setPolicy({ version: "v1.0", texto: "No se pudo cargar la política. Intenta más tarde." });
    });
  }, [required]);

  if (!required) return null;

  const onAccept = async () => {
    if (!accept) {
      toast.error("Debes marcar la casilla de autorización para continuar.");
      return;
    }
    setBusy(true);
    try {
      await api.post("/auth/habeas-consent");
      toast.success("Autorización registrada. ¡Bienvenido(a)!");
      await refresh?.();
    } catch (e) {
      toast.error("No se pudo registrar la autorización. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  const onReject = () => {
    if (!confirm("Sin tu autorización no podemos habilitarte como jurado en esta convocatoria. ¿Deseas cerrar sesión?")) return;
    logout?.();
  };

  return (
    <Dialog open={true} onOpenChange={() => { /* bloqueado, solo se cierra con accept/reject */ }}>
      <DialogContent
        className="max-w-2xl rounded-xl p-0 overflow-hidden gap-0"
        data-testid="habeas-consent-modal"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Header */}
        <div className="bg-gradient-to-br from-[#14776A] to-[#0F5E54] text-white px-7 py-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/15 grid place-items-center backdrop-blur-sm">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10.5px] uppercase tracking-[0.18em] font-bold opacity-90">
                Acción requerida antes de continuar
              </div>
              <DialogTitle className="font-display font-extrabold text-[20px] leading-tight mt-0.5">
                Autorización de tratamiento de datos personales
              </DialogTitle>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-7 py-6 max-h-[60vh] overflow-y-auto">
          <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-lg p-3.5 flex gap-2.5 mb-5">
            <AlertCircle className="w-4 h-4 text-[#92400E] mt-0.5 shrink-0" />
            <div className="text-[12.5px] text-[#92400E] leading-snug">
              Como jurado evaluador, antes de acceder a las propuestas necesitamos tu autorización expresa para el tratamiento de tus datos personales en el marco de esta convocatoria. Es un requisito legal de la <strong>Ley 1581 de 2012</strong> (Habeas Data, Colombia).
            </div>
          </div>

          {policy ? (
            <>
              <div className="text-[10.5px] uppercase tracking-[0.16em] font-display font-bold text-[#0F5E54] mb-2">
                Texto de la autorización · Versión {policy.version}
              </div>
              <div className="bg-[#F7FAF9] border border-[#E2E7EC] rounded-lg p-4 text-[13.5px] text-[#3F4856] leading-relaxed">
                {policy.texto}
              </div>

              <div className="mt-4 text-[12px] text-[#5E6878] leading-relaxed">
                <strong>Tus derechos:</strong> conocer, actualizar, rectificar y suprimir tu información, así como revocar esta autorización en cualquier momento. Para ejercer cualquiera de estos derechos escribe a{" "}
                <a href="mailto:eleainnovacionsocial@gmail.com" className="text-[#14776A] font-semibold hover:underline">
                  eleainnovacionsocial@gmail.com
                </a>.
              </div>

              <label className="mt-5 flex items-start gap-3 cursor-pointer select-none p-3 rounded-lg border border-[#E2E7EC] hover:bg-[#F7FAF9] transition-colors" data-testid="habeas-checkbox-row">
                <Checkbox
                  checked={accept}
                  onCheckedChange={(v) => setAccept(!!v)}
                  data-testid="habeas-checkbox"
                  className="mt-0.5"
                />
                <span className="text-[13px] text-[#1A1F2C] leading-snug">
                  <strong>Sí, autorizo</strong> el tratamiento de mis datos personales en los términos descritos en el texto anterior y la política de protección de datos de ELEA Innovación Social.
                </span>
              </label>

              <div className="mt-3 text-[10.5px] text-[#5E6878] italic">
                Para tu trazabilidad: al hacer clic en "Aceptar y continuar" registraremos la fecha, tu dirección IP y la versión de esta política. Esta autorización quedará disponible para consulta del administrador de la convocatoria.
              </div>
            </>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mx-auto" />
              <div className="text-xs mt-2">Cargando política…</div>
            </div>
          )}
        </div>

        {/* Footer / Actions */}
        <DialogFooter className="px-7 py-4 border-t border-[#E2E7EC] bg-[#FAFBFC] gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onReject}
            className="rounded-lg gap-2 text-[#5E6878]"
            data-testid="habeas-reject-btn"
          >
            <LogOut className="w-4 h-4" /> Salir sin autorizar
          </Button>
          <Button
            type="button"
            onClick={onAccept}
            disabled={!accept || busy || !policy}
            className="bg-[#14776A] hover:bg-[#0F5E54] rounded-lg gap-2"
            data-testid="habeas-accept-btn"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            Aceptar y continuar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
