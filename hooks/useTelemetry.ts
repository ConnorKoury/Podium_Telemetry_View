"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ConnectionState,
  ParsedEventInfo,
  SensorPacket,
  TelemetrySession,
  TimeSeriesPoint,
} from "@/lib/types";
import { decodeSensorValues } from "@/lib/podium-parser";
import type { ChannelValue } from "@/lib/types";

const PODIUM_WS_URLS = [
  "wss://telemetry.podium.live/eventbus/websocket",
  "wss://telemetry.podium.live/eventbus",
  "wss://telemetry.podium.live",
];

const MAX_HISTORY = 3600;
const MAX_PACKETS = 20;
const PING_INTERVAL = 5_000;

interface TelemetryState {
  connectionState: ConnectionState;
  podiumUrl: string | null;
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
  podiumUrl: null,
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
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const registeredRef = useRef<string | null>(null);
  const pendingDeviceRef = useRef<string | null>(null);
  const eventInfoRef = useRef(eventInfo);
  useEffect(() => { eventInfoRef.current = eventInfo; }, [eventInfo]);

  const send = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const registerForDevice = useCallback(
    (eventDeviceId: string) => {
      if (registeredRef.current === eventDeviceId) return;
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        pendingDeviceRef.current = eventDeviceId;
        return;
      }
      registeredRef.current = eventDeviceId;
      for (const address of [
        `sensorData.${eventDeviceId}`,
        `event.${eventDeviceId}`,
        `alertmessage.${eventDeviceId}`,
      ]) {
        send({ type: "register", address, headers: {} });
      }
      setState((s) => ({ ...s, connectionState: "registered" }));
    },
    [send]
  );

  const listSessions = useCallback(() => {
    send({
      type: "send",
      address: "listTelemetryStreamSessions",
      headers: {},
      body: {},
      replyAddress: `reply.sessions.${Date.now()}`,
    });
  }, [send]);

  const connect = useCallback(() => {
    wsRef.current?.close(1000);
    if (pingTimerRef.current) clearInterval(pingTimerRef.current);
    setState((s) => ({ ...s, connectionState: "connecting", lastError: null }));
    registeredRef.current = null;

    let urlIdx = 0;

    function tryNext() {
      if (urlIdx >= PODIUM_WS_URLS.length) {
        setState((s) => ({
          ...s,
          connectionState: "error",
          lastError: "All Podium endpoints unreachable",
        }));
        return;
      }

      const url = PODIUM_WS_URLS[urlIdx++];
      const ws = new WebSocket(url);
      wsRef.current = ws;
      let connected = false;
      let movedOn = false;

      ws.onopen = () => {
        connected = true;
        setState((s) => ({ ...s, connectionState: "connected", podiumUrl: url }));

        send({ type: "ping" });
        pingTimerRef.current = setInterval(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            send({ type: "ping" });
          }
        }, PING_INTERVAL);

        listSessions();

        const device = eventInfoRef.current?.eventDeviceId ?? pendingDeviceRef.current;
        if (device) {
          pendingDeviceRef.current = null;
          setTimeout(() => registerForDevice(device), 300);
        }
      };

      ws.onmessage = (event) => {
        let msg: Record<string, unknown>;
        try { msg = JSON.parse(event.data as string) as Record<string, unknown>; }
        catch { return; }

        const msgType = msg.type as string | undefined;
        if (msgType === "pong") return;
        if (msgType === "err") {
          setState((s) => ({
            ...s,
            lastError: (msg.message as string) ?? `EventBus error: ${msg.failureType}`,
          }));
          return;
        }

        if (typeof msg.address === "string") {
          handleMessage(msg.address, msg.body);
        }
      };

      ws.onerror = () => {
        if (!connected && !movedOn) {
          movedOn = true;
          tryNext();
        }
      };

      ws.onclose = (ev) => {
        if (pingTimerRef.current) clearInterval(pingTimerRef.current);
        if (wsRef.current !== ws) return;
        if (!connected && !movedOn) {
          movedOn = true;
          tryNext();
          return;
        }
        if (connected) {
          setState((s) => ({
            ...s,
            connectionState: ev.code === 1000 ? "disconnected" : "error",
            lastError: ev.code !== 1000 ? `Disconnected (code ${ev.code})` : null,
          }));
        }
      };
    }

    function handleMessage(address: string, body: unknown) {
      if (address.startsWith("reply.sessions.")) {
        setState((s) => ({ ...s, sessions: parseSessions(body) }));
        return;
      }

      if (address.startsWith("sensorData.")) {
        const packet = parseSensorData(body);
        if (!packet) return;
        const decoded = decodeSensorValues(packet.values);
        const point: TimeSeriesPoint = { t: packet.timestamp, ...decoded };
        setState((s) => ({
          ...s,
          connectionState: "receiving",
          latestValues: { ...s.latestValues, ...decoded },
          history: [...s.history, point].slice(-MAX_HISTORY),
          recentPackets: [packet, ...s.recentPackets].slice(0, MAX_PACKETS),
          packetCount: s.packetCount + 1,
          lastPacketAt: Date.now(),
        }));
        return;
      }

      if (address.startsWith("alertmessage.")) {
        console.log("[Alert]", body);
      }
    }

    tryNext();
  }, [send, listSessions, registerForDevice]);

  const disconnect = useCallback(() => {
    if (pingTimerRef.current) clearInterval(pingTimerRef.current);
    wsRef.current?.close(1000, "User disconnect");
    wsRef.current = null;
    registeredRef.current = null;
    setState((s) => ({ ...s, connectionState: "idle" }));
  }, []);

  const manualRegister = useCallback(
    (eventDeviceId: string) => registerForDevice(eventDeviceId),
    [registerForDevice]
  );

  // Auto-connect on mount
  useEffect(() => {
    connect();
    return () => {
      if (pingTimerRef.current) clearInterval(pingTimerRef.current);
      wsRef.current?.close(1000);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ...state, connect, disconnect, manualRegister, listSessions };
}

function parseSessions(body: unknown): TelemetrySession[] {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (b.status === "ok" && Array.isArray(b.values)) {
      return (b.values as number[]).map((id) => ({ eventDeviceId: String(id), active: true }));
    }
    if (Array.isArray(b.sessions)) return b.sessions as TelemetrySession[];
  }
  if (Array.isArray(body)) {
    return (body as unknown[]).map((id) => ({ eventDeviceId: String(id), active: true }));
  }
  return [];
}

function parseSensorData(body: unknown): SensorPacket | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;

  let timestamp = Date.now();
  if (b.timestamp && typeof b.timestamp === "object") {
    const ts = b.timestamp as Record<string, unknown>;
    if (typeof ts["$date"] === "string") timestamp = new Date(ts["$date"]).getTime();
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
