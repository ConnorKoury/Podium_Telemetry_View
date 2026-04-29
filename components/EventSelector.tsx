"use client";

import { useState } from "react";
import type { ParsedEventInfo } from "@/lib/types";

interface EventSelectorProps {
  onLoad: (info: ParsedEventInfo) => void;
}

const DEFAULT_URL =
  "https://podium.live/events/8a2ab376-b73a-4bd4-bce5-76a74c8d8627/device/novaracing-telemetry";

export default function EventSelector({ onLoad }: EventSelectorProps) {
  const [url, setUrl] = useState(DEFAULT_URL);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<ParsedEventInfo | null>(null);

  const handleFetch = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/parse-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json() as ParsedEventInfo & { error?: string };
      if (!res.ok || data.error) {
        setError(data.error ?? "Unknown error");
        return;
      }
      setInfo(data);
      onLoad(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fetch failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleFetch()}
          placeholder="https://podium.live/events/<id>/device/<name>"
          className="flex-1 bg-black border border-nova-border rounded px-3 py-2 text-sm text-nova-text placeholder-nova-muted focus:outline-none focus:border-nova-red"
        />
        <button
          onClick={handleFetch}
          disabled={loading || !url.trim()}
          className="px-4 py-2 bg-nova-red text-white text-sm rounded hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed font-semibold"
        >
          {loading ? "Loading…" : "Load"}
        </button>
      </div>

      {error && (
        <div className="text-xs text-red-400 bg-red-950/30 border border-red-900/50 rounded px-3 py-2">
          {error}
        </div>
      )}

      {info && (
        <div className="bg-nova-panel border border-nova-border rounded p-3 flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs text-nova-dim uppercase tracking-widest">Event</span>
            <span className="text-sm font-semibold text-nova-text">{info.displayName}</span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <Field label="Event ID" value={info.eventId} />
            <Field label="Device ID" value={info.deviceId} />
            <Field label="EventDevice ID" value={info.eventDeviceId ?? "—"} />
            <Field label="Sensors" value={`${info.sensorList.length} channels`} />
          </div>

          {info.sensorList.length === 0 && (
            <p className="text-xs text-yellow-500 bg-yellow-950/30 border border-yellow-900/50 rounded px-2 py-1 mt-1">
              sensorList not found in page. Sensor decoding will be unavailable — raw values will still be shown.
            </p>
          )}

          {!info.eventDeviceId && (
            <p className="text-xs text-yellow-500 bg-yellow-950/30 border border-yellow-900/50 rounded px-2 py-1">
              eventDeviceId not found. Will attempt to discover via listTelemetryStreamSessions.
            </p>
          )}
        </div>
      )}

    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-nova-muted">{label}:</span>
      <span className="text-nova-text font-mono truncate">{value}</span>
    </div>
  );
}
