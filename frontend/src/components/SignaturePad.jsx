import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { PenLine, Upload, Trash2, Check, X as XIcon } from "lucide-react";
import { toast } from "sonner";
import { api, formatApiError } from "@/lib/api";

/**
 * SignaturePad: captura firma manuscrita (canvas táctil/mouse) o por upload de imagen.
 *
 * Props:
 *  - value: string | null  (data URL de la firma actual)
 *  - onChange: (dataUrl|null) => void  (devuelve el data URL al guardar; null al borrar)
 *  - readOnly?: boolean
 *  - testIdPrefix?: string
 */
export default function SignaturePad({ value, onChange, readOnly = false, testIdPrefix = "firma" }) {
  const [mode, setMode] = useState(value ? "view" : "draw"); // view | draw | upload
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const [hasStrokes, setHasStrokes] = useState(false);

  useEffect(() => {
    if (mode === "draw") {
      const c = canvasRef.current;
      if (!c) return;
      // Ajustar resolución del canvas para alta densidad
      const rect = c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      c.width = rect.width * dpr;
      c.height = rect.height * dpr;
      const ctx = c.getContext("2d");
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#1A1F2C";
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, rect.width, rect.height);
      setHasStrokes(false);
    }
  }, [mode]);

  const getPos = (e) => {
    const c = canvasRef.current;
    const rect = c.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  };

  const start = (e) => {
    e.preventDefault();
    drawingRef.current = true;
    const { x, y } = getPos(e);
    const ctx = canvasRef.current.getContext("2d");
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const move = (e) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const { x, y } = getPos(e);
    const ctx = canvasRef.current.getContext("2d");
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasStrokes) setHasStrokes(true);
  };
  const end = () => { drawingRef.current = false; };

  const clearCanvas = () => {
    const c = canvasRef.current;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, rect.width, rect.height);
    setHasStrokes(false);
  };

  const saveDrawing = () => {
    if (!hasStrokes) { toast.error("Dibuja tu firma antes de guardar"); return; }
    const dataUrl = canvasRef.current.toDataURL("image/png");
    onChange(dataUrl);
    setMode("view");
    toast.success("Firma capturada");
  };

  const onPickFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Solo imágenes (PNG, JPG)");
      return;
    }
    const fd = new FormData(); fd.append("file", file);
    try {
      const { data } = await api.post("/upload/image", fd, { headers: { "Content-Type": "multipart/form-data" } });
      onChange(data.data_url);
      setMode("view");
      toast.success("Firma cargada");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Error al subir firma");
    }
  };

  if (readOnly) {
    return value ? (
      <div className="border border-border rounded-lg p-3 bg-white inline-block">
        <img src={value} alt="Firma" className="max-h-24 max-w-[280px] object-contain" data-testid={`${testIdPrefix}-img`} />
      </div>
    ) : (
      <div className="text-[12px] text-muted-foreground italic">Sin firma registrada</div>
    );
  }

  return (
    <div className="space-y-3" data-testid={`${testIdPrefix}-pad`}>
      {mode === "view" && value && (
        <div className="border border-border rounded-lg p-3 bg-white">
          <img src={value} alt="Firma actual" className="max-h-28 mx-auto object-contain" data-testid={`${testIdPrefix}-current`} />
          <div className="flex items-center justify-center gap-2 mt-3">
            <Button size="sm" variant="outline" onClick={() => setMode("draw")} className="gap-1.5 rounded-sm" data-testid={`${testIdPrefix}-redraw-btn`}>
              <PenLine className="w-3.5 h-3.5" /> Volver a dibujar
            </Button>
            <label className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-3 py-1.5 border border-border rounded-sm hover:bg-secondary cursor-pointer" data-testid={`${testIdPrefix}-reupload-btn`}>
              <Upload className="w-3.5 h-3.5" /> Subir imagen
              <input type="file" accept="image/*" className="hidden" onChange={onPickFile} />
            </label>
            <Button size="sm" variant="outline" onClick={() => { onChange(null); setMode("draw"); }} className="gap-1.5 rounded-sm text-red-600 border-red-200 hover:bg-red-50" data-testid={`${testIdPrefix}-clear-btn`}>
              <Trash2 className="w-3.5 h-3.5" /> Eliminar
            </Button>
          </div>
        </div>
      )}

      {mode === "draw" && (
        <div className="border-2 border-dashed border-[#CDE7E1] rounded-lg p-3 bg-gradient-to-br from-[#F0F7F5]/30 to-white">
          <div className="text-[11px] uppercase tracking-wider text-[#0F5E54] font-display font-bold mb-2">
            Dibuja tu firma · usa el mouse, dedo o stylus
          </div>
          <canvas
            ref={canvasRef}
            data-testid={`${testIdPrefix}-canvas`}
            className="w-full h-36 bg-white rounded-md border border-border cursor-crosshair touch-none"
            onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
            onTouchStart={start} onTouchMove={move} onTouchEnd={end}
          />
          <div className="flex items-center justify-between mt-3 gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={clearCanvas} className="gap-1.5 rounded-sm" data-testid={`${testIdPrefix}-canvas-clear`}>
                <Trash2 className="w-3.5 h-3.5" /> Borrar
              </Button>
              <label className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 border border-border rounded-sm hover:bg-secondary cursor-pointer" data-testid={`${testIdPrefix}-upload-instead-btn`}>
                <Upload className="w-3.5 h-3.5" /> Subir imagen
                <input type="file" accept="image/*" className="hidden" onChange={onPickFile} />
              </label>
            </div>
            <div className="flex items-center gap-2">
              {value && (
                <Button size="sm" variant="outline" onClick={() => setMode("view")} className="gap-1.5 rounded-sm" data-testid={`${testIdPrefix}-cancel-draw`}>
                  <XIcon className="w-3.5 h-3.5" /> Cancelar
                </Button>
              )}
              <Button size="sm" onClick={saveDrawing} className="bg-[#14776A] hover:bg-[#0F5E54] gap-1.5 rounded-sm" data-testid={`${testIdPrefix}-save-draw`}>
                <Check className="w-3.5 h-3.5" /> Guardar firma
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
