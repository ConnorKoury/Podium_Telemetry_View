"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import type { LapData, ParsedEventInfo } from "@/lib/types";
import { GAUGE_CONFIG, KEY_GAUGES } from "@/lib/types";
import { useTelemetry } from "@/hooks/useTelemetry";
import { useChartConfig } from "@/hooks/useChartConfig";
import EventSelector from "@/components/EventSelector";
import ConnectionStatus from "@/components/ConnectionStatus";
import GaugeCard from "@/components/GaugeCard";
import SensorGrid from "@/components/SensorGrid";
import ChartsDashboard from "@/components/ChartsDashboard";
import PacketInspector from "@/components/PacketInspector";
import LiveEventsList from "@/components/LiveEventsList";
import LapHistory from "@/components/LapHistory";

type Tab = "discover" | "gauges" | "channels" | "chart" | "packets" | "history";

const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 560;
const SIDEBAR_DEFAULT = 320;

function useSidebarResize() {
  const [width, setWidth] = useState(SIDEBAR_DEFAULT);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);

  // Persist
  useEffect(() => {
    try {
      const v = localStorage.getItem("sidebar-width");
      if (v) setWidth(Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, Number(v))));
    } catch { /* ignore */ }
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    startX.current = e.clientX;
    startW.current = width;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function onMove(e: MouseEvent) {
      if (!dragging.current) return;
      const w = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, startW.current + e.clientX - startX.current));
      setWidth(w);
      try { localStorage.setItem("sidebar-width", String(w)); } catch { /* ignore */ }
    }
    function onUp() {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [width]);

  return { width, onMouseDown };
}

export default function Dashboard() {
  const [eventInfo, setEventInfo] = useState<ParsedEventInfo | null>(null);
  const [loadedLap, setLoadedLap] = useState<LapData | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("discover");
  const [manualDeviceId, setManualDeviceId] = useState("");
  const sidebar = useSidebarResize();

  const {
    connectionState,
    proxyUrl,
    latestValues,
    history,
    recentPackets,
    packetCount,
    lastPacketAt,
    lastError,
    connect,
    disconnect,
    manualRegister,
  } = useTelemetry(eventInfo);

  const deviceKey = eventInfo?.eventDeviceId ?? eventInfo?.deviceId ?? null;
  const { widgets, addWidget, removeWidget, updateWidget, moveWidget } = useChartConfig(deviceKey);

  // When viewing a loaded lap, use its data; otherwise use the live stream
  const displayHistory = loadedLap?.points ?? history;
  const displayLatestValues = useMemo<Record<string, number | null>>(() => {
    if (!loadedLap) return latestValues;
    const last = loadedLap.points[loadedLap.points.length - 1];
    if (!last) return latestValues;
    const out: Record<string, number | null> = {};
    for (const [k, v] of Object.entries(last)) {
      if (k !== "t") out[k] = v;
    }
    return out;
  }, [loadedLap, latestValues]);

  // Channels available for charting
  const availableChannels = useMemo(() => {
    if (loadedLap) return loadedLap.channels.sort();
    if (eventInfo?.sensorList.length) return eventInfo.sensorList.map((s) => s.name).sort();
    if (history.length > 0) return Object.keys(history[history.length - 1]).filter((k) => k !== "t").sort();
    return [];
  }, [loadedLap, eventInfo, history]);

  const handleEventLoad = useCallback((info: ParsedEventInfo) => {
    setEventInfo(info);
    setLoadedLap(null);
    setActiveTab("gauges");
  }, []);

  const isConnected =
    connectionState === "proxy_connected" ||
    connectionState === "registered" ||
    connectionState === "receiving";

  return (
    <div className="min-h-screen bg-nova-dark flex flex-col">
      {/* Header */}
      <header className="border-b border-nova-border bg-nova-panel px-6 py-3 flex items-center gap-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-2 h-6 bg-nova-red rounded-sm" />
          <div>
            <h1 className="text-sm font-bold tracking-widest uppercase text-nova-text">
              NovaRacing Telemetry
            </h1>
            {eventInfo && (
              <p className="text-xs text-nova-dim truncate max-w-xs">{eventInfo.displayName}</p>
            )}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-4">
          {/* Data source indicator */}
          {loadedLap ? (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-amber-900/40 border border-amber-700/50 text-amber-400 font-semibold">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400" />
                Lap {loadedLap.lapNumber}
              </span>
              <button
                onClick={() => setLoadedLap(null)}
                className="text-[10px] text-nova-muted hover:text-nova-text transition-colors"
                title="Clear loaded lap, return to live view"
              >
                ✕ clear
              </button>
            </div>
          ) : connectionState === "receiving" ? (
            <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-green-900/40 border border-green-700/50 text-green-400 font-semibold">
              <span className="blink inline-block w-1.5 h-1.5 rounded-full bg-green-400" />
              Live · {packetCount} pkts
            </span>
          ) : (
            <span className="text-xs px-2.5 py-1 rounded-full bg-nova-muted/10 border border-nova-border text-nova-muted">
              No data
            </span>
          )}
          <ConnectionStatus
            state={connectionState}
            proxyUrl={proxyUrl}
            lastError={lastError}
            packetCount={packetCount}
            lastPacketAt={lastPacketAt}
            onConnect={connect}
            onDisconnect={disconnect}
            disabled={!eventInfo}
          />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Resizable sidebar */}
        <aside
          className="border-r border-nova-border bg-nova-panel flex flex-col overflow-hidden flex-shrink-0"
          style={{ width: sidebar.width }}
        >
          <div className="p-4 border-b border-nova-border">
            <p className="text-xs text-nova-dim uppercase tracking-widest mb-3">Event Setup</p>
            <EventSelector onLoad={handleEventLoad} />
          </div>

          {/* Manual registration when connected without an event */}
          {isConnected && !eventInfo?.eventDeviceId && (
            <div className="p-4 border-b border-nova-border">
              <p className="text-xs text-nova-dim uppercase tracking-widest mb-2">
                Manual Registration
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={manualDeviceId}
                  onChange={(e) => setManualDeviceId(e.target.value)}
                  placeholder="eventDeviceId…"
                  className="flex-1 bg-black border border-nova-border rounded px-2 py-1 text-xs text-nova-text placeholder-nova-muted focus:outline-none focus:border-nova-red"
                />
                <button
                  onClick={() => manualDeviceId && manualRegister(manualDeviceId)}
                  disabled={!manualDeviceId}
                  className="px-2 py-1 text-xs rounded border border-nova-red text-nova-red hover:bg-nova-red/10 disabled:opacity-40"
                >
                  Register
                </button>
              </div>
            </div>
          )}

          {/* Channel list */}
          <div className="flex-1 overflow-auto p-3">
            {eventInfo && eventInfo.sensorList.length > 0 ? (
              <>
                <p className="text-xs text-nova-dim uppercase tracking-widest mb-2">
                  Channels ({eventInfo.sensorList.length})
                </p>
                <SensorGrid
                  sensors={eventInfo.sensorList}
                  values={latestValues}
                  onToggleChart={() => {}}
                  charted={new Set()}
                />
              </>
            ) : (
              <div className="text-xs text-nova-dim text-center py-8">
                Load an event to see channels.
              </div>
            )}
          </div>
        </aside>

        {/* Drag handle */}
        <div
          onMouseDown={sidebar.onMouseDown}
          className="w-1 flex-shrink-0 cursor-col-resize bg-nova-border hover:bg-nova-red/50 transition-colors active:bg-nova-red"
        />

        {/* Main content */}
        <main className="flex-1 overflow-auto flex flex-col min-w-0">
          {/* Tabs */}
          <div className="border-b border-nova-border bg-nova-panel flex items-center gap-1 px-4 flex-shrink-0">
            {(["discover", "gauges", "channels", "chart", "packets", "history"] as Tab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-3 text-xs uppercase tracking-widest transition-colors border-b-2 ${
                  activeTab === tab
                    ? "border-nova-red text-nova-text"
                    : "border-transparent text-nova-dim hover:text-nova-text"
                }`}
              >
                {tab}
                {tab === "packets" && packetCount > 0 && (
                  <span className="ml-1.5 text-[10px] bg-nova-red/20 text-nova-red px-1 rounded">
                    {packetCount > 999 ? "999+" : packetCount}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="flex-1 p-6 overflow-auto">
            {activeTab === "discover" && (
              <div className="max-w-2xl">
                <div className="mb-5">
                  <h2 className="text-base font-bold text-nova-text">Live Events</h2>
                  <p className="text-xs text-nova-dim mt-0.5">
                    Active Podium telemetry sessions — select one to load its dashboard.
                  </p>
                </div>
                <LiveEventsList
                  onLoad={handleEventLoad}
                  onDirectConnect={(id) => {
                    manualRegister(id);
                    setActiveTab("gauges");
                  }}
                />
              </div>
            )}

            {activeTab === "gauges" && (
              <GaugesTab values={displayLatestValues} />
            )}

            {activeTab === "channels" && (
              <div className="max-w-2xl">
                {eventInfo && eventInfo.sensorList.length > 0 ? (
                  <SensorGrid
                    sensors={eventInfo.sensorList}
                    values={displayLatestValues}
                    onToggleChart={() => {}}
                    charted={new Set()}
                  />
                ) : (
                  <EmptyState message="Load an event page to see all channels." />
                )}
              </div>
            )}

            {activeTab === "chart" && (
              <ChartsDashboard
                history={displayHistory}
                availableChannels={availableChannels}
                widgets={widgets}
                onAddWidget={addWidget}
                onRemoveWidget={removeWidget}
                onUpdateWidget={updateWidget}
                onMoveWidget={moveWidget}
              />
            )}

            {activeTab === "packets" && (
              <div className="max-w-3xl">
                <PacketInspector
                  packets={recentPackets}
                  sensors={eventInfo?.sensorList ?? []}
                />
              </div>
            )}

            {activeTab === "history" && (
              <div className="max-w-2xl">
                {eventInfo ? (
                  <LapHistory
                    laps={eventInfo.lapData}
                    eventTitle={eventInfo.eventTitle}
                    displayName={eventInfo.displayName}
                    eventNumericId={eventInfo.eventNumericId}
                    deviceNumericId={eventInfo.deviceNumericId}
                    onLapLoad={setLoadedLap}
                  />
                ) : (
                  <EmptyState message="Load an event page to see lap history." />
                )}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Footer */}
      <footer className="border-t border-nova-border bg-nova-panel px-4 py-1.5 flex items-center gap-4 text-[11px] text-nova-dim flex-shrink-0">
        <span>State: <span className="text-nova-text">{connectionState}</span></span>
        {eventInfo && (
          <>
            <span>Event: <span className="text-nova-text font-mono">{eventInfo.eventId.slice(0, 8)}…</span></span>
            <span>Device: <span className="text-nova-text font-mono">{eventInfo.deviceId}</span></span>
            {eventInfo.eventDeviceId && (
              <span>EDI: <span className="text-nova-text font-mono">{eventInfo.eventDeviceId}</span></span>
            )}
          </>
        )}
        <span className="ml-auto">NovaRacing Telemetry Dashboard</span>
      </footer>
    </div>
  );
}

function GaugesTab({ values }: { values: Record<string, number | null> }) {
  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="text-xs text-nova-dim uppercase tracking-widest mb-4">Primary</h2>
        <div className="flex flex-wrap gap-4">
          {(["GPS_Speed", "Battery", "Lambda", "Gear"] as const).map((ch) => {
            const cfg = GAUGE_CONFIG[ch];
            if (!cfg) return null;
            return (
              <GaugeCard
                key={ch}
                label={ch.replace("_", " ")}
                value={values[ch] ?? null}
                unit={cfg.unit}
                min={cfg.min}
                max={cfg.max}
                decimals={cfg.decimals}
                color={cfg.color}
                size={140}
              />
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-xs text-nova-dim uppercase tracking-widest mb-4">Timing</h2>
        <div className="flex flex-wrap gap-4">
          {(["LapTime", "BestLap", "LapCount", "Odometer"] as const).map((ch) => {
            const cfg = GAUGE_CONFIG[ch];
            if (!cfg) return null;
            return (
              <GaugeCard
                key={ch}
                label={ch}
                value={values[ch] ?? null}
                unit={cfg.unit}
                min={cfg.min}
                max={cfg.max}
                decimals={cfg.decimals}
                color={cfg.color}
                size={120}
              />
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-xs text-nova-dim uppercase tracking-widest mb-4">Live Values</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {KEY_GAUGES.map((ch) => {
            const val = values[ch];
            const cfg = GAUGE_CONFIG[ch];
            return (
              <div key={ch} className="bg-nova-panel border border-nova-border rounded p-3 flex flex-col gap-1">
                <span className="text-xs text-nova-dim uppercase tracking-widest">{ch}</span>
                <span className="text-2xl font-bold tabular-nums leading-none" style={{ color: cfg?.color ?? "#e0e0e0" }}>
                  {val !== null && val !== undefined ? val.toFixed(cfg?.decimals ?? 2) : "—"}
                </span>
                {cfg?.unit && <span className="text-xs text-nova-muted">{cfg.unit}</span>}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-40 text-sm text-nova-dim">
      {message}
    </div>
  );
}
