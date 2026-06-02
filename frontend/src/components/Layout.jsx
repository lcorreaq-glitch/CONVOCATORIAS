import React from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { TID } from "@/constants/testIds";
import { api } from "@/lib/api";
import {
  LayoutDashboard, FolderOpen, FileStack, Users, UsersRound, Workflow,
  ClipboardCheck, Trophy, FileText, BarChart3, Shield, Settings2, LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, tid: TID.navDashboard, end: true },
  { to: "/convocatorias", label: "Convocatorias", icon: FolderOpen, tid: TID.navConvocatorias },
  { to: "/configuracion", label: "Configuración", icon: Settings2, tid: TID.navConfig },
  { to: "/propuestas", label: "Propuestas", icon: FileStack, tid: TID.navPropuestas },
  { to: "/jurados", label: "Jurados", icon: Users, tid: TID.navJurados },
  { to: "/ternas", label: "Ternas / Grupos", icon: UsersRound, tid: TID.navTernas },
  { to: "/asignaciones", label: "Asignaciones", icon: Workflow, tid: TID.navAsignaciones },
  { to: "/evaluaciones", label: "Evaluaciones", icon: ClipboardCheck, tid: TID.navEvaluaciones },
  { to: "/ranking", label: "Ranking & Resultados", icon: Trophy, tid: TID.navRanking },
  { to: "/actas", label: "Actas", icon: FileText, tid: TID.navActas },
  { to: "/reportes", label: "Reportes", icon: BarChart3, tid: TID.navReportes },
  { to: "/auditoria", label: "Auditoría", icon: Shield, tid: TID.navAuditoria },
];

export default function Layout() {
  const { user, logout, activeConvocatoriaId, setConv } = useAuth();
  const navigate = useNavigate();
  const [convs, setConvs] = React.useState([]);

  React.useEffect(() => {
    api.get("/convocatorias").then((r) => {
      setConvs(r.data || []);
      if (!activeConvocatoriaId && r.data?.length) setConv(r.data[0].id);
    }).catch(() => {});
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const activeConv = convs.find((c) => c.id === activeConvocatoriaId);
  const entidad = activeConv?.entidades?.[0]?.nombre;

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside
        data-testid={TID.sidebar}
        className="w-[260px] shrink-0 border-r border-border bg-white flex flex-col"
      >
        {/* Brand */}
        <div className="px-5 pt-6 pb-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#14776A] flex items-center justify-center shadow-sm">
              <span className="font-display font-extrabold text-white text-lg leading-none">K</span>
            </div>
            <div className="leading-tight">
              <div className="font-display font-extrabold text-[18px] tracking-tight text-[#1A1F2C]">KRINOS</div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-[#5E6878] font-semibold">by ELEA</div>
            </div>
          </div>
          <p className="mt-3 text-[11.5px] text-[#5E6878] leading-snug">
            Plataforma Inteligente para Convocatorias y Evaluación
          </p>
        </div>

        {/* Context block */}
        <div className="px-5 py-4 border-b border-border bg-[#F7F9FB]">
          <label className="text-[10px] uppercase tracking-[0.14em] text-[#5E6878] font-display font-bold">
            Convocatoria activa
          </label>
          <Select value={activeConvocatoriaId || ""} onValueChange={setConv}>
            <SelectTrigger
              data-testid={TID.convocatoriaSelector}
              className="mt-1.5 rounded-lg border-border bg-white text-[13px] h-10 font-medium"
            >
              <SelectValue placeholder="Selecciona…" />
            </SelectTrigger>
            <SelectContent>
              {convs.map((c) => (
                <SelectItem key={c.id} value={c.id} className="text-[13px]">
                  <span className="font-mono text-[11px] text-muted-foreground mr-1.5">{c.codigo}</span>
                  {c.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {entidad && (
            <div className="mt-3 pt-2.5 border-t border-border">
              <div className="text-[9.5px] uppercase tracking-[0.14em] text-[#5E6878] font-display font-bold mb-0.5">
                Entidad
              </div>
              <div className="text-[12px] font-semibold text-[#1A1F2C] leading-tight">{entidad}</div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-3">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              data-testid={n.tid}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 my-0.5 rounded-lg text-[13px] transition-colors ${
                  isActive
                    ? "bg-[#E8F3F0] text-[#0F5E54] font-semibold"
                    : "text-[#3F4856] hover:bg-[#F1F4F7] hover:text-[#1A1F2C]"
                }`
              }
            >
              <n.icon className="w-[18px] h-[18px] stroke-[1.6]" />
              <span>{n.label}</span>
            </NavLink>
          ))}
          {user?.role === "admin_general" && (
            <>
              <NavLink
                to="/administracion"
                data-testid="nav-administracion"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 my-0.5 rounded-lg text-[13px] transition-colors ${
                    isActive
                      ? "bg-[#E8F3F0] text-[#0F5E54] font-semibold"
                      : "text-[#3F4856] hover:bg-[#F1F4F7] hover:text-[#1A1F2C]"
                  }`
                }
              >
                <Settings2 className="w-[18px] h-[18px] stroke-[1.6]" />
                <span>Administración</span>
              </NavLink>
              <NavLink
                to="/usuarios"
                data-testid={TID.navUsuarios}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 my-0.5 rounded-lg text-[13px] transition-colors ${
                    isActive
                      ? "bg-[#E8F3F0] text-[#0F5E54] font-semibold"
                      : "text-[#3F4856] hover:bg-[#F1F4F7] hover:text-[#1A1F2C]"
                  }`
                }
              >
                <Users className="w-[18px] h-[18px] stroke-[1.6]" />
                <span>Usuarios</span>
              </NavLink>
            </>
          )}
        </nav>

        {/* User block */}
        <div className="border-t border-border p-4 bg-[#F7F9FB]">
          <NavLink
            to="/mi-perfil"
            data-testid="nav-mi-perfil"
            className={({ isActive }) =>
              `flex items-center gap-3 mb-3 -mx-1 px-1 py-1 rounded-lg ${isActive ? "bg-[#E8F3F0]" : "hover:bg-[#F1F4F7]"}`
            }
            title="Mi perfil"
          >
            <div className="w-9 h-9 rounded-full bg-[#E8F3F0] flex items-center justify-center text-[#0F5E54] font-display font-extrabold text-[13px]">
              {(user?.name || "?").charAt(0)}
            </div>
            <div className="leading-tight min-w-0 flex-1">
              <div className="text-[13px] font-semibold truncate text-[#1A1F2C]">{user?.name}</div>
              <div className="text-[11px] text-[#5E6878] truncate capitalize">
                {user?.role?.replace(/_/g, " ")}
              </div>
            </div>
          </NavLink>
          <Button
            data-testid={TID.logoutBtn}
            onClick={handleLogout}
            variant="outline"
            className="w-full h-9 rounded-lg text-[12.5px] gap-2 border-border bg-white hover:bg-[#F1F4F7]"
          >
            <LogOut className="w-3.5 h-3.5" /> Cerrar sesión
          </Button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 flex flex-col">
        <Outlet />
      </main>
    </div>
  );
}
