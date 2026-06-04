import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import {
  LayoutDashboard, FolderOpen, FileStack, Users as UsersIcon, UsersRound, Workflow,
  ClipboardCheck, Trophy, FileText, BarChart3, Shield, Settings2, Sparkles,
  ChevronRight, CheckCircle2, ArrowRight, Settings, User,
  KeyRound, Mail, ShieldCheck, RefreshCw,
} from "lucide-react";

// Mapa módulo → icono representativo
const MODULE_ICONS = {
  dashboard: LayoutDashboard,
  convocatorias: FolderOpen,
  configuracion: Settings2,
  campos: Settings,
  catalogos: FileStack,
  criterios: ClipboardCheck,
  desempates: Workflow,
  propuestas: FileStack,
  jurados: UsersIcon,
  ternas: UsersRound,
  asignaciones: Workflow,
  evaluaciones: ClipboardCheck,
  ranking: Trophy,
  actas: FileText,
  reportes: BarChart3,
  auditoria: Shield,
  administracion: Settings2,
  usuarios: UsersIcon,
  roles: Shield,
  sistema: RefreshCw,
  settings: Settings,
  ia: Sparkles,
  email: Mail,
  mi_perfil: User,
};

const ACTION_LABELS = {
  view: "Ver", create: "Crear", edit: "Editar", delete: "Eliminar",
  evaluate: "Evaluar", sign: "Firmar", reopen: "Reabrir",
  generate: "Generar", approve: "Aprobar", export: "Exportar",
  import: "Importar", configure: "Configurar", use: "Usar",
  send: "Enviar", reset: "Resetear", seed: "Inicializar",
  auto: "Automático", send_welcome: "Enviar bienvenida",
  reset_password: "Resetear contraseña",
};

/**
 * Modal de onboarding que se muestra UNA vez por usuario tras login.
 * Le presenta su rol, los módulos a los que tiene acceso y un resumen de acciones.
 */
export default function WelcomeOnboarding() {
  const { user, permissions } = useAuth();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [catalog, setCatalog] = useState([]);
  const [roleInfo, setRoleInfo] = useState(null);

  const storageKey = user ? `krinos_onboarding_${user.id}_v1` : null;

  useEffect(() => {
    if (!user || !user.id) return;
    if (localStorage.getItem(storageKey)) return;  // Ya vio el onboarding
    // Cargar catálogo de módulos + info del rol del usuario
    Promise.all([
      api.get("/permissions/catalog").catch(() => ({ data: { modules: [] } })),
      api.get(`/permissions/roles/${user.role}`).catch(() => ({ data: null })),
    ]).then(([cat, role]) => {
      setCatalog(cat.data.modules || []);
      setRoleInfo(role.data);
      setOpen(true);
    });
  }, [user, storageKey]);

  const close = () => {
    if (storageKey) localStorage.setItem(storageKey, "1");
    setOpen(false);
    setStep(0);
  };

  if (!user || !user.id) return null;

  // Calcular módulos accesibles agrupados
  const accessibleModules = catalog
    .filter((m) => (permissions[m.code] || []).length > 0)
    .map((m) => ({
      ...m,
      grantedActions: permissions[m.code] || [],
    }));

  // Separar por tipo (visualmente)
  const navigationModules = accessibleModules.filter((m) =>
    ["dashboard", "convocatorias", "configuracion", "propuestas", "jurados", "ternas",
     "asignaciones", "evaluaciones", "ranking", "actas", "reportes", "auditoria",
     "administracion"].includes(m.code) && (m.grantedActions.includes("view"))
  );

  const totalActions = Object.values(permissions).reduce((acc, v) => acc + v.length, 0);

  const steps = [
    {
      // Paso 1 — Bienvenida personalizada
      content: (
        <div className="text-center py-4">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#14776A] to-[#0F5E54] text-white grid place-items-center mx-auto mb-4 shadow-lg">
            <Sparkles className="w-10 h-10" />
          </div>
          <h2 className="font-display font-extrabold text-[24px] tracking-tight">
            ¡Bienvenido(a), {user.name?.split(" ")[0] || user.username}!
          </h2>
          <p className="text-[#5E6878] mt-2 text-[14px] max-w-md mx-auto">
            Has ingresado a <strong className="text-[#1A1F2C]">KRINOS</strong>, la plataforma de gestión de convocatorias de ELEA.
          </p>
          <div className="mt-5 inline-flex items-center gap-2 bg-[#F0F7F5] border border-[#CDE7E1] text-[#0F5E54] px-4 py-2 rounded-full text-[13px] font-semibold">
            <ShieldCheck className="w-4 h-4" /> Tu rol: {roleInfo?.name || user.role}
          </div>
          {roleInfo?.description && (
            <p className="text-[12.5px] text-[#5E6878] mt-3 italic max-w-md mx-auto">{roleInfo.description}</p>
          )}
        </div>
      ),
    },
    {
      // Paso 2 — Módulos accesibles (sidebar)
      content: (
        <div>
          <div className="text-center mb-5">
            <h2 className="font-display font-extrabold text-[20px] tracking-tight">Tus accesos en la barra lateral</h2>
            <p className="text-[13px] text-[#5E6878] mt-1">
              Puedes ingresar a {navigationModules.length} módulo{navigationModules.length === 1 ? "" : "s"} del menú principal.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 max-h-[400px] overflow-y-auto">
            {navigationModules.length === 0 ? (
              <div className="col-span-2 p-6 text-center text-[#5E6878] border border-dashed border-border rounded-lg">
                Tu rol no tiene módulos asignados en la barra lateral. Contacta al administrador.
              </div>
            ) : navigationModules.map((m) => {
              const Icon = MODULE_ICONS[m.code] || FileStack;
              return (
                <div key={m.code} className="border border-[#E2E7EC] rounded-lg p-3 bg-white hover:border-[#14776A] transition-colors">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-md bg-[#F0F7F5] grid place-items-center shrink-0">
                      <Icon className="w-4 h-4 text-[#14776A]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-[13px] text-[#1A1F2C] truncate">{m.label}</div>
                      <div className="text-[10.5px] text-[#5E6878] truncate">
                        {m.grantedActions.length} acción{m.grantedActions.length === 1 ? "" : "es"}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ),
    },
    {
      // Paso 3 — Acciones disponibles por módulo
      content: (
        <div>
          <div className="text-center mb-4">
            <h2 className="font-display font-extrabold text-[20px] tracking-tight">¿Qué puedes hacer?</h2>
            <p className="text-[13px] text-[#5E6878] mt-1">
              {totalActions} permisos activos en {accessibleModules.length} módulo(s).
            </p>
          </div>
          <div className="max-h-[420px] overflow-y-auto space-y-2 pr-1">
            {accessibleModules.map((m) => {
              const Icon = MODULE_ICONS[m.code] || FileStack;
              return (
                <div key={m.code} className="border border-[#E2E7EC] rounded-lg p-3 bg-white">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-md bg-[#F0F7F5] grid place-items-center shrink-0 mt-0.5">
                      <Icon className="w-4 h-4 text-[#14776A]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-[13px] text-[#1A1F2C]">{m.label}</div>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {m.grantedActions.map((a) => (
                          <span key={a} className="px-2 py-0.5 bg-[#E8F3F0] text-[#0F5E54] text-[10.5px] font-semibold rounded-md border border-[#CDE7E1]">
                            {ACTION_LABELS[a] || a}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ),
    },
    {
      // Paso 4 — Consejos rápidos
      content: (
        <div>
          <div className="text-center mb-5">
            <CheckCircle2 className="w-14 h-14 text-[#14776A] mx-auto mb-3" />
            <h2 className="font-display font-extrabold text-[22px] tracking-tight">¡Listo para empezar!</h2>
          </div>
          <div className="space-y-2.5">
            <div className="bg-[#F0F7F5] border-l-4 border-[#14776A] rounded-r-md p-3">
              <div className="flex gap-2.5">
                <User className="w-4 h-4 text-[#14776A] mt-0.5 shrink-0" />
                <div className="text-[13px]">
                  <strong className="text-[#1A1F2C]">Personaliza tu perfil</strong>
                  <p className="text-[#5E6878] mt-0.5">Sube tu foto y, si eres jurado, configura tu firma digital para las actas.</p>
                </div>
              </div>
            </div>
            <div className="bg-[#F0F7F5] border-l-4 border-[#14776A] rounded-r-md p-3">
              <div className="flex gap-2.5">
                <KeyRound className="w-4 h-4 text-[#14776A] mt-0.5 shrink-0" />
                <div className="text-[13px]">
                  <strong className="text-[#1A1F2C]">Cambia tu contraseña</strong>
                  <p className="text-[#5E6878] mt-0.5">Si tu contraseña fue temporal, cámbiala en <em>Mi Perfil</em>.</p>
                </div>
              </div>
            </div>
            <div className="bg-amber-50 border-l-4 border-amber-400 rounded-r-md p-3">
              <div className="flex gap-2.5">
                <ShieldCheck className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
                <div className="text-[13px]">
                  <strong className="text-[#1A1F2C]">¿No ves un módulo que esperabas?</strong>
                  <p className="text-[#5E6878] mt-0.5">Tu administrador puede ajustar los permisos de tu rol en cualquier momento.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ),
    },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="rounded-2xl max-w-2xl" data-testid="welcome-onboarding">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="font-display flex items-center gap-2 text-[13px] uppercase tracking-[0.14em] font-bold text-[#14776A]">
              <Sparkles className="w-4 h-4" /> Onboarding KRINOS · {step + 1}/{steps.length}
            </DialogTitle>
            <div className="flex gap-1">
              {steps.map((_, i) => (
                <div key={i} className={`h-1.5 rounded-full transition-all ${i === step ? "w-8 bg-[#14776A]" : i < step ? "w-4 bg-[#14776A]" : "w-4 bg-[#E2E7EC]"}`} />
              ))}
            </div>
          </div>
        </DialogHeader>
        <div className="min-h-[320px]">{steps[step].content}</div>
        <DialogFooter className="gap-2 sm:gap-2">
          {step > 0 && (
            <Button variant="outline" onClick={() => setStep((s) => s - 1)} className="rounded-lg" data-testid="onboarding-prev">
              Anterior
            </Button>
          )}
          {step === 0 && (
            <Button variant="outline" onClick={close} className="rounded-lg" data-testid="onboarding-skip">
              Saltar
            </Button>
          )}
          {step < steps.length - 1 ? (
            <Button onClick={() => setStep((s) => s + 1)} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-lg gap-2" data-testid="onboarding-next">
              Siguiente <ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button onClick={close} className="bg-[#14776A] hover:bg-[#0F5E54] rounded-lg gap-2" data-testid="onboarding-finish">
              Comenzar <ArrowRight className="w-4 h-4" />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
