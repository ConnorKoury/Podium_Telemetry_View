"use client";

import { useState, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ScatterChart, Scatter, type TooltipProps,
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

function SingleChannelPicker({
  available,
  selected,
  onChange,
  onClose,
}: {
  available: string[];
  selected?: string;
  onChange: (ch: string | undefined) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const filtered = available.filter((ch) => !HIDDEN.has(ch) && ch.toLowerCase().includes(q.toLowerCase()));

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
          const active = selected === ch;
          return (
            <button
              key={ch}
              onClick={() => { onChange(ch); onClose(); }}
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
      <div className="p-2 border-t border-nova-border">
        <button
          onClick={() => { onChange(undefined); onClose(); }}
          className="text-[10px] text-nova-dim hover:text-nova-text"
        >
          clear
        </button>
      </div>
    </div>
  );
}

// ── Forward-fill: carry last value into gaps so the cursor doesn't flicker ────

function forwardFill(history: TimeSeriesPoint[], channels: string[]): TimeSeriesPoint[] {
  const last: Partial<Record<string, number>> = {};
  return history.map((point) => {
    const out: TimeSeriesPoint = { ...point };
    for (const ch of channels) {
      const v = point[ch];
      if (typeof v === "number") {
        last[ch] = v;
        out[`${ch}__f`] = v; // fill key mirrors real value
      } else if (last[ch] !== undefined) {
        out[`${ch}__f`] = last[ch]!; // hold last value in gap
      }
    }
    return out;
  });
}

function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const entries = payload.filter((p) => !String(p.dataKey).endsWith("__f"));
  if (!entries.length) return null;
  return (
    <div style={{ background: "#1a1a1a", border: "1px solid #333", fontSize: 11, padding: "4px 8px", borderRadius: 4 }}>
      <p style={{ color: "#888", marginBottom: 2 }}>{formatTime(Number(label))}</p>
      {entries.map((p) => (
        <p key={p.dataKey} style={{ color: p.color, margin: "1px 0" }}>
          {p.name}: {typeof p.value === "number" ? p.value.toFixed(3) : "—"}
        </p>
      ))}
    </div>
  );
}

function ScatterTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as { x?: number; y?: number; t?: number; xChannel?: string; yChannel?: string } | undefined;
  if (!point) return null;
  return (
    <div style={{ background: "#1a1a1a", border: "1px solid #333", fontSize: 11, padding: "4px 8px", borderRadius: 4 }}>
      {typeof point.t === "number" && <p style={{ color: "#888", marginBottom: 2 }}>{formatTime(point.t)}</p>}
      <p style={{ color: "#42a5f5", margin: "1px 0" }}>
        {point.xChannel}: {typeof point.x === "number" ? point.x.toFixed(3) : "-"}
      </p>
      <p style={{ color: "#e53935", margin: "1px 0" }}>
        {point.yChannel}: {typeof point.y === "number" ? point.y.toFixed(3) : "-"}
      </p>
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
  const [pickerOpen, setPickerOpen] = useState<"line" | "x" | "y" | null>(null);

  const activeChannels = widget.channels.filter((ch) => availableChannels.includes(ch) || availableChannels.length === 0);
  const xChannel = widget.xChannel && (availableChannels.includes(widget.xChannel) || availableChannels.length === 0)
    ? widget.xChannel
    : undefined;
  const yChannel = widget.yChannel && (availableChannels.includes(widget.yChannel) || availableChannels.length === 0)
    ? widget.yChannel
    : undefined;

  const filledData = useMemo(
    () => forwardFill(history, activeChannels),
    [history, activeChannels]
  );
  const scatterData = useMemo(() => {
    if (!xChannel || !yChannel) return [];
    return history
      .map((point) => {
        const x = point[xChannel];
        const y = point[yChannel];
        if (typeof x !== "number" || typeof y !== "number") return null;
        return { x, y, t: point.t, xChannel, yChannel };
      })
      .filter((point): point is { x: number; y: number; t: number; xChannel: string; yChannel: string } => point !== null);
  }, [history, xChannel, yChannel]);
  const currentScatterPoint = scatterData.length > 0 ? scatterData[scatterData.length - 1] : null;

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
              onClick={() => onUpdate({ type: "scatter" })}
              className={`px-2 py-0.5 transition-colors ${widget.type === "scatter" ? "bg-nova-red/20 text-nova-red" : "text-nova-dim hover:text-nova-text"}`}
            >
              scatter
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
                onClick={() => setPickerOpen((v) => v === "line" ? null : "line")}
                className="text-[10px] px-2 py-0.5 rounded border border-nova-border text-nova-dim hover:text-nova-text hover:border-nova-muted transition-colors"
              >
                channels{widget.channels.length > 0 ? ` (${widget.channels.length})` : ""}
              </button>
              {pickerOpen === "line" && (
                <ChannelPicker
                  available={availableChannels}
                  selected={widget.channels}
                  onChange={(chs) => onUpdate({ channels: chs })}
                  onClose={() => setPickerOpen(null)}
                />
              )}
            </div>
          )}

          {widget.type === "scatter" && (
            <>
              <div className="relative">
                <button
                  onClick={() => setPickerOpen((v) => v === "x" ? null : "x")}
                  className="text-[10px] px-2 py-0.5 rounded border border-nova-border text-nova-dim hover:text-nova-text hover:border-nova-muted transition-colors max-w-36 truncate"
                  title={xChannel ? `X: ${xChannel}` : "Select X axis"}
                >
                  x: {xChannel ?? "select"}
                </button>
                {pickerOpen === "x" && (
                  <SingleChannelPicker
                    available={availableChannels}
                    selected={xChannel}
                    onChange={(ch) => onUpdate({ xChannel: ch })}
                    onClose={() => setPickerOpen(null)}
                  />
                )}
              </div>
              <div className="relative">
                <button
                  onClick={() => setPickerOpen((v) => v === "y" ? null : "y")}
                  className="text-[10px] px-2 py-0.5 rounded border border-nova-border text-nova-dim hover:text-nova-text hover:border-nova-muted transition-colors max-w-36 truncate"
                  title={yChannel ? `Y: ${yChannel}` : "Select Y axis"}
                >
                  y: {yChannel ?? "select"}
                </button>
                {pickerOpen === "y" && (
                  <SingleChannelPicker
                    available={availableChannels}
                    selected={yChannel}
                    onChange={(ch) => onUpdate({ yChannel: ch })}
                    onClose={() => setPickerOpen(null)}
                  />
                )}
              </div>
            </>
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
        ) : widget.type === "scatter" ? (
          !xChannel || !yChannel ? (
            <div className="flex items-center justify-center h-32 text-xs text-nova-dim">
              Select an x and y channel for this scatter plot.
            </div>
          ) : scatterData.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-xs text-nova-dim">
              No matching x/y samples in the current window.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <ScatterChart margin={{ top: 8, right: 12, left: -4, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                <XAxis
                  type="number"
                  dataKey="x"
                  name={xChannel}
                  tick={{ fill: "#888", fontSize: 10 }}
                  stroke="#333"
                  label={{ value: xChannel, position: "insideBottom", offset: -4, fill: "#888", fontSize: 10 }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name={yChannel}
                  tick={{ fill: "#888", fontSize: 10 }}
                  stroke="#333"
                  width={54}
                  label={{ value: yChannel, angle: -90, position: "insideLeft", fill: "#888", fontSize: 10 }}
                />
                <Tooltip cursor={{ strokeDasharray: "3 3" }} content={<ScatterTooltip />} />
                <Scatter
                  name={`${xChannel} vs ${yChannel}`}
                  data={scatterData}
                  fill="#7a7a7a"
                  line={false}
                  isAnimationActive={false}
                />
                {currentScatterPoint && (
                  <Scatter
                    name="Current"
                    data={[currentScatterPoint]}
                    fill="#e53935"
                    shape="star"
                    line={false}
                    isAnimationActive={false}
                  />
                )}
              </ScatterChart>
            </ResponsiveContainer>
          )
        ) : activeChannels.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-xs text-nova-dim">
            Click <span className="mx-1 font-semibold text-nova-text">channels</span> to add channels to this chart.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={filledData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#222" />
              <XAxis
                dataKey="t"
                tickFormatter={formatTime}
                tick={{ fill: "#888", fontSize: 10 }}
                stroke="#333"
              />
              <YAxis tick={{ fill: "#888", fontSize: 10 }} stroke="#333" width={44} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {/* Grey hold lines — rendered first so real lines sit on top */}
              {activeChannels.map((ch) => (
                <Line
                  key={`${ch}__f`}
                  dataKey={`${ch}__f`}
                  stroke="#484848"
                  strokeWidth={1}
                  dot={false}
                  isAnimationActive={false}
                  legendType="none"
                  connectNulls={false}
                />
              ))}
              {/* Real data lines */}
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

const TIME_WINDOWS = [
  { label: "30s", seconds: 30 },
  { label: "1m", seconds: 60 },
  { label: "5m", seconds: 300 },
  { label: "All", seconds: 0 },
] as const;

export default function ChartsDashboard({
  history,
  availableChannels,
  widgets,
  onAddWidget,
  onRemoveWidget,
  onUpdateWidget,
  onMoveWidget,
}: ChartsDashboardProps) {
  const [paused, setPaused] = useState(false);
  const [pausedAtLength, setPausedAtLength] = useState(0);
  const [scrubPos, setScrubPos] = useState(1); // 0.0–1.0, 1 = newest
  const [windowSeconds, setWindowSeconds] = useState(60);

  function togglePause() {
    if (!paused) {
      setPausedAtLength(history.length);
      setScrubPos(1);
    }
    setPaused((p) => !p);
  }

  const displayHistory = useMemo(() => {
    // When paused, don't let the frozen window grow beyond pausedAtLength
    const hardMax = paused ? Math.min(pausedAtLength, history.length) : history.length;
    const endIdx = paused ? Math.round(scrubPos * (hardMax - 1)) : hardMax - 1;
    const slice = history.slice(0, endIdx + 1);

    if (windowSeconds === 0 || slice.length === 0) return slice;
    const endTime = slice[slice.length - 1].t;
    const startTime = endTime - windowSeconds * 1000;
    return slice.filter((p) => p.t >= startTime);
  }, [history, paused, pausedAtLength, scrubPos, windowSeconds]);

  const canScrub = paused && pausedAtLength > 1;

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-nova-dim uppercase tracking-widest">Charts</span>

        {/* Time window */}
        <div className="flex rounded overflow-hidden border border-nova-border text-[10px]">
          {TIME_WINDOWS.map(({ label, seconds }) => (
            <button
              key={label}
              onClick={() => setWindowSeconds(seconds)}
              className={`px-2.5 py-1 transition-colors ${
                windowSeconds === seconds
                  ? "bg-nova-red/20 text-nova-red"
                  : "text-nova-dim hover:text-nova-text"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Pause/Resume */}
        <button
          onClick={togglePause}
          className={`text-[10px] px-3 py-1 rounded border transition-colors ${
            paused
              ? "border-amber-600/60 bg-amber-900/30 text-amber-400 hover:bg-amber-900/50"
              : "border-nova-border text-nova-dim hover:text-nova-text"
          }`}
        >
          {paused ? "▶ Resume" : "⏸ Pause"}
        </button>

        <div className="ml-auto flex gap-2">
          <button
            onClick={() => onAddWidget("line")}
            className="text-xs px-3 py-1 rounded border border-nova-border text-nova-dim hover:text-nova-text hover:border-nova-muted transition-colors"
          >
            + Line Chart
          </button>
          <button
            onClick={() => onAddWidget("scatter")}
            className="text-xs px-3 py-1 rounded border border-nova-border text-nova-dim hover:text-nova-text hover:border-nova-muted transition-colors"
          >
            + Scatter Plot
          </button>
          <button
            onClick={() => onAddWidget("gps")}
            className="text-xs px-3 py-1 rounded border border-nova-border text-nova-dim hover:text-nova-text hover:border-nova-muted transition-colors"
          >
            + GPS Trace
          </button>
        </div>
      </div>

      {/* Scrub slider */}
      {canScrub && (
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-amber-400 shrink-0">Scrub</span>
          <input
            type="range"
            min={0}
            max={1000}
            step={1}
            value={Math.round(scrubPos * 1000)}
            onChange={(e) => setScrubPos(Number(e.target.value) / 1000)}
            className="flex-1 accent-amber-500 h-1"
          />
          {displayHistory.length > 0 && (
            <span className="text-[10px] text-nova-muted font-mono shrink-0">
              {formatTime(displayHistory[displayHistory.length - 1].t)}
            </span>
          )}
        </div>
      )}

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
              history={displayHistory}
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
