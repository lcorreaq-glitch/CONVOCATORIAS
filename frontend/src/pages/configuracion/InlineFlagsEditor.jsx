import React, { useState } from "react";
import { api } from "@/lib/api";
import { Badge } from "@/components/PageHeader";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Plus, X, Settings } from "lucide-react";
import { toast } from "sonner";

/**
 * Editor inline de flags booleanos. Click en una píldora → toggle inmediato.
 * Click en "+" abre popover con todas las opciones.
 *
 * Props:
 * - endpoint: PATCH endpoint (e.g. `/campos/${id}`)
 * - item: el objeto actual (campo o criterio)
 * - flags: [{ key: 'obligatorio', label: 'Obligatorio', tone: 'info' }, ...]
 * - alwaysOn: lista de labels fijos (no editables)
 * - onChange: callback
 */
export default function InlineFlagsEditor({ endpoint, item, flags, alwaysOn = [], onChange }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const toggle = async (key, currentVal) => {
    setBusy(true);
    try {
      await api.patch(endpoint, { [key]: !currentVal });
      onChange && onChange();
    } catch (e) {
      toast.error("No se pudo guardar el cambio");
    } finally { setBusy(false); }
  };

  const active = flags.filter((f) => !!item[f.key]);
  const inactive = flags.filter((f) => !item[f.key]);

  return (
    <div className="flex gap-1 flex-wrap items-center">
      {alwaysOn.map((a) => <Badge key={a.label} tone={a.tone || "muted"}>{a.label}</Badge>)}
      {active.map((f) => (
        <button
          key={f.key}
          onClick={() => toggle(f.key, true)}
          disabled={busy}
          className="group inline-flex items-center gap-1 hover:opacity-80 transition-opacity"
          title={`Click para quitar "${f.label}"`}
          data-testid={`flag-${item.id}-${f.key}-on`}
        >
          <Badge tone={f.tone || "info"}>
            <span className="flex items-center gap-1">{f.label}<X className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100" /></span>
          </Badge>
        </button>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-[#5E6878] hover:text-[#14776A] border border-dashed border-[#CBD5E1] hover:border-[#14776A] rounded-full px-2 py-0.5 transition-colors"
            title="Editar opciones"
            data-testid={`flags-edit-${item.id}`}
          >
            {inactive.length > 0 ? <><Plus className="w-2.5 h-2.5" /><span className="ml-0.5">añadir</span></> : <Settings className="w-2.5 h-2.5" />}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-3">
          <div className="text-[11px] uppercase tracking-wide font-display font-bold text-[#5E6878] mb-2">Opciones</div>
          <div className="space-y-1.5">
            {flags.map((f) => (
              <div key={f.key} className="flex items-center justify-between gap-2 px-2 py-1.5 hover:bg-secondary rounded-md">
                <div>
                  <Label className="text-[12.5px] cursor-pointer">{f.label}</Label>
                  {f.help && <p className="text-[10.5px] text-muted-foreground leading-tight">{f.help}</p>}
                </div>
                <Switch checked={!!item[f.key]} onCheckedChange={() => toggle(f.key, !!item[f.key])} />
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
