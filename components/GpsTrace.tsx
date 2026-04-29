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
    <div className="relative" style={{ borderRadius: 6, overflow: "hidden" }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ background: "#0d0d0d", display: "block" }}>
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


  useEffect(() => {
    if (!mapDivRef.current || pts.length < 2) return;
    let cancelled = false;

    async function init() {
      await loadGoogleMapsScript(apiKey);
      if (cancelled || !mapDivRef.current) return;
      const g = window.google.maps;

      const map = new g.Map(mapDivRef.current, {
        mapTypeId: "satellite" as google.maps.MapTypeId,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: "cooperative",
        backgroundColor: "#0d0d0d",
      });

      // Draw per-segment polylines colored by speed
      pts.slice(0, -1).forEach((p, i) => {
        const n = pts[i + 1];
        new g.Polyline({
          path: [{ lat: p.lat, lng: p.lng }, { lat: n.lat, lng: n.lng }],
          strokeColor: speedColorHex(p.speed, maxSpeed),
          strokeWeight: 3,
          strokeOpacity: 0.95,
          map,
        });
      });

      // Start marker (green)
      new g.Marker({
        position: { lat: pts[0].lat, lng: pts[0].lng },
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
      });

      // End marker (red)
      new g.Marker({
        position: { lat: pts[pts.length - 1].lat, lng: pts[pts.length - 1].lng },
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
      });

      // Fit map to track extent
      const bounds = new g.LatLngBounds();
      pts.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
      map.fitBounds(bounds, 48);
    }

    init().catch(console.error);
    return () => { cancelled = true; };
  }, [pts, maxSpeed, apiKey]);

  return (
    <div className="relative" style={{ height: 360, borderRadius: 6, overflow: "hidden" }}>
      <div ref={mapDivRef} style={{ width: "100%", height: "100%" }} />
      <SpeedLegend maxSpeed={maxSpeed} />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function GpsTrace({ history }: GpsTraceProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";

  const keys = gpsKeys(history);
  const pts = useMemo<GpsPt[]>(() => {
    if (!keys) return [];
    return history
      .filter((p) => p[keys.latKey] != null && p[keys.lngKey] != null)
      .map((p) => ({
        lat: p[keys.latKey] as number,
        lng: p[keys.lngKey] as number,
        speed: (p.GPS_Speed as number) ?? 0,
      }));
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
