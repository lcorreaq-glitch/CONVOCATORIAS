import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldCheck, ArrowRight, KeyRound, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) setError("Falta el token de recuperación en la URL.");
  }, [token]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) { setError("La contraseña debe tener al menos 6 caracteres."); return; }
    if (password !== confirm) { setError("Las contraseñas no coinciden."); return; }
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, new_password: password });
      setDone(true);
      toast.success("Contraseña actualizada. Ya puedes iniciar sesión.");
      setTimeout(() => navigate("/login"), 1800);
    } catch (err) {
      setError(err.response?.data?.detail || "No se pudo actualizar la contraseña.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-soft-mesh flex flex-col">
      <header className="px-6 lg:px-12 py-5 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-[#14776A] flex items-center justify-center shadow-sm">
          <span className="font-display font-extrabold text-white text-lg leading-none">K</span>
        </div>
        <div className="leading-tight">
          <div className="font-display font-extrabold text-[18px] tracking-tight text-[#1A1F2C]">KRINOS</div>
          <div className="text-[10.5px] uppercase tracking-[0.15em] text-[#5E6878] font-semibold">by ELEA</div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="bg-white rounded-2xl border border-[#E2E7EC] shadow-card p-8 lg:p-10 max-w-[460px] w-full">
          <div className="text-[11px] uppercase tracking-[0.16em] font-bold text-[#14776A] mb-2 flex items-center gap-2">
            <KeyRound className="w-3.5 h-3.5" /> Recuperación de contraseña
          </div>
          <h1 className="font-display font-extrabold text-[28px] tracking-tight text-[#1A1F2C] leading-tight">
            Crear nueva contraseña
          </h1>

          {done ? (
            <div className="mt-7 bg-emerald-50 border-l-4 border-emerald-500 p-4 rounded-r-lg" data-testid="reset-success">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5" />
                <div>
                  <div className="font-semibold text-emerald-900">Contraseña actualizada</div>
                  <p className="text-[13px] text-emerald-800 mt-1">Te llevaremos al login en un momento…</p>
                </div>
              </div>
              <Link to="/login" className="mt-4 inline-flex items-center gap-1 text-[#14776A] hover:underline text-[13px] font-semibold">
                Ir al login <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-5 mt-7">
              <p className="text-[#5E6878] text-[13.5px] -mt-3">
                Ingresa tu nueva contraseña. Debe tener al menos 6 caracteres.
              </p>

              <div>
                <Label className="text-[12px] font-semibold">Nueva contraseña</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoFocus
                  className="mt-1.5 h-11 rounded-lg"
                  data-testid="reset-password-new"
                />
              </div>
              <div>
                <Label className="text-[12px] font-semibold">Confirmar contraseña</Label>
                <Input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="mt-1.5 h-11 rounded-lg"
                  data-testid="reset-password-confirm"
                />
              </div>

              {error && (
                <div className="text-[13px] text-[#B42318] bg-[#FEF3F2] border border-[#FDA29B] px-3 py-2 rounded-lg flex gap-2" data-testid="reset-error">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> <span>{error}</span>
                </div>
              )}

              <Button
                type="submit"
                disabled={loading || !token}
                className="w-full h-11 rounded-lg bg-[#14776A] hover:bg-[#0F5E54] text-white font-semibold gap-2"
                data-testid="reset-submit"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                Actualizar contraseña
              </Button>

              <Link to="/login" className="text-center block text-[12.5px] text-[#5E6878] hover:text-[#14776A]">
                Volver al inicio de sesión
              </Link>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
