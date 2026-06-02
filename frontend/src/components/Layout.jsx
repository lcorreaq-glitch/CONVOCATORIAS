import React from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { TID } from "@/constants/testIds";
import { api } from "@/lib/api";
import {
  LayoutDashboard, FolderOpen, FileStack, Users, UsersRound, Workflow,
  ClipboardCheck, Trophy, FileText, BarChart3, Shield, Settings2, LogOut, ChevronRight,
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
  { to: "/ranking", label: "Ranking & Desempates", icon: Trophy, tid: TID.navRanking },
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
      if (!activeConvocatoriaId && r.data?.length) {
        setConv(r.data[0].id);
      }
    }).catch(() => {});
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen flex bg-background krinos-noise">
      {/* Sidebar */}
      <aside
        data-testid={TID.sidebar}
        className="w-64 shrink-0 border-r border-border bg-white flex flex-col"
      >
        <div className="px-5 pt-6 pb-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-[#059669] flex items-center justify-center rounded-sm">
              <span className="font-display font-black text-white text-lg leading-none">K</span>
            </div>
            <div className="leading-tight">
              <div className="font-display font-black text-[17px] tracking-tight">KRINOS</div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Decisiones transparentes</div>
            </div>
          </div>
        </div>

        <div className="px-4 py-4 border-b border-border">
          <label className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground font-display font-bold">
            Convocatoria activa
          </label>
          <Select value={activeConvocatoriaId || ""} onValueChange={setConv}>
            <SelectTrigger
              data-testid={TID.convocatoriaSelector}
              className="mt-1.5 rounded-sm border-border text-[13px] h-9"
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
        </div>

        <nav className="flex-1 overflow-y-auto py-2 px-2">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              data-testid={n.tid}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 my-0.5 rounded-sm text-[13px] transition-colors ${
                  isActive
                    ? "bg-emerald-50 text-emerald-700 font-semibold"
                    : "text-foreground/75 hover:bg-secondary hover:text-foreground"
                }`
              }
            >
              <n.icon className="w-4 h-4 stroke-[1.5]" />
              <span>{n.label}</span>
            </NavLink>
          ))}
          {user?.role === "admin_general" && (
            <NavLink
              to="/usuarios"
              data-testid={TID.navUsuarios}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 my-0.5 rounded-sm text-[13px] transition-colors ${
                  isActive
                    ? "bg-emerald-50 text-emerald-700 font-semibold"
                    : "text-foreground/75 hover:bg-secondary hover:text-foreground"
                }`
              }
            >
              <Users className="w-4 h-4 stroke-[1.5]" />
              <span>Usuarios</span>
            </NavLink>
          )}
        </nav>

        <div className="border-t border-border p-3">
          <div className="px-2 mb-2">
            <div className="text-[13px] font-semibold truncate">{user?.name}</div>
            <div className="text-[11px] text-muted-foreground truncate">
              <span className="font-mono">{user?.username}</span> · {user?.role?.replace("_", " ")}
            </div>
          </div>
          <Button
            data-testid={TID.logoutBtn}
            onClick={handleLogout}
            variant="outline"
            className="w-full h-8 rounded-sm text-[12px] gap-2 border-border hover:bg-secondary"
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
