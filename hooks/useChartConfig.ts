"use client";

import { useState, useEffect, useCallback } from "react";

export type WidgetType = "line" | "gps";

export interface ChartWidget {
  id: string;
  title: string;
  channels: string[];
  type: WidgetType;
}

const DEFAULT_WIDGETS: ChartWidget[] = [
  { id: "d1", title: "Speed & Engine", channels: ["GPS_Speed", "Engine_Spee"], type: "line" },
  { id: "d2", title: "Lambda & Throttle", channels: ["Lambda", "Throttle_Pe", "Front_Brake"], type: "line" },
  { id: "d3", title: "GPS Trace", channels: [], type: "gps" },
];

function storageKey(k: string) {
  return `nova-charts-${k}`;
}

export function useChartConfig(deviceKey: string | null) {
  const [widgets, setWidgets] = useState<ChartWidget[]>(DEFAULT_WIDGETS);

  useEffect(() => {
    if (!deviceKey) return;
    try {
      const raw = localStorage.getItem(storageKey(deviceKey));
      if (raw) {
        const parsed = JSON.parse(raw) as ChartWidget[];
        if (Array.isArray(parsed) && parsed.length > 0) setWidgets(parsed);
      }
    } catch { /* ignore */ }
  }, [deviceKey]);

  const persist = useCallback((ws: ChartWidget[]) => {
    setWidgets(ws);
    if (deviceKey) {
      try { localStorage.setItem(storageKey(deviceKey), JSON.stringify(ws)); } catch { /* ignore */ }
    }
  }, [deviceKey]);

  const addWidget = useCallback((type: WidgetType) => {
    const id = `w-${Date.now()}`;
    const title = type === "gps" ? "GPS Trace" : "New Chart";
    persist([...widgets, { id, title, channels: [], type }]);
  }, [widgets, persist]);

  const removeWidget = useCallback((id: string) => {
    persist(widgets.filter((w) => w.id !== id));
  }, [widgets, persist]);

  const updateWidget = useCallback((id: string, patch: Partial<ChartWidget>) => {
    persist(widgets.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  }, [widgets, persist]);

  const moveWidget = useCallback((id: string, dir: -1 | 1) => {
    const idx = widgets.findIndex((w) => w.id === id);
    if (idx < 0) return;
    const next = idx + dir;
    if (next < 0 || next >= widgets.length) return;
    const arr = [...widgets];
    [arr[idx], arr[next]] = [arr[next], arr[idx]];
    persist(arr);
  }, [widgets, persist]);

  return { widgets, addWidget, removeWidget, updateWidget, moveWidget };
}
