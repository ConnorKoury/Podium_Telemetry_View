"use client";

import { useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import type { TimeSeriesPoint } from "@/lib/types";
import type { ChartWidget, WidgetType } from "@/hooks/useChartConfig";
import GpsTrace from "./GpsTrace";

const PALETTE = [
  "#e53935","#fb8c00","#43a047","#1e88e5","#8e24aa","#00acc1",
  "#f44336","#ff7043","#66bb6a","#42a5f5","#ab47bc","#26c6da",
];

const HIDDEN = new Set([
  "Time","Utc","Interval","Latency","Sector","CurrentLap","LapCount","SessionTime","ElapsedTime",
]);

function colorFor(ch: string, pool: string[]) {
  return PALETTE[pool.indexOf(ch) % PALETTE.length] ?? "#888";
}

function formatTime(t: number) {
  return new Date(t).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// ── Channel picker popover ────────────────────────────────────────────────────

function ChannelPicker({
  available,
  selected,
  onChange,
  onClose,
}: {
  available: string[];
  selected: string[];
  onChange: (chs: string[]) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const filtered = available.filter((ch) => !HIDDEN.has(ch) && ch.toLowerCase().includes(q.toLowerCase()));
  const sel = new Set(selected);

  function toggle(ch: string) {
    const next = sel.has(ch) ? selected.filter((c) => c !== ch) : [...selected, ch];
    onChange(next);
  }

  return (
    <div className="absolute z-50 top-full mt-1 right-0 w-52 bg-nova-panel border border-nova-border rounded-lg shadow-2xl flex flex-col overflow-hidden">
      <div className="p-2 border-b border-nova-border flex items-center gap-2">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="filter…"
          className="flex-1 bg-black border border-nova-border rounded px-2 py-1 text-[11px] text-nova-text placeholder-nova-muted focus:outline-none focus:border-nova-red"
        />
        <button onClick={onClose} className="text-nova-dim hover:text-nova-text text-xs">✕</button>
      </div>
      <div className="overflow-y-auto max-h-52">
        {filtered.length === 0 && (
          <p className="text-[10px] text-nova-dim p-2">no channels match</p>
        )}
        {filtered.map((ch) => {
          const active = sel.has(ch);
          return (
            <button
              key={ch}
              onClick={() => toggle(ch)}
              className={`w-full text-left text-[11px] px-3 py-1 flex items-center gap-2 hover:bg-white/5 ${active ? "text-nova-text" : "text-nova-dim"}`}
            >
              <span className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: active ? colorFor(ch, filtered) : "#444" }} />
              {ch}
              {active && <span className="ml-auto text-[9px] text-nova-red">✓</span>}
            </button>
          );
        })}
      </div>
      <div className="p-2 border-t border-nova-border flex gap-2">
        <button
          onClick={() => onChange([])}
          className="text-[10px] text-nova-dim hover:text-nova-text"
        >
          clear all
        </button>
        <span className="ml-auto text-[10px] text-nova-muted">{selected.length} selected</span>
      </div>
    </div>
  );
}

// ── Single widget ─────────────────────────────────────────────────────────────

function Widget({
  widget,
  history,
  availableChannels,
  onUpdate,
  onRemove,
  onMove,
  isFirst,
  isLast,
}: {
  widget: ChartWidget;
  history: TimeSeriesPoint[];
  availableChannels: string[];
  onUpdate: (patch: Partial<ChartWidget>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [draft, setDraft] = useState(widget.title);
  const [pickerOpen, setPickerOpen] = useState(false);

  const activeChannels = widget.channels.filter((ch) => availableChannels.includes(ch) || availableChannels.length === 0);

  return (
    <div className="bg-nova-panel border border-nova-border rounded-lg overflow-visible">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-nova-border">
        {editingTitle ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => { onUpdate({ title: draft }); setEditingTitle(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") { onUpdate({ title: draft }); setEditingTitle(false); } if (e.key === "Escape") setEditingTitle(false); }}
            className="flex-1 bg-black border border-nova-border rounded px-2 py-0.5 text-xs text-nova-text focus:outline-none focus:border-nova-red"
          />
        ) : (
          <button
            onClick={() => { setDraft(widget.title); setEditingTitle(true); }}
            className="flex-1 text-left text-xs font-semibold text-nova-text hover:text-nova-red transition-colors truncate"
          >
            {widget.title}
          </button>
        )}

        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Type toggle */}
          <div className="flex rounded overflow-hidden border border-nova-border text-[10px]">
            <button
              onClick={() => onUpdate({ type: "line" })}
              className={`px-2 py-0.5 transition-colors ${widget.type === "line" ? "bg-nova-red/20 text-nova-red" : "text-nova-dim hover:text-nova-text"}`}
            >
              line
            </button>
            <button
              onClick={() => onUpdate({ type: "gps" })}
              className={`px-2 py-0.5 transition-colors ${widget.type === "gps" ? "bg-nova-red/20 text-nova-red" : "text-nova-dim hover:text-nova-text"}`}
            >
              gps
            </button>
          </div>

          {/* Channel picker — only for line type */}
          {widget.type === "line" && (
            <div className="relative">
              <button
                onClick={() => setPickerOpen((v) => !v)}
                className="text-[10px] px-2 py-0.5 rounded border border-nova-border text-nova-dim hover:text-nova-text hover:border-nova-muted transition-colors"
              >
                channels{widget.channels.length > 0 ? ` (${widget.channels.length})` : ""}
              </button>
              {pickerOpen && (
                <ChannelPicker
                  available={availableChannels}
                  selected={widget.channels}
                  onChange={(chs) => onUpdate({ channels: chs })}
                  onClose={() => setPickerOpen(false)}
                />
              )}
            </div>
          )}

          {/* Move */}
          <button onClick={() => onMove(-1)} disabled={isFirst} className="text-[10px] text-nova-dim hover:text-nova-text disabled:opacity-30 px-1">↑</button>
          <button onClick={() => onMove(1)} disabled={isLast} className="text-[10px] text-nova-dim hover:text-nova-text disabled:opacity-30 px-1">↓</button>

          {/* Remove */}
          <button
            onClick={onRemove}
            className="text-[10px] text-nova-muted hover:text-red-400 transition-colors px-1"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="p-3">
        {widget.type === "gps" ? (
          <GpsTrace history={history} />
        ) : activeChannels.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-xs text-nova-dim">
            Click <span className="mx-1 font-semibold text-nova-text">channels</span> to add channels to this chart.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={history} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#222" />
              <XAxis
                dataKey="t"
                tickFormatter={formatTime}
                tick={{ fill: "#888", fontSize: 10 }}
                stroke="#333"
              />
              <YAxis tick={{ fill: "#888", fontSize: 10 }} stroke="#333" width={44} />
              <Tooltip
                contentStyle={{ background: "#1a1a1a", border: "1px solid #333", fontSize: 11 }}
                labelFormatter={(v) => formatTime(Number(v))}
              />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {activeChannels.map((ch) => (
                <Line
                  key={ch}
                  type="monotone"
                  dataKey={ch}
                  stroke={colorFor(ch, availableChannels)}
                  dot={false}
                  strokeWidth={1.5}
                  isAnimationActive={false}
                  connectNulls={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

interface ChartsDashboardProps {
  history: TimeSeriesPoint[];
  availableChannels: string[];
  widgets: ChartWidget[];
  onAddWidget: (type: WidgetType) => void;
  onRemoveWidget: (id: string) => void;
  onUpdateWidget: (id: string, patch: Partial<ChartWidget>) => void;
  onMoveWidget: (id: string, dir: -1 | 1) => void;
}

export default function ChartsDashboard({
  history,
  availableChannels,
  widgets,
  onAddWidget,
  onRemoveWidget,
  onUpdateWidget,
  onMoveWidget,
}: ChartsDashboardProps) {
  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-nova-dim uppercase tracking-widest">Charts</span>
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => onAddWidget("line")}
            className="text-xs px-3 py-1 rounded border border-nova-border text-nova-dim hover:text-nova-text hover:border-nova-muted transition-colors"
          >
            + Line Chart
          </button>
          <button
            onClick={() => onAddWidget("gps")}
            className="text-xs px-3 py-1 rounded border border-nova-border text-nova-dim hover:text-nova-text hover:border-nova-muted transition-colors"
          >
            + GPS Trace
          </button>
        </div>
      </div>

      {widgets.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-sm text-nova-dim">
          No charts. Add one above.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {widgets.map((w, i) => (
            <Widget
              key={w.id}
              widget={w}
              history={history}
              availableChannels={availableChannels}
              onUpdate={(patch) => onUpdateWidget(w.id, patch)}
              onRemove={() => onRemoveWidget(w.id)}
              onMove={(dir) => onMoveWidget(w.id, dir)}
              isFirst={i === 0}
              isLast={i === widgets.length - 1}
            />
          ))}
        </div>
      )}

      {history.length === 0 && widgets.length > 0 && (
        <p className="text-xs text-nova-dim text-center">
          Connect to a live stream to populate charts.
        </p>
      )}
    </div>
  );
}
