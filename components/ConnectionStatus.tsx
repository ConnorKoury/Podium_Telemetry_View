"use client";

import type { ConnectionState } from "@/lib/types";

const STATE_LABELS: Record<ConnectionState, string> = {
  idle: "Idle",
  connecting: "Connecting…",
  connected: "Connected",
  registered: "Subscribed",
  receiving: "Live",
  error: "Error",
  disconnected: "Disconnected",
};

const STATE_COLORS: Record<ConnectionState, string> = {
  idle: "bg-nova-muted",
  connecting: "bg-yellow-500",
  connected: "bg-blue-500",
  registered: "bg-blue-400",
  receiving: "bg-green-500",
  error: "bg-red-500",
  disconnected: "bg-nova-muted",
};

interface Props {
  state: ConnectionState;
  proxyUrl?: string | null;
  lastError?: string | null;
  packetCount?: number;
  lastPacketAt?: number | null;
  onConnect: () => void;
  onDisconnect: () => void;
  disabled?: boolean;
}

export default function ConnectionStatus({
  state,
  proxyUrl,
  lastError,
  packetCount,
  lastPacketAt,
  onConnect,
  onDisconnect,
  disabled,
}: Props) {
  const isActive = state === "connecting" || state === "connected" ||
    state === "registered" || state === "receiving";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block w-2.5 h-2.5 rounded-full ${STATE_COLORS[state]} ${
              state === "receiving" ? "blink" : ""
            }`}
          />
          <span className="text-sm font-semibold tracking-wide">
            {STATE_LABELS[state]}
          </span>
        </div>

        {packetCount !== undefined && packetCount > 0 && (
          <span className="text-xs text-nova-dim">
            {packetCount.toLocaleString()} pkts
          </span>
        )}

        {lastPacketAt && (
          <span className="text-xs text-nova-dim">
            last: {new Date(lastPacketAt).toLocaleTimeString()}
          </span>
        )}

        {isActive ? (
          <button
            onClick={onDisconnect}
            className="ml-auto px-3 py-1 text-xs rounded border border-red-800 text-red-400 hover:bg-red-900/30 transition-colors"
          >
            Disconnect
          </button>
        ) : (
          <button
            onClick={onConnect}
            disabled={disabled}
            className="ml-auto px-3 py-1 text-xs rounded border border-nova-red text-nova-red hover:bg-nova-red/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Connect
          </button>
        )}
      </div>

      {proxyUrl && (
        <p className="text-xs text-nova-dim font-mono truncate">{proxyUrl.replace("wss://", "")}</p>
      )}

      {lastError && (
        <p className="text-xs text-red-400 bg-red-950/30 border border-red-900/50 rounded px-2 py-1">
          {lastError}
        </p>
      )}
    </div>
  );
}
