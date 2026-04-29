"use client";

import { useState, useMemo } from "react";
import type { Sensor } from "@/lib/types";
import { formatValue } from "@/lib/podium-parser";
import { TIRE_CHANNEL_PREFIXES } from "@/lib/types";

interface SensorGridProps {
  sensors: Sensor[];
  values: Record<string, number | null>;
  onToggleChart?: (name: string) => void;
  charted?: Set<string>;
}

function isTireChannel(name: string) {
  return TIRE_CHANNEL_PREFIXES.some((p) => name.startsWith(p));
}

function getTireGroup(name: string): string | null {
  const match = TIRE_CHANNEL_PREFIXES.find((p) => name.startsWith(p));
  return match ?? null;
}

function groupSensors(sensors: Sensor[]) {
  const groups: Record<string, Sensor[]> = {
    Lap: [],
    Engine: [],
    GPS: [],
    Tires: [],
    IMU: [],
    Misc: [],
  };

  for (const s of sensors) {
    const n = s.name;
    if (["LapTime", "BestLap", "PredTime", "LapDelta", "LapCount", "Distance", "Odometer"].includes(n)) {
      groups.Lap.push(s);
    } else if (["Battery", "Lambda", "Gear", "ETC_Fault"].includes(n) || n.startsWith("ETC")) {
      groups.Engine.push(s);
    } else if (n.startsWith("GPS")) {
      groups.GPS.push(s);
    } else if (isTireChannel(n) || n.startsWith("FLTT")) {
      groups.Tires.push(s);
    } else if (["Pitch", "Roll", "Yaw"].includes(n) || n.startsWith("Accel") || n.startsWith("Gyro")) {
      groups.IMU.push(s);
    } else {
      groups.Misc.push(s);
    }
  }

  return groups;
}

interface SensorRowProps {
  sensor: Sensor;
  value: number | null;
  onToggle?: () => void;
  isCharted?: boolean;
}

function SensorRow({ sensor, value, onToggle, isCharted }: SensorRowProps) {
  const hasValue = value !== null;
  const formatted = formatValue(value, sensor);
  const isActive = hasValue && value !== 0;

  return (
    <div
      className={`flex items-center justify-between px-2 py-1 rounded text-xs hover:bg-white/5 group transition-colors ${
        isCharted ? "bg-nova-red/10 border-l-2 border-nova-red" : ""
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        {onToggle && (
          <button
            onClick={onToggle}
            title={isCharted ? "Remove from chart" : "Add to chart"}
            className={`opacity-0 group-hover:opacity-100 transition-opacity text-xs px-1 rounded ${
              isCharted ? "text-nova-red" : "text-nova-dim hover:text-nova-text"
            }`}
          >
            {isCharted ? "✕" : "+"}
          </button>
        )}
        <span className="text-nova-dim truncate">{sensor.name}</span>
        {sensor.units && (
          <span className="text-nova-muted text-[10px]">{sensor.units}</span>
        )}
      </div>
      <span
        className={`font-semibold ml-2 tabular-nums ${
          isActive ? "text-nova-text" : "text-nova-muted"
        }`}
      >
        {formatted}
      </span>
    </div>
  );
}

export default function SensorGrid({ sensors, values, onToggleChart, charted }: SensorGridProps) {
  const [filter, setFilter] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    Lap: true,
    Engine: true,
    GPS: true,
    Tires: false,
    IMU: false,
    Misc: false,
  });

  const groups = useMemo(() => groupSensors(sensors), [sensors]);

  const filtered = useMemo(() => {
    if (!filter.trim()) return null;
    const q = filter.toLowerCase();
    return sensors.filter((s) => s.name.toLowerCase().includes(q));
  }, [filter, sensors]);

  const toggleGroup = (g: string) =>
    setExpandedGroups((prev) => ({ ...prev, [g]: !prev[g] }));

  if (sensors.length === 0) {
    return (
      <div className="text-sm text-nova-dim p-4 text-center">
        No sensors loaded. Parse an event page first.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        type="text"
        placeholder="Filter channels…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="w-full bg-black border border-nova-border rounded px-2 py-1 text-xs text-nova-text placeholder-nova-muted focus:outline-none focus:border-nova-red"
      />

      {filtered ? (
        <div className="flex flex-col gap-0.5">
          {filtered.length === 0 ? (
            <p className="text-xs text-nova-dim py-2 text-center">No matches</p>
          ) : (
            filtered.map((s) => (
              <SensorRow
                key={s.name}
                sensor={s}
                value={values[s.name] ?? null}
                onToggle={onToggleChart ? () => onToggleChart(s.name) : undefined}
                isCharted={charted?.has(s.name)}
              />
            ))
          )}
        </div>
      ) : (
        Object.entries(groups).map(([group, gsensors]) => {
          if (gsensors.length === 0) return null;
          const expanded = expandedGroups[group] ?? false;
          return (
            <div key={group} className="border border-nova-border rounded overflow-hidden">
              <button
                onClick={() => toggleGroup(group)}
                className="w-full flex items-center justify-between px-2 py-1.5 bg-nova-panel hover:bg-white/5 transition-colors text-xs"
              >
                <span className="text-nova-dim uppercase tracking-widest font-semibold">
                  {group}
                </span>
                <span className="text-nova-muted">
                  {gsensors.length} ch {expanded ? "▲" : "▼"}
                </span>
              </button>
              {expanded && (
                <div className="p-1 flex flex-col gap-0.5">
                  {gsensors.map((s) => (
                    <SensorRow
                      key={s.name}
                      sensor={s}
                      value={values[s.name] ?? null}
                      onToggle={onToggleChart ? () => onToggleChart(s.name) : undefined}
                      isCharted={charted?.has(s.name)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
