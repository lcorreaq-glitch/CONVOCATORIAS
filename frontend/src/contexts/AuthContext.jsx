import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, formatApiError, setToken } from "@/lib/api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null=checking, false=anon, obj=logged
  const [activeConvocatoriaId, setActiveConvocatoriaId] = useState(
    localStorage.getItem("krinos_conv_id") || null
  );

  const refresh = useCallback(async () => {
    const token = localStorage.getItem("krinos_token");
    if (!token) { setUser(false); return; }
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch {
      setToken(null);
      setUser(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = async (username, password) => {
    try {
      const { data } = await api.post("/auth/login", { username, password });
      if (data?.access_token) setToken(data.access_token);
      setUser(data);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: formatApiError(e.response?.data?.detail) || e.message };
    }
  };

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch {}
    setToken(null);
    setUser(false);
  };

  const setConv = (id) => {
    if (id) localStorage.setItem("krinos_conv_id", id);
    else localStorage.removeItem("krinos_conv_id");
    setActiveConvocatoriaId(id);
  };

  return (
    <AuthCtx.Provider value={{ user, login, logout, refresh, activeConvocatoriaId, setConv }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
