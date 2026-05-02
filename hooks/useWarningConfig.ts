"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface WarningDefinition {
  id: string;
  name: string;
  display: string;
  channel: string;
  equals: number;
  enabled: boolean;
}

export interface ActiveWarning extends WarningDefinition {
  value: number;
  activatedAt: number;
}

export interface WarningLogEntry {
  id: string;
  warningId: string;
  name: string;
  display: string;
  channel: string;
  equals: number;
  value: number;
  at: number;
}

const MAX_LOG_ENTRIES = 200;

const DEFAULT_WARNINGS: WarningDefinition[] = [
  { id: "fuel-pressure", name: "Fuel Pressure", display: "Fuel pressure", channel: "Motec_Warni", equals: 4, enabled: true },
  { id: "brake-fault", name: "Brake Fault", display: "BRAKE FAULT", channel: "ETC_Fault", equals: -7, enabled: true },
  { id: "pedal-fault", name: "Pedal Fault", display: "PEDAL FAULT", channel: "ETC_Fault", equals: -6, enabled: true },
  { id: "pedal-tracking-fault", name: "Pedal Tracking Fault", display: "PEDAL TRACK", channel: "ETC_Fault", equals: -5, enabled: true },
  { id: "servo-sensor", name: "Servo Sensor", display: "SERVO SENSOR", channel: "ETC_Fault", equals: -4, enabled: true },
  { id: "servo-tracking", name: "Servo Tracking", display: "SERVO TRACK", channel: "ETC_Fault", equals: -3, enabled: true },
  { id: "braking-during-throttle", name: "Braking during Throttle", display: "BRAKE THROT", channel: "ETC_Fault", equals: -2, enabled: true },
  { id: "throttle-target", name: "Throttle Target", display: "THROT TARG", channel: "ETC_Fault", equals: -1, enabled: true },
  { id: "oil-pressure", name: "Oil Pressure", display: "OIL PRESS", channel: "Motec_Warni", equals: 1, enabled: true },
  { id: "oil-temp", name: "Oil Temp", display: "OIL TEMP", channel: "Motec_Warni", equals: 8, enabled: true },
  { id: "cool-temp", name: "Cool Temp", display: "COOL TEMP", channel: "Motec_Warni", equals: 6, enabled: true },
];

function configStorageKey(k: string) {
  return `nova-warnings-${k}`;
}

function logStorageKey(k: string) {
  return `nova-warning-log-${k}`;
}

function defaultWarnings() {
  return DEFAULT_WARNINGS.map((w) => ({ ...w }));
}

function normalizeWarning(item: Partial<WarningDefinition>, index: number): WarningDefinition | null {
  if (!item || typeof item !== "object") return null;
  const channel = typeof item.channel === "string" ? item.channel : "";
  const equals = typeof item.equals === "number" && Number.isFinite(item.equals) ? item.equals : null;
  if (!channel || equals === null) return null;

  return {
    id: typeof item.id === "string" ? item.id : `warning-${index}`,
    name: typeof item.name === "string" ? item.name : `Warning ${index + 1}`,
    display: typeof item.display === "string" ? item.display : typeof item.name === "string" ? item.name : `WARNING ${index + 1}`,
    channel,
    equals,
    enabled: typeof item.enabled === "boolean" ? item.enabled : true,
  };
}

function normalizeLog(item: Partial<WarningLogEntry>): WarningLogEntry | null {
  if (!item || typeof item !== "object") return null;
  if (
    typeof item.id !== "string" ||
    typeof item.warningId !== "string" ||
    typeof item.name !== "string" ||
    typeof item.display !== "string" ||
    typeof item.channel !== "string" ||
    typeof item.equals !== "number" ||
    typeof item.value !== "number" ||
    typeof item.at !== "number"
  ) {
    return null;
  }
  return item as WarningLogEntry;
}

export function evaluateWarnings(
  definitions: WarningDefinition[],
  values: Record<string, number | null>
): ActiveWarning[] {
  const now = Date.now();
  return definitions.flatMap((definition) => {
    if (!definition.enabled) return [];
    const value = values[definition.channel];
    if (typeof value !== "number") return [];
    return value === definition.equals ? [{ ...definition, value, activatedAt: now }] : [];
  });
}

export function useWarningConfig(deviceKey: string | null) {
  const [definitions, setDefinitions] = useState<WarningDefinition[]>(() => defaultWarnings());

  useEffect(() => {
    if (!deviceKey) {
      setDefinitions(defaultWarnings());
      return;
    }
    try {
      const raw = localStorage.getItem(configStorageKey(deviceKey));
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<WarningDefinition>[];
        const normalized = Array.isArray(parsed)
          ? parsed.map(normalizeWarning).filter((w): w is WarningDefinition => w !== null)
          : [];
        if (normalized.length > 0) {
          setDefinitions(normalized);
          return;
        }
      }
    } catch { /* ignore */ }
    setDefinitions(defaultWarnings());
  }, [deviceKey]);

  const persist = useCallback((next: WarningDefinition[]) => {
    setDefinitions(next);
    if (deviceKey) {
      try { localStorage.setItem(configStorageKey(deviceKey), JSON.stringify(next)); } catch { /* ignore */ }
    }
  }, [deviceKey]);

  const updateWarning = useCallback((id: string, patch: Partial<WarningDefinition>) => {
    persist(definitions.map((warning) => warning.id === id ? { ...warning, ...patch } : warning));
  }, [definitions, persist]);

  const resetWarnings = useCallback(() => {
    const next = defaultWarnings();
    setDefinitions(next);
    if (deviceKey) {
      try { localStorage.removeItem(configStorageKey(deviceKey)); } catch { /* ignore */ }
    }
  }, [deviceKey]);

  return { definitions, updateWarning, resetWarnings };
}

export function useWarningLog(deviceKey: string | null, activeWarnings: ActiveWarning[]) {
  const [log, setLog] = useState<WarningLogEntry[]>([]);
  const activeIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    activeIdsRef.current = new Set();
    if (!deviceKey) {
      setLog([]);
      return;
    }
    try {
      const raw = localStorage.getItem(logStorageKey(deviceKey));
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<WarningLogEntry>[];
        const normalized = Array.isArray(parsed)
          ? parsed.map(normalizeLog).filter((entry): entry is WarningLogEntry => entry !== null)
          : [];
        setLog(normalized.slice(0, MAX_LOG_ENTRIES));
        return;
      }
    } catch { /* ignore */ }
    setLog([]);
  }, [deviceKey]);

  useEffect(() => {
    const nextActiveIds = new Set(activeWarnings.map((warning) => warning.id));
    const newlyActive = activeWarnings.filter((warning) => !activeIdsRef.current.has(warning.id));
    activeIdsRef.current = nextActiveIds;
    if (newlyActive.length === 0) return;

    const at = Date.now();
    const entries = newlyActive.map((warning) => ({
      id: `${warning.id}-${at}`,
      warningId: warning.id,
      name: warning.name,
      display: warning.display,
      channel: warning.channel,
      equals: warning.equals,
      value: warning.value,
      at,
    }));

    setLog((current) => {
      const next = [...entries, ...current].slice(0, MAX_LOG_ENTRIES);
      if (deviceKey) {
        try { localStorage.setItem(logStorageKey(deviceKey), JSON.stringify(next)); } catch { /* ignore */ }
      }
      return next;
    });
  }, [activeWarnings, deviceKey]);

  const clearLog = useCallback(() => {
    setLog([]);
    if (deviceKey) {
      try { localStorage.removeItem(logStorageKey(deviceKey)); } catch { /* ignore */ }
    }
  }, [deviceKey]);

  return useMemo(() => ({ log, clearLog }), [log, clearLog]);
}
