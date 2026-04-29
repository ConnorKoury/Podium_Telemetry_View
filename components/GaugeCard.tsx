"use client";

interface GaugeCardProps {
  label: string;
  value: number | null | undefined;
  unit: string;
  min: number;
  max: number;
  decimals?: number;
  color?: string;
  size?: number;
}

export default function GaugeCard({
  label,
  value,
  unit,
  min,
  max,
  decimals = 1,
  color = "#e53935",
  size = 120,
}: GaugeCardProps) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.38;
  const strokeWidth = size * 0.07;

  // Arc spans 240° starting at 150° (bottom-left)
  const startAngle = 150;
  const totalAngle = 240;

  const circumference = 2 * Math.PI * r;
  // Convert arc degrees to path
  const arcLength = (totalAngle / 360) * circumference;
  const gapLength = circumference - arcLength;

  const pct = value !== null && value !== undefined
    ? Math.max(0, Math.min(1, (value - min) / (max - min)))
    : 0;

  const filledLength = pct * arcLength;
  const rotation = startAngle - 90; // SVG 0° is top

  const displayValue =
    value !== null && value !== undefined ? value.toFixed(decimals) : "—";

  return (
    <div className="flex flex-col items-center gap-1 bg-nova-panel border border-nova-border rounded-lg p-3">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="overflow-visible">
          {/* Track */}
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="#222"
            strokeWidth={strokeWidth}
            strokeDasharray={`${arcLength} ${gapLength}`}
            strokeDashoffset={0}
            strokeLinecap="round"
            transform={`rotate(${rotation} ${cx} ${cy})`}
          />
          {/* Fill */}
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={value !== null && value !== undefined ? color : "#333"}
            strokeWidth={strokeWidth}
            strokeDasharray={`${filledLength} ${circumference - filledLength}`}
            strokeDashoffset={0}
            strokeLinecap="round"
            transform={`rotate(${rotation} ${cx} ${cy})`}
            className="gauge-arc"
          />
        </svg>

        {/* Center value */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="font-bold leading-none"
            style={{
              fontSize: size * 0.2,
              color: value !== null && value !== undefined ? color : "#444",
            }}
          >
            {displayValue}
          </span>
          {unit && (
            <span className="text-nova-dim leading-none mt-0.5" style={{ fontSize: size * 0.1 }}>
              {unit}
            </span>
          )}
        </div>
      </div>

      <span className="text-xs text-nova-dim tracking-wider uppercase">{label}</span>
    </div>
  );
}
