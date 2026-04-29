"use client";

import { useState, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import type { LapData, LapRecord, TimeSeriesPoint } from "@/lib/types";

interface LapHistoryProps {
  laps: LapRecord[];
  eventTitle: string;
  displayName: string;
  eventNumericId: number | null;
  deviceNumericId: number | null;
}

// Default channels to show when a lap is first loaded
const DEFAULT_CHANNELS = ["GPS_Speed", "Engine_Spee", "Lambda", "Throttle_Pe", "Front_Brake", "Battery"];

// Channels that are noise / internal and not useful to chart
const HIDDEN_CHANNELS = new Set([
  "Time", "Utc", "Interval", "Latency", "Sector", "CurrentLap", "LapCount",
  "SessionTime", "ElapsedTime",
]);

// Stable color palette — cycles for channels not explicitly listed
const PALETTE = [
  "#e53935","#fb8c00","#43a047","#1e88e5","#8e24aa","#00acc1",
  "#f44336","#ff7043","#66bb6a","#42a5f5","#ab47bc","#26c6da",
  "#ef5350","#ffa726","#4caf50","#2196f3","#9c27b0","#00bcd4",
];

function colorFor(ch: string, allChannels: string[]): string {
  const idx = allChannels.indexOf(ch);
  return PALETTE[idx % PALETTE.length];
}

function formatLapTime(seconds: number): string {
  if (!seconds || seconds > 3600) return "—";
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(3).padStart(6, "0");
  return `${m}:${s}`;
}

function formatEndTime(epochMs: number): string {
  if (!epochMs) return "—";
  return new Date(epochMs).toLocaleString(undefined, {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function timeAgo(epochMs: number): string {
  if (!epochMs) return "";
  const diff = Date.now() - epochMs;
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return "just now";
}

interface LapHistoryProps {
  laps: LapRecord[];
  eventTitle: string;
  displayName: string;
  eventNumericId: number | null;
  deviceNumericId: number | null;
  onLapLoad?: (lapData: LapData) => void;
}

export default function LapHistory({
  laps, eventTitle, displayName, eventNumericId, deviceNumericId, onLapLoad,
}: LapHistoryProps) {
  const [selectedLap, setSelectedLap] = useState<number | null>(null);
  const [lapCache, setLapCache] = useState<Record<number, LapData>>({});
  const [loading, setLoading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeChannels, setActiveChannels] = useState<Set<string>>(new Set(DEFAULT_CHANNELS));
  const [channelFilter, setChannelFilter] = useState("");

  const completedLaps = laps.filter((l) => (l.end_time ?? 0) > 0);
  const lastLap = completedLaps[completedLaps.length - 1];
  const bestLap = completedLaps
    .filter((l) => l.lap_time && l.lap_time < 3600)
    .sort((a, b) => (a.lap_time ?? Infinity) - (b.lap_time ?? Infinity))[0];

  function selectLap(lapNumber: number, data: LapData) {
    setSelectedLap(lapNumber);
    setActiveChannels((prev) => {
      const next = new Set(prev);
      for (const ch of DEFAULT_CHANNELS) {
        if (data.channels.includes(ch)) next.add(ch);
      }
      return next;
    });
    onLapLoad?.(data);
  }

  async function loadLap(lapNumber: number) {
    if (lapCache[lapNumber]) {
      selectLap(lapNumber, lapCache[lapNumber]);
      return;
    }
    if (!eventNumericId || !deviceNumericId) {
      setError("Event not loaded with numeric IDs — reload the event page.");
      return;
    }
    setLoading(lapNumber);
    setError(null);
    try {
      const res = await fetch(
        `/api/lap-data?eventNumericId=${eventNumericId}&deviceNumericId=${deviceNumericId}&lapNumber=${lapNumber}`
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const raw = await res.json() as Omit<LapData, "lapNumber">;
      const data: LapData = { ...raw, lapNumber };
      setLapCache((prev) => ({ ...prev, [lapNumber]: data }));
      selectLap(lapNumber, data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(null);
    }
  }

  const currentData = selectedLap !== null ? lapCache[selectedLap] : null;

  // Channels available in this lap, excluding internal noise, sorted
  const availableChannels = useMemo(() => {
    if (!currentData) return [];
    return currentData.channels
      .filter((ch) => !HIDDEN_CHANNELS.has(ch))
      .sort();
  }, [currentData]);

  const filteredChannels = useMemo(() => {
    if (!channelFilter.trim()) return availableChannels;
    const q = channelFilter.toLowerCase();
    return availableChannels.filter((ch) => ch.toLowerCase().includes(q));
  }, [availableChannels, channelFilter]);

  const chartChannels = availableChannels.filter((ch) => activeChannels.has(ch));

  if (laps.length === 0) {
    return (
      <div className="text-sm text-nova-dim text-center py-12">
        No lap data available for this event.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      {/* Session summary */}
      <div className="bg-nova-panel border border-nova-border rounded-lg p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-sm font-bold text-nova-text">{displayName}</h3>
            {eventTitle && <p className="text-xs text-nova-dim mt-0.5">{eventTitle}</p>}
          </div>
          <span className="text-xs px-2 py-1 rounded bg-nova-muted/20 text-nova-dim">
            No active session
          </span>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <StatBox label="Total Laps" value={String(completedLaps.length)} />
          <StatBox
            label="Best Lap"
            value={bestLap?.lap_time ? formatLapTime(bestLap.lap_time) : "—"}
            highlight
          />
          <StatBox
            label="Last Activity"
            value={lastLap ? timeAgo(lastLap.end_time!) : "—"}
            sub={lastLap ? formatEndTime(lastLap.end_time!) : undefined}
          />
        </div>
      </div>

      {/* Lap table */}
      <div>
        <h3 className="text-xs text-nova-dim uppercase tracking-widest mb-2">
          Recorded Laps ({completedLaps.length})
        </h3>
        <div className="rounded-lg border border-nova-border overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-nova-border bg-nova-panel text-nova-dim">
                <th className="px-3 py-2 text-left font-normal">Lap</th>
                <th className="px-3 py-2 text-right font-normal">Lap Time</th>
                <th className="px-3 py-2 text-right font-normal">End Time</th>
                <th className="px-3 py-2 text-right font-normal"></th>
                <th className="px-3 py-2 text-right font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {completedLaps.map((lap, i) => {
                const isBest = lap.id === bestLap?.id;
                const lapNum = lap.lap_number ?? i + 1;
                const lapTime = lap.lap_time && lap.lap_time < 3600 ? lap.lap_time : null;
                const isSelected = selectedLap === lapNum;
                const isLoading = loading === lapNum;
                return (
                  <tr
                    key={lap.id}
                    className={`border-b border-nova-border/50 ${
                      isSelected ? "bg-nova-red/10" : isBest ? "bg-nova-red/5" : "hover:bg-white/5"
                    }`}
                  >
                    <td className="px-3 py-1.5 text-nova-dim tabular-nums">{lapNum}</td>
                    <td className={`px-3 py-1.5 text-right tabular-nums font-mono ${
                      isBest ? "text-nova-red font-semibold" : "text-nova-text"
                    }`}>
                      {lapTime ? formatLapTime(lapTime) : "—"}
                      {isBest && <span className="ml-1.5 text-[10px] text-nova-red">BEST</span>}
                    </td>
                    <td className="px-3 py-1.5 text-right text-nova-dim tabular-nums">
                      {formatEndTime(lap.end_time!)}
                    </td>
                    <td className="px-3 py-1.5 text-right text-nova-muted text-[10px]">
                      {timeAgo(lap.end_time!)}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <button
                        onClick={() => loadLap(lapNum)}
                        disabled={isLoading || !eventNumericId}
                        className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                          isSelected
                            ? "border-nova-red text-nova-red bg-nova-red/10"
                            : "border-nova-border text-nova-dim hover:border-nova-red hover:text-nova-red"
                        } disabled:opacity-40`}
                      >
                        {isLoading ? "…" : isSelected ? "viewing" : "view"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {error && (
        <div className="text-xs text-red-400 bg-red-900/20 border border-red-800/40 rounded p-3">
          {error}
        </div>
      )}

      {/* Lap detail */}
      {currentData && selectedLap !== null && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs text-nova-dim uppercase tracking-widest">
              Lap {selectedLap} · {currentData.totalPackets} samples · {chartChannels.length} channels
            </h3>
            <button
              onClick={() => setSelectedLap(null)}
              className="text-[10px] text-nova-dim hover:text-nova-text"
            >
              close ✕
            </button>
          </div>

          <div className="flex gap-3">
            {/* Channel picker */}
            <div className="w-44 flex-shrink-0 flex flex-col gap-1.5">
              <input
                type="text"
                value={channelFilter}
                onChange={(e) => setChannelFilter(e.target.value)}
                placeholder="filter channels…"
                className="w-full bg-black border border-nova-border rounded px-2 py-1 text-[11px] text-nova-text placeholder-nova-muted focus:outline-none focus:border-nova-red"
              />
              <div className="bg-nova-panel border border-nova-border rounded overflow-y-auto max-h-64 flex flex-col">
                {filteredChannels.length === 0 && (
                  <span className="text-[10px] text-nova-dim p-2">no channels match</span>
                )}
                {filteredChannels.map((ch) => {
                  const active = activeChannels.has(ch);
                  return (
                    <button
                      key={ch}
                      onClick={() =>
                        setActiveChannels((prev) => {
                          const next = new Set(prev);
                          if (next.has(ch)) next.delete(ch);
                          else next.add(ch);
                          return next;
                        })
                      }
                      className={`text-left text-[11px] px-2.5 py-1 flex items-center gap-2 hover:bg-white/5 ${
                        active ? "text-nova-text" : "text-nova-dim"
                      }`}
                    >
                      <span
                        className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                        style={{
                          background: active ? colorFor(ch, availableChannels) : "#444",
                        }}
                      />
                      {ch}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setActiveChannels(new Set())}
                className="text-[10px] text-nova-dim hover:text-nova-text text-left px-1"
              >
                clear all
              </button>
            </div>

            {/* Chart */}
            <div className="flex-1 bg-nova-panel border border-nova-border rounded-lg p-3 min-w-0">
              {chartChannels.length === 0 ? (
                <div className="flex items-center justify-center h-64 text-xs text-nova-dim">
                  Select channels from the list to plot them.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={currentData.points} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis
                      dataKey="t"
                      type="number"
                      domain={["dataMin", "dataMax"]}
                      tickFormatter={(v) => {
                        const s = (v - (currentData.points[0]?.t ?? v)) / 1000;
                        return `${s.toFixed(0)}s`;
                      }}
                      tick={{ fill: "#888", fontSize: 10 }}
                    />
                    <YAxis tick={{ fill: "#888", fontSize: 10 }} width={40} />
                    <Tooltip
                      contentStyle={{ background: "#1a1a1a", border: "1px solid #333", fontSize: 11 }}
                      labelFormatter={(v) => {
                        const s = (Number(v) - (currentData.points[0]?.t ?? Number(v))) / 1000;
                        return `t+${s.toFixed(1)}s`;
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    {chartChannels.map((ch) => (
                      <Line
                        key={ch}
                        type="monotone"
                        dataKey={ch}
                        stroke={colorFor(ch, availableChannels)}
                        dot={false}
                        strokeWidth={1.5}
                        isAnimationActive={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatBox({
  label, value, sub, highlight,
}: {
  label: string; value: string; sub?: string; highlight?: boolean;
}) {
  return (
    <div className="bg-black rounded border border-nova-border p-2.5 flex flex-col gap-0.5">
      <span className="text-[10px] text-nova-dim uppercase tracking-wider">{label}</span>
      <span className={`text-sm font-bold tabular-nums ${highlight ? "text-nova-red" : "text-nova-text"}`}>
        {value}
      </span>
      {sub && <span className="text-[10px] text-nova-muted">{sub}</span>}
    </div>
  );
}
