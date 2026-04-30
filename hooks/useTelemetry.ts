"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ConnectionState,
  IncomingMessage,
  ParsedEventInfo,
  SensorPacket,
  TelemetrySession,
  TimeSeriesPoint,
  VertxMessage,
} from "@/lib/types";
import { decodeSensorValues } from "@/lib/podium-parser";
import type { ChannelValue } from "@/lib/types";

const MAX_HISTORY = 300;
const MAX_PACKETS = 20;

interface TelemetryState {
  connectionState: ConnectionState;
  proxyUrl: string | null;
  sessions: TelemetrySession[];
  latestValues: Record<string, number | null>;
  history: TimeSeriesPoint[];
  recentPackets: SensorPacket[];
  packetCount: number;
  lastError: string | null;
  lastPacketAt: number | null;
}

const INITIAL_STATE: TelemetryState = {
  connectionState: "idle",
  proxyUrl: null,
  sessions: [],
  latestValues: {},
  history: [],
  recentPackets: [],
  packetCount: 0,
  lastError: null,
  lastPacketAt: null,
};

export function useTelemetry(eventInfo: ParsedEventInfo | null) {
  const [state, setState] = useState<TelemetryState>(INITIAL_STATE);
  const wsRef = useRef<WebSocket | null>(null);
  const registeredRef = useRef<string | null>(null);

  const send = useCallback((msg: object) => {
    wsRef.current?.send(JSON.stringify(msg));
  }, []);

  const registerForDevice = useCallback(
    (eventDeviceId: string) => {
      if (registeredRef.current === eventDeviceId) return;
      registeredRef.current = eventDeviceId;

      const addresses = [
        `sensorData.${eventDeviceId}`,
        `event.${eventDeviceId}`,
        `alertmessage.${eventDeviceId}`,
      ];
      for (const address of addresses) {
        send({ type: "register", address, headers: {} });
      }
      setState((s) => ({ ...s, connectionState: "registered" }));
    },
    [send]
  );

  const listSessions = useCallback(() => {
    const replyAddress = `reply.sessions.${Date.now()}`;
    send({
      type: "send",
      address: "listTelemetryStreamSessions",
      headers: {},
      body: {},
      replyAddress,
    });
  }, [send]);

  const connect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    setState((s) => ({ ...s, connectionState: "proxy_connecting", lastError: null }));
    registeredRef.current = null;

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const wsServerUrl = process.env.NEXT_PUBLIC_WS_SERVER_URL;
    const wsUrl = wsServerUrl
      ? `${wsServerUrl.replace(/^http/, "ws")}/ws`
      : `${protocol}://${window.location.hostname}:${process.env.NEXT_PUBLIC_WS_PORT ?? "3001"}/ws`;

    if (!wsServerUrl && window.location.hostname !== "localhost") {
      setState((s) => ({
        ...s,
        connectionState: "error",
        lastError: "Live telemetry requires a WebSocket server. Set NEXT_PUBLIC_WS_SERVER_URL to enable it.",
      }));
      return;
    }

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      // Proxy connected message will come from server
    };

    ws.onmessage = (event) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(event.data as string) as Record<string, unknown>;
      } catch {
        return;
      }

      const msgType = msg.type as string | undefined;

      // Proxy meta messages injected by ws-server.ts (always have a type)
      if (msgType === "proxy_connected") {
        setState((s) => ({
          ...s,
          connectionState: "proxy_connected",
          proxyUrl: (msg.url as string) ?? null,
        }));
        send({ type: "ping" });
        listSessions();
        if (eventInfo?.eventDeviceId) {
          setTimeout(() => registerForDevice(eventInfo.eventDeviceId!), 500);
        }
        return;
      }
      if (msgType === "proxy_disconnected") {
        setState((s) => ({
          ...s,
          connectionState: "disconnected",
          lastError: `Disconnected: code ${(msg.code as number) ?? "?"}`,
        }));
        return;
      }
      if (msgType === "proxy_error") {
        setState((s) => ({
          ...s,
          connectionState: "error",
          lastError: (msg.message as string) ?? "WebSocket proxy error",
        }));
        return;
      }

      // Standard Vert.x protocol
      if (msgType === "pong") return;
      if (msgType === "err") {
        setState((s) => ({
          ...s,
          lastError: (msg.message as string) ?? `EventBus error: ${msg.failureType}`,
        }));
        return;
      }

      // Podium data messages: type is ABSENT — they only have {address, body}
      // Do NOT gate on type === "message"; just check for address presence.
      if (typeof msg.address === "string") {
        handleAddressedMessage(msg.address, msg.body);
      }
    };

    ws.onclose = (ev) => {
      setState((s) => ({
        ...s,
        connectionState: s.connectionState === "proxy_connecting" ? "error" : "disconnected",
        lastError: ev.code !== 1000 ? `WebSocket closed (${ev.code})` : null,
      }));
    };

    ws.onerror = () => {
      setState((s) => ({
        ...s,
        connectionState: "error",
        lastError: "Could not connect to local proxy. Is the server running?",
      }));
    };

    function handleAddressedMessage(address: string, body: unknown) {
      if (!address) return;

      // Session list reply
      if (address.startsWith("reply.sessions.")) {
        const sessions = parseSessions(body);
        setState((s) => ({ ...s, sessions }));
        // Auto-register for the first active session if we don't have one already
        if (!eventInfo?.eventDeviceId && sessions.length > 0) {
          const active = sessions.find((s) => s.active) ?? sessions[0];
          registerForDevice(active.eventDeviceId);
        }
        return;
      }

      // Sensor data
      if (address.startsWith("sensorData.")) {
        const packet = parseSensorData(body);
        if (!packet) return;

        const decoded = decodeSensorValues(packet.values);
        const point: TimeSeriesPoint = { t: packet.timestamp, ...decoded };

        setState((s) => {
          const newHistory = [...s.history, point].slice(-MAX_HISTORY);
          const newPackets = [packet, ...s.recentPackets].slice(0, MAX_PACKETS);
          return {
            ...s,
            connectionState: "receiving",
            latestValues: { ...s.latestValues, ...decoded },
            history: newHistory,
            recentPackets: newPackets,
            packetCount: s.packetCount + 1,
            lastPacketAt: Date.now(),
          };
        });
        return;
      }

      // Alert messages
      if (address.startsWith("alertmessage.")) {
        console.log("[Alert]", body);
      }
    }
  }, [eventInfo, listSessions, registerForDevice, send]);

  const disconnect = useCallback(() => {
    wsRef.current?.close(1000, "User disconnect");
    wsRef.current = null;
    registeredRef.current = null;
    setState((s) => ({ ...s, connectionState: "idle" }));
  }, []);

  const manualRegister = useCallback(
    (eventDeviceId: string) => {
      registerForDevice(eventDeviceId);
    },
    [registerForDevice]
  );

  // Disconnect when event changes
  useEffect(() => {
    return () => {
      wsRef.current?.close(1000);
    };
  }, []);

  return { ...state, connect, disconnect, manualRegister, listSessions };
}

// Real format: {"status":"ok","values":[77398, 77399, ...]}
function parseSessions(body: unknown): TelemetrySession[] {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (b.status === "ok" && Array.isArray(b.values)) {
      return (b.values as number[]).map((id) => ({
        eventDeviceId: String(id),
        active: true,
      }));
    }
    if (Array.isArray(b.sessions)) return b.sessions as TelemetrySession[];
  }
  if (Array.isArray(body)) {
    return (body as unknown[]).map((id) => ({
      eventDeviceId: String(id),
      active: true,
    }));
  }
  return [];
}

// Real format: {eventDeviceId, timestamp:{"$date":"ISO"}, values:[{name,value},...], tick}
function parseSensorData(body: unknown): SensorPacket | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;

  // Parse timestamp — real format is {"$date": "ISO string"}
  let timestamp = Date.now();
  if (b.timestamp && typeof b.timestamp === "object") {
    const ts = b.timestamp as Record<string, unknown>;
    if (typeof ts["$date"] === "string") {
      timestamp = new Date(ts["$date"]).getTime();
    }
  } else if (typeof b.timestamp === "number") {
    timestamp = b.timestamp;
  }

  if (!Array.isArray(b.values)) return null;

  const values: ChannelValue[] = [];
  for (const v of b.values) {
    if (!v || typeof v !== "object") continue;
    const ch = v as Record<string, unknown>;
    if (typeof ch.name !== "string") continue;
    if (typeof ch.latitude === "number" && typeof ch.longitude === "number") {
      values.push({ name: ch.name, latitude: ch.latitude, longitude: ch.longitude });
    } else if (typeof ch.value === "number") {
      values.push({ name: ch.name, value: ch.value });
    }
  }

  return { timestamp, values, raw: body };
}
