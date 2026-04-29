"use client";

import { useState } from "react";
import type { SensorPacket } from "@/lib/types";

interface PacketInspectorProps {
  packets: SensorPacket[];
  sensors: { name: string; units?: string; precision?: number }[];
}

export default function PacketInspector({ packets, sensors }: PacketInspectorProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [view, setView] = useState<"decoded" | "raw">("decoded");

  const packet = packets[selectedIndex];
  const sensorMeta = Object.fromEntries(sensors.map((s) => [s.name, s]));

  if (packets.length === 0) {
    return (
      <div className="text-xs text-nova-dim text-center py-6">
        No packets received yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 text-xs">
      <div className="flex items-center gap-2">
        <select
          value={selectedIndex}
          onChange={(e) => setSelectedIndex(Number(e.target.value))}
          className="bg-black border border-nova-border rounded px-2 py-1 text-nova-text text-xs focus:outline-none focus:border-nova-red"
        >
          {packets.map((p, i) => (
            <option key={i} value={i}>
              #{packets.length - i} — {new Date(p.timestamp).toLocaleTimeString()}
            </option>
          ))}
        </select>

        <div className="flex rounded overflow-hidden border border-nova-border">
          {(["decoded", "raw"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-2 py-1 text-xs transition-colors ${
                view === v
                  ? "bg-nova-red text-white"
                  : "bg-nova-panel text-nova-dim hover:bg-white/5"
              }`}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>

        {packet && (
          <span className="text-nova-dim ml-auto">
            {packet.values.length} channels
          </span>
        )}
      </div>

      {packet && (
        <div className="bg-black rounded border border-nova-border overflow-auto max-h-72">
          {view === "decoded" ? (
            <table className="w-full">
              <thead>
                <tr className="border-b border-nova-border text-nova-dim">
                  <th className="px-2 py-1 text-left font-normal">channel</th>
                  <th className="px-2 py-1 text-right font-normal">value</th>
                  <th className="px-2 py-1 text-left font-normal pl-2">unit</th>
                </tr>
              </thead>
              <tbody>
                {packet.values.map((v, i) => {
                  const meta = sensorMeta[v.name];
                  const isPosition = "latitude" in v;
                  return (
                    <tr key={i} className="border-b border-nova-border/50 hover:bg-white/5">
                      <td className="px-2 py-0.5 text-nova-text">{v.name}</td>
                      <td className="px-2 py-0.5 text-right tabular-nums text-nova-text">
                        {isPosition
                          ? `${(v as {latitude: number}).latitude.toFixed(6)}, ${(v as {longitude: number}).longitude.toFixed(6)}`
                          : ("value" in v ? (v.value as number).toFixed(meta?.precision ?? 3) : "—")}
                      </td>
                      <td className="px-2 py-0.5 pl-2 text-nova-muted">
                        {isPosition ? "lat,lng" : (meta?.units ?? "")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <pre className="p-3 text-nova-text text-[11px] leading-relaxed overflow-auto whitespace-pre-wrap">
              {JSON.stringify(packet.raw, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
