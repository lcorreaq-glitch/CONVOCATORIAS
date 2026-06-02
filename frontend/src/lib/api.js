import axios from "axios";

const BACKEND = process.env.REACT_APP_BACKEND_URL;
export const API_BASE = `${BACKEND}/api`;

export const api = axios.create({
  baseURL: API_BASE,
});

// Attach Bearer token from localStorage on every request
api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem("krinos_token");
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

api.interceptors.response.use(
  (r) => r,
  (err) => Promise.reject(err)
);

export function setToken(t) {
  if (t) localStorage.setItem("krinos_token", t);
  else localStorage.removeItem("krinos_token");
}

export async function downloadFile(path, suggestedName = "download.bin") {
  const t = localStorage.getItem("krinos_token");
  const res = await fetch(`${API_BASE}${path}`, {
    headers: t ? { Authorization: `Bearer ${t}` } : {},
  });
  if (!res.ok) throw new Error(`Descarga falló (${res.status})`);
  const blob = await res.blob();
  const cd = res.headers.get("content-disposition") || "";
  const m = cd.match(/filename="?([^";]+)"?/i);
  const filename = m ? m[1] : suggestedName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  a.remove(); URL.revokeObjectURL(url);
}

export async function openPdf(path) {
  const t = localStorage.getItem("krinos_token");
  const res = await fetch(`${API_BASE}${path}`, {
    headers: t ? { Authorization: `Bearer ${t}` } : {},
  });
  if (!res.ok) throw new Error(`PDF no disponible (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function formatApiError(detail) {
  if (detail == null) return "Algo salió mal. Intenta de nuevo.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail
      .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}
