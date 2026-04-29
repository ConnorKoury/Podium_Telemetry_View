"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { TimeSeriesPoint } from "@/lib/types";

const CHART_COLORS = [
  "#e53935", "#43a047", "#1e88e5", "#fb8c00",
  "#8e24aa", "#00acc1", "#e91e63", "#00e676",
];

interface TimeSeriesChartProps {
  data: TimeSeriesPoint[];
  channels: string[];
  onRemoveChannel?: (ch: string) => void;
}

function formatTime(t: number): string {
  return new Date(t).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// Custom tooltip
function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-nova-panel border border-nova-border rounded p-2 text-xs shadow-xl">
      {label ? <p className="text-nova-dim mb-1">{formatTime(label)}</p> : null}
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-nova-dim">{p.name}:</span>
          <span className="font-semibold" style={{ color: p.color }}>
            {typeof p.value === "number" ? p.value.toFixed(3) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function TimeSeriesChart({
  data,
  channels,
  onRemoveChannel,
}: TimeSeriesChartProps) {
  if (channels.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-xs text-nova-dim">
        Click <span className="mx-1 text-nova-text font-bold">+</span> next to a channel in the sensor list to add it to the chart.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        {channels.map((ch, i) => (
          <div
            key={ch}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-xs border"
            style={{
              borderColor: CHART_COLORS[i % CHART_COLORS.length] + "66",
              background: CHART_COLORS[i % CHART_COLORS.length] + "22",
              color: CHART_COLORS[i % CHART_COLORS.length],
            }}
          >
            {ch}
            {onRemoveChannel && (
              <button
                onClick={() => onRemoveChannel(ch)}
                className="ml-1 hover:opacity-70"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#222" />
          <XAxis
            dataKey="t"
            tickFormatter={formatTime}
            tick={{ fill: "#888", fontSize: 10 }}
            stroke="#333"
          />
          <YAxis tick={{ fill: "#888", fontSize: 10 }} stroke="#333" width={50} />
          <Tooltip content={<CustomTooltip />} />
          {channels.map((ch, i) => (
            <Line
              key={ch}
              type="monotone"
              dataKey={ch}
              stroke={CHART_COLORS[i % CHART_COLORS.length]}
              dot={false}
              isAnimationActive={false}
              strokeWidth={1.5}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
