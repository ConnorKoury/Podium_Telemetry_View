"use client";

import { useEffect, useRef, useMemo } from "react";
import type { TimeSeriesPoint } from "@/lib/types";

interface GpsTraceProps {
  history: TimeSeriesPoint[];
}

interface GpsPt {
  lat: number;
  lng: number;
  speed: number;
}

// HSL: green (120°) → yellow (60°) → red (0°)
function speedColor(speed: number, maxSpeed: number): string {
  const t = Math.max(0, Math.min(1, speed / (maxSpeed || 1)));
  const hue = Math.round((1 - t) * 120);
  return `hsl(${hue},90%,50%)`;
}

function speedColorHex(speed: number, maxSpeed: number): string {
  const t = Math.max(0, Math.min(1, speed / (maxSpeed || 1)));
  const hue = (1 - t) * 120;
  // Convert HSL to hex for Google Maps (which doesn't accept hsl())
  const h = hue / 360, s = 0.9, l = 0.5;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const toRgb = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  const r = Math.round(toRgb(h + 1/3) * 255);
  const g = Math.round(toRgb(h) * 255);
  const b = Math.round(toRgb(h - 1/3) * 255);
  return `#${r.toString(16).padStart(2,"0")}${g.toString(16).padStart(2,"0")}${b.toString(16).padStart(2,"0")}`;
}

// Detect which GPS key convention the data uses
function gpsKeys(history: TimeSeriesPoint[]): { latKey: string; lngKey: string } | null {
  const candidates: [string, string][] = [
    ["GPS_Latitude", "GPS_Longitude"],
    ["GPS_Latitud",  "GPS_Longitu"],
  ];
  const sample = history.find((p) =>
    candidates.some(([la, lo]) => p[la] != null && p[lo] != null)
  );
  if (!sample) return null;
  for (const [la, lo] of candidates) {
    if (sample[la] != null && sample[lo] != null) return { latKey: la, lngKey: lo };
  }
  return null;
}

function normalizeCoordinate(value: unknown, limit: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (Math.abs(value) <= limit) return value;

  // Some telemetry exports encode coordinates as integer degrees * 1e7.
  const scaled = value / 10_000_000;
  if (Math.abs(scaled) <= limit) return scaled;
  return null;
}

// ── Google Maps script loader (singleton) ────────────────────────────────────

let _mapsPromise: Promise<void> | null = null;

function loadGoogleMapsScript(apiKey: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.maps) return Promise.resolve();
  if (_mapsPromise) return _mapsPromise;
  _mapsPromise = new Promise<void>((resolve, reject) => {
    const cb = "__gm_" + Date.now();
    (window as unknown as Record<string, unknown>)[cb] = () => {
      delete (window as unknown as Record<string, unknown>)[cb];
      resolve();
    };
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&callback=${cb}`;
    s.async = true;
    s.onerror = () => { _mapsPromise = null; reject(new Error("Google Maps failed to load")); };
    document.head.appendChild(s);
  });
  return _mapsPromise;
}

// ── Speed legend ──────────────────────────────────────────────────────────────

// Vertical speed legend — rendered as an overlay inside the map container
function SpeedLegend({ maxSpeed }: { maxSpeed: number }) {
  const stops = 6;
  // Reversed so high speed is at top
  const ticks = Array.from({ length: stops }, (_, i) => {
    const t = 1 - i / (stops - 1);
    return { t, speed: Math.round(t * maxSpeed), color: speedColor(t * maxSpeed, maxSpeed) };
  });

  const gradientCss = `linear-gradient(to bottom, ${ticks.map((s) => s.color).join(", ")})`;

  return (
    <div
      className="absolute top-3 right-3 flex items-stretch gap-1.5 z-10"
      style={{ pointerEvents: "none" }}
    >
      {/* Gradient bar */}
      <div className="w-2 rounded-full" style={{ background: gradientCss, minHeight: 100 }} />
      {/* Labels */}
      <div className="flex flex-col justify-between">
        {ticks.map(({ speed, color }, i) => (
          <span
            key={i}
            className="text-[10px] font-mono tabular-nums leading-none"
            style={{ color, textShadow: "0 1px 3px #000, 0 0 6px #000" }}
          >
            {speed}
          </span>
        ))}
        <span className="text-[9px] text-white/50 leading-none" style={{ textShadow: "0 1px 3px #000" }}>
          km/h
        </span>
      </div>
    </div>
  );
}

// ── SVG fallback (no API key) ─────────────────────────────────────────────────

function SvgTrace({ pts, maxSpeed }: { pts: GpsPt[]; maxSpeed: number }) {

  const lats = pts.map((p) => p.lat);
  const lngs = pts.map((p) => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const latRange = maxLat - minLat || 1e-5;
  const lngRange = maxLng - minLng || 1e-5;

  const midLat = (minLat + maxLat) / 2;
  const lngScale = Math.cos((midLat * Math.PI) / 180);

  const W = 500, H = 340, M = 20;
  const iW = W - 2 * M, iH = H - 2 * M;
  const dataW = lngRange * lngScale;
  const dataH = latRange;
  const scale = Math.min(iW / dataW, iH / dataH);
  const offX = (iW - dataW * scale) / 2;
  const offY = (iH - dataH * scale) / 2;

  const tx = (lng: number) => M + (lng - minLng) * lngScale * scale + offX;
  const ty = (lat: number) => H - M - (lat - minLat) * scale - offY;

  const first = pts[0], last = pts[pts.length - 1];

  return (
    <div className="relative w-full" style={{ aspectRatio: `${W} / ${H}`, borderRadius: 6, overflow: "hidden" }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
        style={{ background: "#0d0d0d", display: "block" }}
      >
        {pts.slice(0, -1).map((p, i) => {
          const n = pts[i + 1];
          return (
            <line
              key={i}
              x1={tx(p.lng)} y1={ty(p.lat)}
              x2={tx(n.lng)} y2={ty(n.lat)}
              stroke={speedColor(p.speed, maxSpeed)}
              strokeWidth={2}
              strokeLinecap="round"
            />
          );
        })}
        <circle cx={tx(first.lng)} cy={ty(first.lat)} r={5} fill="#22c55e" stroke="#fff" strokeWidth={1.5} />
        <circle cx={tx(last.lng)} cy={ty(last.lat)} r={5} fill="#e53935" stroke="#fff" strokeWidth={1.5} />
      </svg>
      <SpeedLegend maxSpeed={maxSpeed} />
    </div>
  );
}

// ── Google Maps view ──────────────────────────────────────────────────────────

function MapsTrace({ pts, maxSpeed, apiKey }: { pts: GpsPt[]; maxSpeed: number; apiKey: string }) {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const redrawTimerRef = useRef<number | null>(null);
  const latestRef = useRef({ pts, maxSpeed });
  const fittedBoundsRef = useRef<{ minLat: number; maxLat: number; minLng: number; maxLng: number } | null>(null);
  const hasEnoughPoints = pts.length >= 2;

  latestRef.current = { pts, maxSpeed };

  useEffect(() => {
    if (!mapDivRef.current || !hasEnoughPoints) return;
    let cancelled = false;

    async function init() {
      await loadGoogleMapsScript(apiKey);
      if (cancelled || !mapDivRef.current) return;
      const g = window.google.maps;

      if (!mapRef.current) {
        mapRef.current = new g.Map(mapDivRef.current, {
          mapTypeId: "satellite" as google.maps.MapTypeId,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "cooperative",
          backgroundColor: "#0d0d0d",
        });
      }
      scheduleRedraw(0);
    }

    init().catch(console.error);
    return () => { cancelled = true; };
  }, [apiKey, hasEnoughPoints]);

  useEffect(() => {
    if (!mapDivRef.current) return;
    const observer = new ResizeObserver(() => {
      const map = mapRef.current;
      if (!map || !window.google?.maps) return;
      window.google.maps.event.trigger(map, "resize");
      fittedBoundsRef.current = null;
      scheduleRedraw(0);
    });
    observer.observe(mapDivRef.current);
    return () => observer.disconnect();
  }, []);

  function scheduleRedraw(delay = 180) {
    if (redrawTimerRef.current != null) window.clearTimeout(redrawTimerRef.current);
    redrawTimerRef.current = window.setTimeout(() => {
      redrawTimerRef.current = null;
      redrawMap();
    }, delay);
  }

  function shouldFit(next: { minLat: number; maxLat: number; minLng: number; maxLng: number }) {
    const prev = fittedBoundsRef.current;
    if (!prev) return true;
    const latPad = Math.max((prev.maxLat - prev.minLat) * 0.05, 0.00005);
    const lngPad = Math.max((prev.maxLng - prev.minLng) * 0.05, 0.00005);
    return (
      next.minLat < prev.minLat - latPad ||
      next.maxLat > prev.maxLat + latPad ||
      next.minLng < prev.minLng - lngPad ||
      next.maxLng > prev.maxLng + lngPad
    );
  }

  function redrawMap() {
    const map = mapRef.current;
    if (!map || !window.google?.maps) return;
    const g = window.google.maps;
    const { pts: latestPts, maxSpeed: latestMaxSpeed } = latestRef.current;
    if (latestPts.length < 2) return;

    polylinesRef.current.forEach((line) => line.setMap(null));
    markersRef.current.forEach((marker) => marker.setMap(null));
    polylinesRef.current = latestPts.slice(0, -1).map((p, i) => {
      const n = latestPts[i + 1];
      return new g.Polyline({
        path: [{ lat: p.lat, lng: p.lng }, { lat: n.lat, lng: n.lng }],
        strokeColor: speedColorHex(p.speed, latestMaxSpeed),
        strokeWeight: 3,
        strokeOpacity: 0.95,
        map,
      });
    });

    markersRef.current = [
      new g.Marker({
        position: { lat: latestPts[0].lat, lng: latestPts[0].lng },
        map,
        title: "Start",
        icon: {
          path: g.SymbolPath.CIRCLE,
          scale: 7,
          fillColor: "#22c55e",
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 2,
        },
      }),
      new g.Marker({
        position: { lat: latestPts[latestPts.length - 1].lat, lng: latestPts[latestPts.length - 1].lng },
        map,
        title: "End",
        icon: {
          path: g.SymbolPath.CIRCLE,
          scale: 7,
          fillColor: "#e53935",
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 2,
        },
      }),
    ];

    const extents = latestPts.reduce(
      (acc, p) => ({
        minLat: Math.min(acc.minLat, p.lat),
        maxLat: Math.max(acc.maxLat, p.lat),
        minLng: Math.min(acc.minLng, p.lng),
        maxLng: Math.max(acc.maxLng, p.lng),
      }),
      { minLat: Infinity, maxLat: -Infinity, minLng: Infinity, maxLng: -Infinity }
    );
    if (shouldFit(extents)) {
      const bounds = new g.LatLngBounds();
      latestPts.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
      map.fitBounds(bounds, 48);
      fittedBoundsRef.current = extents;
    }
  }

  useEffect(() => {
    scheduleRedraw();
    return () => {
      if (redrawTimerRef.current != null) window.clearTimeout(redrawTimerRef.current);
    };
  }, [pts, maxSpeed]);

  useEffect(() => () => {
    polylinesRef.current.forEach((line) => line.setMap(null));
    markersRef.current.forEach((marker) => marker.setMap(null));
  }, []);

  return (
    <div className="relative w-full min-h-[280px]" style={{ aspectRatio: "16 / 9", maxHeight: 520, borderRadius: 6, overflow: "hidden" }}>
      <div ref={mapDivRef} style={{ width: "100%", height: "100%" }} />
      <SpeedLegend maxSpeed={maxSpeed} />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function GpsTrace({ history }: GpsTraceProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";

  const keys = useMemo(() => gpsKeys(history), [history]);
  const pts = useMemo<GpsPt[]>(() => {
    if (!keys) return [];
    return history
      .filter((p) => p[keys.latKey] != null && p[keys.lngKey] != null)
      .map((p) => {
        const lat = normalizeCoordinate(p[keys.latKey], 90);
        const lng = normalizeCoordinate(p[keys.lngKey], 180);
        if (lat == null || lng == null) return null;
        return {
          lat,
          lng,
          speed: (p.GPS_Speed as number) ?? (p.Vehicle_Spe as number) ?? 0,
        };
      })
      .filter((p): p is GpsPt => p !== null);
  }, [history, keys]);

  const maxSpeed = useMemo(() => Math.max(...pts.map((p) => p.speed), 1), [pts]);

  if (pts.length < 2) {
    return (
      <div className="flex items-center justify-center h-48 text-xs text-nova-dim">
        {pts.length === 0 ? "No GPS data received yet." : "Collecting GPS data…"}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 text-[10px] text-nova-dim">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-green-500" /> start
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-red-500" /> end
        </span>
        <span className="ml-auto text-nova-muted">{pts.length} pts</span>
      </div>

      {apiKey ? (
        <MapsTrace pts={pts} maxSpeed={maxSpeed} apiKey={apiKey} />
      ) : (
        <>
          <SvgTrace pts={pts} maxSpeed={maxSpeed} />
          <p className="text-[10px] text-nova-muted text-center">
            Add <code className="text-nova-dim">NEXT_PUBLIC_GOOGLE_MAPS_KEY</code> to .env.local for satellite map
          </p>
        </>
      )}
    </div>
  );
}
