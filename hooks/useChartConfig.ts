"use client";

import { useState, useEffect, useCallback } from "react";

export type WidgetType = "line" | "scatter" | "gps";

export interface ChartWidget {
  id: string;
  title: string;
  channels: string[];
  type: WidgetType;
  xChannel?: string;
  yChannel?: string;
}

const DEFAULT_WIDGETS: ChartWidget[] = [
  { id: "d1", title: "Speed & Engine", channels: ["GPS_Speed", "Engine_Spee"], type: "line" },
  { id: "d2", title: "Lambda & Throttle", channels: ["Lambda", "Throttle_Pe", "Front_Brake"], type: "line" },
  { id: "d3", title: "GPS Trace", channels: [], type: "gps" },
];

function storageKey(k: string) {
  return `nova-charts-${k}`;
}

function defaultWidgets() {
  return DEFAULT_WIDGETS.map((w) => ({ ...w, channels: [...w.channels] }));
}

function normalizeWidget(widget: Partial<ChartWidget>, index: number): ChartWidget | null {
  if (!widget || typeof widget !== "object") return null;
  const type = widget.type === "line" || widget.type === "scatter" || widget.type === "gps"
    ? widget.type
    : "line";

  return {
    id: typeof widget.id === "string" ? widget.id : `stored-${index}`,
    title: typeof widget.title === "string"
      ? widget.title
      : type === "gps"
        ? "GPS Trace"
        : type === "scatter"
          ? "Scatter Plot"
          : "New Chart",
    channels: Array.isArray(widget.channels) ? widget.channels.filter((ch): ch is string => typeof ch === "string") : [],
    type,
    xChannel: typeof widget.xChannel === "string" ? widget.xChannel : undefined,
    yChannel: typeof widget.yChannel === "string" ? widget.yChannel : undefined,
  };
}

export function useChartConfig(deviceKey: string | null) {
  const [widgets, setWidgets] = useState<ChartWidget[]>(() => defaultWidgets());

  useEffect(() => {
    if (!deviceKey) {
      setWidgets(defaultWidgets());
      return;
    }
    try {
      const raw = localStorage.getItem(storageKey(deviceKey));
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<ChartWidget>[];
        const normalized = Array.isArray(parsed)
          ? parsed.map(normalizeWidget).filter((w): w is ChartWidget => w !== null)
          : [];
        if (normalized.length > 0) {
          setWidgets(normalized);
          return;
        }
      }
    } catch { /* ignore */ }
    setWidgets(defaultWidgets());
  }, [deviceKey]);

  const persist = useCallback((ws: ChartWidget[]) => {
    setWidgets(ws);
    if (deviceKey) {
      try { localStorage.setItem(storageKey(deviceKey), JSON.stringify(ws)); } catch { /* ignore */ }
    }
  }, [deviceKey]);

  const addWidget = useCallback((type: WidgetType) => {
    const id = `w-${Date.now()}`;
    const title = type === "gps" ? "GPS Trace" : type === "scatter" ? "Scatter Plot" : "New Chart";
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
