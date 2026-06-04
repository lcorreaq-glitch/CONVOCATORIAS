import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, formatApiError, setToken } from "@/lib/api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null=checking, false=anon, obj=logged
  const [permissions, setPermissions] = useState({}); // { module: [actions] }
  const [activeConvocatoriaId, setActiveConvocatoriaId] = useState(
    localStorage.getItem("krinos_conv_id") || null
  );

  const loadPermissions = useCallback(async () => {
    try {
      const { data } = await api.get("/permissions/me");
      setPermissions(data.permissions || {});
    } catch {
      setPermissions({});
    }
  }, []);

  const refresh = useCallback(async () => {
    const token = localStorage.getItem("krinos_token");
    if (!token) { setUser(false); setPermissions({}); return; }
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
      await loadPermissions();
    } catch {
      setToken(null);
      setUser(false);
      setPermissions({});
    }
  }, [loadPermissions]);

  useEffect(() => { refresh(); }, [refresh]);

  const login = async (username, password) => {
    try {
      const { data } = await api.post("/auth/login", { username, password });
      if (data?.access_token) setToken(data.access_token);
      setUser(data);
      await loadPermissions();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: formatApiError(e.response?.data?.detail) || e.message };
    }
  };

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch (e) {
      console.warn("Logout server-side failed:", e?.message);
    }
    setToken(null);
    setUser(false);
    setPermissions({});
  };

  const setConv = (id) => {
    if (id) localStorage.setItem("krinos_conv_id", id);
    else localStorage.removeItem("krinos_conv_id");
    setActiveConvocatoriaId(id);
  };

  /**
   * Verifica si el usuario tiene permiso para una acción específica en un módulo.
   * Por defecto chequea "view".
   * @param {string} module — código del módulo (ej. "propuestas")
   * @param {string} action — acción (default: "view")
   */
  const can = useCallback((module, action = "view") => {
    if (!user) return false;
    // Atajos: admin_general siempre puede TODO (defensivo)
    if (user.role === "admin_general") return true;
    const acts = permissions[module] || [];
    return acts.includes(action);
  }, [user, permissions]);

  return (
    <AuthCtx.Provider value={{
      user, permissions, login, logout, refresh, can,
      activeConvocatoriaId, setConv, reloadPermissions: loadPermissions,
    }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
