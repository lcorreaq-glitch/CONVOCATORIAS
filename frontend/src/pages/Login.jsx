import React, { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { TID } from "@/constants/testIds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowRight, Loader2, ShieldCheck, FileSignature, Layers, Workflow, Mail, X,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { api } from "@/lib/api";

const FEATURES = [
  { icon: Layers, title: "Convocatorias parametrizables", desc: "Configura formularios, criterios y reglas sin programar." },
  { icon: Workflow, title: "Evaluación 360°", desc: "Jurados, ternas, expedientes y consolidación en un solo lugar." },
  { icon: ShieldCheck, title: "Trazabilidad total", desc: "Cada acción queda registrada con auditoría completa." },
  { icon: FileSignature, title: "Actas y reportes", desc: "Documentos oficiales con plantillas institucionales." },
];

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    const r = await login(username.trim(), password);
    setLoading(false);
    if (r.ok) navigate("/");
    else setError(r.error);
  };

  const onForgot = async (e) => {
    e.preventDefault();
    if (!forgotEmail.trim()) return;
    setForgotLoading(true);
    try {
      await api.post("/auth/forgot-password", {
        email: forgotEmail.trim(),
        base_url: window.location.origin,
      });
      setForgotSent(true);
      toast.success("Si el correo está registrado, recibirás el enlace en breve.");
    } catch (err) {
      toast.error(err.response?.data?.detail || "No se pudo enviar el correo.");
    } finally {
      setForgotLoading(false);
    }
  };

  if (user) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-soft-mesh">
      {/* Top bar */}
      <header className="px-6 lg:px-12 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#14776A] flex items-center justify-center shadow-sm">
            <span className="font-display font-extrabold text-white text-lg leading-none">K</span>
          </div>
          <div className="leading-tight">
            <div className="font-display font-extrabold text-[18px] tracking-tight text-[#1A1F2C]">KRINOS</div>
            <div className="text-[10.5px] uppercase tracking-[0.15em] text-[#5E6878] font-semibold">by ELEA</div>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-[12px] text-[#5E6878]">
          <span className="font-mono">v 1.0</span>
          <span className="w-1 h-1 rounded-full bg-[#CBD2DA]" />
          <span>Plataforma institucional</span>
        </div>
      </header>

      <main className="px-6 lg:px-12 pb-16">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-[1.05fr_1fr] gap-12 lg:gap-20 items-start mt-8 lg:mt-14">
          {/* Left: Marketing / value */}
          <div className="lg:pt-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-[#E2E7EC] text-[11px] font-semibold text-[#14776A] tracking-wide">
              <span className="w-1.5 h-1.5 rounded-full bg-[#14776A]" />
              Plataforma Inteligente para Convocatorias y Evaluación
            </div>
            <h1 className="mt-6 font-display font-extrabold text-4xl lg:text-[56px] leading-[1.05] tracking-tight text-[#1A1F2C] max-w-[18ch]">
              Convocatorias, evaluación y resultados en una sola plataforma.
            </h1>
            <p className="mt-6 text-[#5E6878] text-base lg:text-[17px] leading-relaxed max-w-[52ch]">
              Gestione propuestas, jurados, expedientes, evaluaciones y resultados con trazabilidad
              completa. Diseñada para gobernaciones, alcaldías, universidades, fundaciones,
              operadores y cámaras de comercio.
            </p>

            <div className="mt-10 grid sm:grid-cols-2 gap-3 max-w-xl">
              {FEATURES.map((f) => (
                <div key={f.title} className="bg-white rounded-xl p-4 border border-[#E2E7EC] shadow-card hover:border-[#14776A]/30 transition-colors">
                  <f.icon className="w-5 h-5 stroke-[1.6] text-[#14776A]" />
                  <div className="mt-2.5 font-display font-bold text-[14px] text-[#1A1F2C]">{f.title}</div>
                  <p className="text-[12.5px] text-[#5E6878] mt-1 leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>

            <div className="mt-10 pt-6 border-t border-[#E2E7EC] max-w-xl">
              <div className="text-[10.5px] uppercase tracking-[0.15em] font-bold text-[#5E6878] mb-2">
                Casos en operación
              </div>
              <div className="flex flex-wrap gap-2">
                {["Convocatorias públicas", "Estímulos culturales", "Becas universitarias", "Procesos de selección", "Reconocimientos"].map((c) => (
                  <span key={c} className="px-3 py-1 rounded-full bg-white border border-[#E2E7EC] text-[12px] text-[#3F4856]">{c}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Login card */}
          <div className="lg:sticky lg:top-12">
            <div className="bg-white rounded-2xl border border-[#E2E7EC] shadow-card p-8 lg:p-10 max-w-[460px] mx-auto lg:mx-0 lg:ml-auto">
              <div className="text-[11px] uppercase tracking-[0.16em] font-bold text-[#14776A] mb-2">
                Acceso a la plataforma
              </div>
              <h2 className="font-display font-extrabold text-[28px] lg:text-[34px] tracking-tight text-[#1A1F2C] leading-tight">
                Iniciar sesión
              </h2>
              <p className="text-[#5E6878] text-[14px] mt-2">
                Ingrese sus credenciales institucionales para continuar.
              </p>

              <form onSubmit={onSubmit} className="space-y-5 mt-7">
                <div>
                  <Label htmlFor="username" className="text-[12px] font-semibold text-[#1A1F2C]">
                    Usuario o correo
                  </Label>
                  <Input
                    id="username"
                    data-testid={TID.loginUsername}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="usuario.institucional"
                    autoComplete="username"
                    required
                    className="mt-1.5 h-11 rounded-lg border-[#E2E7EC] focus-visible:ring-[#14776A] focus-visible:ring-offset-0"
                  />
                </div>
                <div>
                  <Label htmlFor="password" className="text-[12px] font-semibold text-[#1A1F2C]">
                    Contraseña
                  </Label>
                  <Input
                    id="password"
                    data-testid={TID.loginPassword}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type="password"
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                    className="mt-1.5 h-11 rounded-lg border-[#E2E7EC] focus-visible:ring-[#14776A] focus-visible:ring-offset-0"
                  />
                </div>

                {error && (
                  <div data-testid={TID.loginError} className="text-[13px] text-[#B42318] bg-[#FEF3F2] border border-[#FDA29B] px-3 py-2 rounded-lg">
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  data-testid={TID.loginSubmit}
                  disabled={loading}
                  className="btn-primary w-full h-11 rounded-lg bg-[#14776A] hover:bg-[#0F5E54] text-white font-semibold group"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      Ingresar
                      <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-0.5 transition-transform" />
                    </>
                  )}
                </Button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => { setForgotOpen(true); setForgotEmail(username); setForgotSent(false); }}
                    className="text-[12.5px] text-[#14776A] hover:text-[#0F5E54] hover:underline font-semibold"
                    data-testid="login-forgot-password"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                </div>
              </form>
            </div>

            <p className="text-center text-[11.5px] text-[#5E6878] mt-5 max-w-[460px] mx-auto lg:mx-0 lg:ml-auto">
              Plataforma propiedad de <strong className="text-[#1A1F2C]">ELEA</strong>. Reutilizable y escalable para múltiples entidades y procesos.
            </p>
          </div>
        </div>
      </main>

      {/* Modal Forgot Password */}
      <Dialog open={forgotOpen} onOpenChange={(o) => { setForgotOpen(o); if (!o) setForgotSent(false); }}>
        <DialogContent className="rounded-xl max-w-md" data-testid="forgot-dialog">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Mail className="w-5 h-5 text-[#14776A]" />
              Recuperar contraseña
            </DialogTitle>
          </DialogHeader>
          {!forgotSent ? (
            <form onSubmit={onForgot} className="space-y-4">
              <p className="text-[13px] text-[#5E6878]">
                Ingresa el correo electrónico asociado a tu cuenta. Te enviaremos un enlace para restablecer tu contraseña.
                El enlace expira en <strong>1 hora</strong>.
              </p>
              <div>
                <Label className="text-[12px] font-semibold">Correo electrónico</Label>
                <Input
                  type="email"
                  required
                  autoFocus
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="correo@institucion.gov.co"
                  className="mt-1.5 h-10 rounded-lg"
                  data-testid="forgot-email-input"
                />
              </div>
              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => setForgotOpen(false)} className="rounded-lg">
                  Cancelar
                </Button>
                <Button type="submit" disabled={forgotLoading} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-lg gap-2" data-testid="forgot-submit">
                  {forgotLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                  Enviar enlace
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <div className="space-y-3 text-[13px]">
              <div className="bg-emerald-50 border-l-4 border-emerald-500 p-4 rounded-r-md text-emerald-900">
                <strong>Solicitud recibida.</strong><br />
                Si el correo está registrado en KRINOS, recibirás un enlace para restablecer tu contraseña en los próximos minutos.
              </div>
              <p className="text-[12px] text-[#5E6878]">
                ¿No te llega el correo? Revisa la carpeta de <em>spam</em> o pídele al administrador que reactive tu cuenta.
              </p>
              <DialogFooter>
                <Button onClick={() => setForgotOpen(false)} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-lg w-full">
                  Entendido
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
