import React, { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { TID } from "@/constants/testIds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, Loader2 } from "lucide-react";

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const r = await login(username.trim(), password);
    setLoading(false);
    if (r.ok) navigate("/");
    else setError(r.error);
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-[42%_58%] bg-background">
      {/* Left graphic side - 42% */}
      <div className="relative bg-[#09090B] text-white p-10 lg:p-14 flex flex-col justify-between krinos-noise overflow-hidden">
        <div className="absolute inset-0 opacity-30">
          <svg className="w-full h-full" viewBox="0 0 600 800" preserveAspectRatio="xMidYMid slice">
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#27272a" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="600" height="800" fill="url(#grid)" />
            <circle cx="120" cy="260" r="180" fill="none" stroke="#059669" strokeWidth="1.5" />
            <circle cx="120" cy="260" r="120" fill="none" stroke="#059669" strokeWidth="1" opacity="0.6" />
            <circle cx="120" cy="260" r="60" fill="#059669" opacity="0.15" />
            <line x1="0" y1="500" x2="600" y2="500" stroke="#27272a" strokeWidth="1" />
            <rect x="380" y="540" width="180" height="180" fill="none" stroke="#059669" strokeWidth="1.5" />
            <rect x="420" y="580" width="100" height="100" fill="#059669" opacity="0.2" />
            <text x="40" y="780" fill="#52525b" fontFamily="IBM Plex Mono" fontSize="10">
              KRINOS · κρίνω · juzgar / discernir
            </text>
          </svg>
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-emerald-600 flex items-center justify-center rounded-sm">
              <span className="font-display font-black text-white text-2xl leading-none">K</span>
            </div>
            <div>
              <div className="font-display font-black text-2xl tracking-tight">KRINOS</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-400">
                Plataforma institucional
              </div>
            </div>
          </div>
        </div>
        <div className="relative z-10 max-w-md">
          <h1 className="font-display font-black text-3xl lg:text-5xl leading-[1.05] tracking-tight">
            Tecnología que impulsa decisiones <span className="text-emerald-400">transparentes</span>.
          </h1>
          <p className="mt-6 text-zinc-400 text-sm leading-relaxed max-w-[28rem]">
            Plataforma parametrizable para convocatorias, evaluaciones, jurados, rankings y actas.
            Trazabilidad completa, formularios configurables y auditoría institucional.
          </p>
        </div>
        <div className="relative z-10 flex items-center gap-6 text-[11px] text-zinc-500 font-mono uppercase tracking-wider">
          <span>v 1.0.0</span>
          <span className="w-px h-3 bg-zinc-700" />
          <span>Gobernación de Antioquia · Incentivos 2026</span>
        </div>
      </div>

      {/* Right form side - 58% */}
      <div className="flex items-center px-8 lg:px-20 py-12 bg-white">
        <div className="w-full max-w-sm">
          <div className="mb-10">
            <div className="text-[11px] uppercase tracking-[0.18em] text-emerald-700 font-display font-bold mb-2">
              Acceso institucional
            </div>
            <h2 className="font-display font-black text-3xl lg:text-4xl tracking-tight">
              Iniciar sesión
            </h2>
            <p className="text-muted-foreground text-sm mt-2">
              Usa tu cuenta institucional para acceder a la plataforma.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-5">
            <div>
              <Label htmlFor="username" className="text-[11px] uppercase tracking-wider font-display font-bold text-foreground">
                Usuario o correo
              </Label>
              <Input
                id="username"
                data-testid={TID.loginUsername}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="lcorreaq"
                autoComplete="username"
                required
                className="mt-1.5 h-11 rounded-sm border-border focus-visible:ring-emerald-600"
              />
            </div>
            <div>
              <Label htmlFor="password" className="text-[11px] uppercase tracking-wider font-display font-bold text-foreground">
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
                className="mt-1.5 h-11 rounded-sm border-border focus-visible:ring-emerald-600"
              />
            </div>

            {error && (
              <div data-testid={TID.loginError} className="text-[12px] text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-sm">
                {error}
              </div>
            )}

            <Button
              type="submit"
              data-testid={TID.loginSubmit}
              disabled={loading}
              className="w-full h-11 rounded-sm bg-[#059669] hover:bg-[#047857] text-white font-semibold tracking-tight transition-colors group"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  Acceder
                  <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-0.5 transition-transform" />
                </>
              )}
            </Button>
          </form>

          <div className="mt-10 pt-6 border-t border-border text-[11px] font-mono text-muted-foreground space-y-1">
            <div>Credenciales demo: <span className="text-foreground">lcorreaq</span> / <span className="text-foreground">Chocolate2026!</span></div>
            <div className="text-muted-foreground/80">Rol semilla: administrador general</div>
          </div>
        </div>
      </div>
    </div>
  );
}
