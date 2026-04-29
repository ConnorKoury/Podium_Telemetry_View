export interface Sensor {
  index: number;
  name: string;
  short_name?: string;
  units?: string;
  precision?: number;
  min?: number;
  max?: number;
  group?: string;
}

export interface LapRecord {
  id: number;
  lap_number?: number;
  lap_time?: number;   // seconds
  end_time?: number;   // epoch ms
}

export interface ParsedEventInfo {
  eventId: string;
  deviceId: string;
  eventDeviceId: string | null;
  eventNumericId: number | null;   // internal event ID for lap data API
  deviceNumericId: number | null;  // internal device ID for lap data API
  displayName: string;
  deviceName: string;
  eventTitle: string;
  sensorList: Sensor[];
  lapData: LapRecord[];
  rawConfig: Record<string, unknown> | null;
}

export interface SensorValues {
  [sensorName: string]: number | null;
}

// A single channel value in a sensorData packet.
// Most channels are {name, value}; GPS position is {name, latitude, longitude}.
export type ChannelValue =
  | { name: string; value: number }
  | { name: string; latitude: number; longitude: number };

export interface SensorPacket {
  timestamp: number;   // epoch ms, parsed from body.timestamp.$date
  values: ChannelValue[];
  raw?: unknown;
}

export type ConnectionState =
  | "idle"
  | "proxy_connecting"
  | "proxy_connected"
  | "registered"
  | "receiving"
  | "error"
  | "disconnected";

export interface TelemetrySession {
  eventDeviceId: string;
  eventId?: string;
  deviceId?: string;
  name?: string;
  active?: boolean;
}

// Vert.x EventBus message types
export interface VertxMessage {
  type: "ping" | "pong" | "register" | "unregister" | "send" | "publish" | "message" | "err";
  address?: string;
  replyAddress?: string;
  headers?: Record<string, string>;
  body?: unknown;
  failureCode?: number;
  failureType?: string;
  message?: string;
}

export interface ProxyMeta {
  type: "proxy_connected" | "proxy_disconnected" | "proxy_error";
  url?: string;
  code?: number;
  reason?: string;
  message?: string;
}

export type IncomingMessage = VertxMessage | ProxyMeta;

export interface TimeSeriesPoint {
  t: number;
  [channel: string]: number | null;
}

export interface LapData {
  lapNumber: number;
  points: TimeSeriesPoint[];
  channels: string[];
  totalPackets: number;
}

export const KEY_GAUGES = [
  "GPS_Speed",
  "Battery",
  "Lambda",
  "Gear",
  "LapTime",
  "BestLap",
] as const;

export const GAUGE_CONFIG: Record<
  string,
  { min: number; max: number; unit: string; decimals: number; color: string }
> = {
  // NovaRacing channel names
  GPS_Speed:      { min: 0,    max: 200,  unit: "km/h",  decimals: 1, color: "#e53935" },
  Battery:        { min: 0,    max: 20,   unit: "V",     decimals: 2, color: "#43a047" },
  Lambda:         { min: 0.5,  max: 1.5,  unit: "λ",     decimals: 3, color: "#fb8c00" },
  Gear:           { min: 0,    max: 7,    unit: "",      decimals: 0, color: "#1e88e5" },
  LapTime:        { min: 0,    max: 300,  unit: "s",     decimals: 3, color: "#8e24aa" },
  BestLap:        { min: 0,    max: 300,  unit: "s",     decimals: 3, color: "#00acc1" },
  Odometer:       { min: 0,    max: 9999, unit: "m",     decimals: 0, color: "#6d4c41" },
  LapCount:       { min: 0,    max: 99,   unit: "lap",   decimals: 0, color: "#546e7a" },
  // Common alternate names from other Podium devices
  Speed:          { min: 0,    max: 200,  unit: "km/h",  decimals: 1, color: "#e53935" },
  RPM:            { min: 0,    max: 16000, unit: "rpm",  decimals: 0, color: "#f44336" },
  AFR:            { min: 8,    max: 20,   unit: "AFR",   decimals: 2, color: "#fb8c00" },
  Brake:          { min: 0,    max: 100,  unit: "%",     decimals: 0, color: "#ef5350" },
  TPS:            { min: 0,    max: 100,  unit: "%",     decimals: 0, color: "#66bb6a" },
  Engine_Spee:    { min: 0,    max: 16300, unit: "rpm",  decimals: 0, color: "#f44336" },
  Vehicle_Spe:    { min: 0,    max: 300,  unit: "km/h",  decimals: 1, color: "#e53935" },
};

export const TIRE_CHANNEL_PREFIXES = ["FLTT", "FR", "RL", "RR"];
