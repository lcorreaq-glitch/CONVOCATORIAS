import React, { useState, useMemo } from "react";
import { ChevronUp, ChevronDown, GripVertical, ArrowUp, ArrowDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * SortableTable: tabla reutilizable con:
 * - Búsqueda
 * - Click en encabezado para ordenar
 * - Reordenamiento manual (HTML5 drag-and-drop + botones ↑↓) que llama onReorder(newIds)
 *
 * columns: [{ key, label, render(row, i), sortable, sortValue(row), width, className }]
 * items: array de objetos con id
 */
export default function SortableTable({
  items,
  columns,
  onReorder,
  searchKeys = [],
  searchPlaceholder = "Buscar…",
  rowKey = "id",
  emptyState,
  testIdPrefix = "row",
}) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState("__manual__");
  const [sortDir, setSortDir] = useState("asc");
  const [dragId, setDragId] = useState(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter((r) =>
      searchKeys.some((k) => String(r[k] || "").toLowerCase().includes(q))
    );
  }, [items, query, searchKeys]);

  const sorted = useMemo(() => {
    if (sortKey === "__manual__") return filtered;
    const col = columns.find((c) => c.key === sortKey);
    if (!col) return filtered;
    const get = col.sortValue || ((r) => r[sortKey]);
    const arr = [...filtered].sort((a, b) => {
      const av = get(a), bv = get(b);
      if (av == null) return 1; if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return av - bv;
      return String(av).localeCompare(String(bv), "es", { numeric: true });
    });
    return sortDir === "desc" ? arr.reverse() : arr;
  }, [filtered, sortKey, sortDir, columns]);

  const toggleSort = (key) => {
    if (sortKey === key) {
      if (sortDir === "asc") setSortDir("desc");
      else { setSortKey("__manual__"); setSortDir("asc"); }
    } else { setSortKey(key); setSortDir("asc"); }
  };

  const move = (id, dir) => {
    if (!onReorder) return;
    const ids = items.map((r) => r[rowKey]);
    const idx = ids.indexOf(id);
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= ids.length) return;
    const next = [...ids];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    onReorder(next);
  };

  const onDragStart = (id) => setDragId(id);
  const onDragOver = (e) => { e.preventDefault(); };
  const onDrop = (targetId) => {
    if (!onReorder || !dragId || dragId === targetId) { setDragId(null); return; }
    const ids = items.map((r) => r[rowKey]);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, dragId);
    onReorder(next);
    setDragId(null);
  };

  const manualMode = sortKey === "__manual__" && !query;

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-9 rounded-lg h-9"
            data-testid="sortable-search"
          />
        </div>
        {sortKey !== "__manual__" && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setSortKey("__manual__"); setSortDir("asc"); }}
            className="rounded-lg text-xs"
          >
            Volver a orden manual
          </Button>
        )}
        <div className="text-[11px] text-muted-foreground ml-auto">
          {manualMode
            ? "Arrastra filas o usa ↑↓ para reordenar"
            : `Ordenado por ${columns.find((c) => c.key === sortKey)?.label || sortKey} · ${sortDir === "asc" ? "asc" : "desc"}`}
        </div>
      </div>

      <div className="border border-border rounded-lg bg-white overflow-hidden shadow-card">
        <table className="w-full dense-table">
          <thead>
            <tr>
              {onReorder && <th style={{ width: 36 }}></th>}
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={c.sortable ? "cursor-pointer select-none hover:bg-secondary/50" : ""}
                  onClick={() => c.sortable && toggleSort(c.key)}
                  style={c.width ? { width: c.width } : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {c.label}
                    {c.sortable && sortKey === c.key && (
                      sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr
                key={row[rowKey]}
                draggable={!!onReorder && manualMode}
                onDragStart={() => onDragStart(row[rowKey])}
                onDragOver={onDragOver}
                onDrop={() => onDrop(row[rowKey])}
                className={dragId === row[rowKey] ? "opacity-40" : ""}
                data-testid={`${testIdPrefix}-${row[rowKey]}`}
              >
                {onReorder && (
                  <td className="text-muted-foreground" style={{ width: 36 }}>
                    {manualMode ? (
                      <div className="flex flex-col items-center -my-1">
                        <button
                          onClick={() => move(row[rowKey], -1)}
                          className="p-0.5 hover:text-[#14776A] disabled:opacity-30"
                          disabled={i === 0}
                          title="Mover arriba"
                          data-testid={`move-up-${row[rowKey]}`}
                        ><ArrowUp className="w-3 h-3" /></button>
                        <GripVertical className="w-3 h-3 cursor-grab text-[#9CA3AF]" />
                        <button
                          onClick={() => move(row[rowKey], +1)}
                          className="p-0.5 hover:text-[#14776A] disabled:opacity-30"
                          disabled={i === sorted.length - 1}
                          title="Mover abajo"
                          data-testid={`move-down-${row[rowKey]}`}
                        ><ArrowDown className="w-3 h-3" /></button>
                      </div>
                    ) : <span className="text-xs">·</span>}
                  </td>
                )}
                {columns.map((c) => (
                  <td key={c.key} className={c.className}>
                    {c.render ? c.render(row, i) : row[c.key]}
                  </td>
                ))}
              </tr>
            ))}
            {!sorted.length && (
              <tr><td colSpan={columns.length + (onReorder ? 1 : 0)}>{emptyState}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
