"use client";

import { useCallback, useEffect, useState } from "react";
import type { ParsedEventInfo, TelemetrySession } from "@/lib/types";

interface LiveEventsListProps {
    sessions: TelemetrySession[];
    loading: boolean;
    error: string | null;
    podiumUrl: string | null;
    onRefresh: () => void;
    onLoad: (info: ParsedEventInfo) => void;
    onDirectConnect: (eventDeviceId: string) => void;
}

type FilterMode = "all" | "nova";

function isNovaRacing(
    session: TelemetrySession,
    novaInfo: ParsedEventInfo | null,
): boolean {
    if (!novaInfo) return false;
    return (
        session.eventDeviceId === novaInfo.eventDeviceId ||
        session.deviceId === novaInfo.deviceId
    );
}

function buildPodiumUrl(
    session: TelemetrySession,
    novaInfo: ParsedEventInfo | null,
): string | null {
    if (session.eventId && session.deviceId) {
        return `https://podium.live/events/${session.eventId}/device/${session.deviceId}`;
    }
    if (isNovaRacing(session, novaInfo)) return null;
    return null;
}

function sessionDisplayName(session: TelemetrySession): string {
    return session.name ?? session.deviceId ?? session.eventDeviceId;
}

function sessionSubLabel(session: TelemetrySession): string | null {
    if (session.name && (session.deviceId || session.eventId)) {
        return session.deviceId ?? session.eventId ?? null;
    }
    return session.eventDeviceId !== session.deviceId
        ? session.eventDeviceId
        : null;
}

interface SessionCardProps {
    session: TelemetrySession;
    novaInfo: ParsedEventInfo | null;
    onLoad: (info: ParsedEventInfo) => void;
    onDirectConnect: (id: string) => void;
}

function SessionCard({
    session,
    novaInfo,
    onLoad,
    onDirectConnect,
}: SessionCardProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const url = buildPodiumUrl(session, novaInfo);
    const isNova = isNovaRacing(session, novaInfo);

    const handleLoad = async () => {
        setLoading(true);
        setError(null);
        try {
            if (isNova && novaInfo) {
                onLoad(novaInfo);
            } else if (url) {
                const res = await fetch("/api/parse-event", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ url }),
                });
                const data = (await res.json()) as ParsedEventInfo & {
                    error?: string;
                };
                if (!res.ok || data.error) {
                    setError(data.error ?? "Parse failed");
                    return;
                }
                onLoad(data);
            } else {
                onDirectConnect(session.eventDeviceId);
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div
            className={`rounded-lg border p-3 flex flex-col gap-2 transition-colors ${
                isNova
                    ? "border-nova-red/40 bg-nova-red/5"
                    : "border-nova-border bg-nova-panel"
            }`}
        >
            <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-2">
                        {isNova && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-nova-red/20 text-nova-red font-semibold uppercase tracking-wider shrink-0">
                                NR
                            </span>
                        )}
                        <span className="text-sm font-semibold text-nova-text truncate">
                            {sessionDisplayName(session)}
                        </span>
                    </div>
                    {sessionSubLabel(session) && (
                        <span className="text-xs text-nova-dim font-mono truncate">
                            {sessionSubLabel(session)}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {session.active !== undefined && (
                        <span
                            className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider ${
                                session.active
                                    ? "bg-green-900/50 text-green-400"
                                    : "bg-nova-muted/20 text-nova-dim"
                            }`}
                        >
                            {session.active && (
                                <span className="blink inline-block w-1.5 h-1.5 rounded-full bg-green-400" />
                            )}
                            {session.active ? "live" : "idle"}
                        </span>
                    )}
                </div>
            </div>

            {url && (
                <p className="text-[10px] text-nova-muted font-mono truncate">
                    {url}
                </p>
            )}

            {error && (
                <p className="text-[11px] text-red-400 bg-red-950/30 border border-red-900/40 rounded px-2 py-1">
                    {error}
                </p>
            )}

            <button
                onClick={handleLoad}
                disabled={loading}
                className={`w-full py-1.5 text-xs rounded font-semibold transition-colors ${
                    isNova
                        ? "bg-nova-red/20 hover:bg-nova-red/30 text-nova-red border border-nova-red/40"
                        : "bg-white/5 hover:bg-white/10 text-nova-text border border-nova-border"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
                {loading ? "Loading…" : url ? "Load Event" : "Connect"}
            </button>
        </div>
    );
}

export default function LiveEventsList({
    sessions,
    loading,
    error,
    podiumUrl,
    onRefresh,
    onLoad,
    onDirectConnect,
}: LiveEventsListProps) {
    const [filter, setFilter] = useState<FilterMode>("all");
    const [novaInfo, setNovaInfo] = useState<ParsedEventInfo | null>(null);
    const [novaLookupError, setNovaLookupError] = useState<string | null>(null);

    const refreshNovaInfo = useCallback(async () => {
        try {
            const res = await fetch("/api/discover-nova");
            const data = (await res.json()) as ParsedEventInfo & {
                error?: string;
            };
            if (!res.ok || data.error)
                throw new Error(data.error ?? "Discovery failed");
            setNovaInfo(data);
            setNovaLookupError(null);
        } catch (e) {
            setNovaLookupError(
                e instanceof Error ? e.message : "Could not resolve NovaRacing",
            );
        }
    }, []);

    useEffect(() => {
        void refreshNovaInfo();
    }, [refreshNovaInfo]);

    const handleRefresh = () => {
        void refreshNovaInfo();
        onRefresh();
    };

    const novaCount = sessions.filter((s) => isNovaRacing(s, novaInfo)).length;
    const displayed =
        filter === "nova"
            ? sessions.filter((s) => isNovaRacing(s, novaInfo))
            : sessions;

    return (
        <div className="flex flex-col gap-4">
            {/* Toolbar */}
            <div className="flex items-center justify-between gap-3">
                <div className="flex rounded-lg overflow-hidden border border-nova-border text-xs">
                    <button
                        onClick={() => setFilter("all")}
                        className={`px-3 py-1.5 transition-colors ${
                            filter === "all"
                                ? "bg-nova-text text-nova-dark font-semibold"
                                : "bg-nova-panel text-nova-dim hover:text-nova-text"
                        }`}
                    >
                        All{sessions.length > 0 && ` (${sessions.length})`}
                    </button>
                    <button
                        onClick={() => setFilter("nova")}
                        className={`px-3 py-1.5 transition-colors flex items-center gap-1.5 ${
                            filter === "nova"
                                ? "bg-nova-red text-white font-semibold"
                                : "bg-nova-panel text-nova-dim hover:text-nova-text"
                        }`}
                    >
                        <span
                            className={`inline-block w-2 h-2 rounded-sm ${filter === "nova" ? "bg-white/70" : "bg-nova-red/60"}`}
                        />
                        NovaRacing{novaCount > 0 && ` (${novaCount})`}
                    </button>
                </div>

                <button
                    onClick={handleRefresh}
                    disabled={loading}
                    title="Refresh"
                    className="p-1.5 rounded border border-nova-border text-nova-dim hover:text-nova-text hover:border-nova-muted transition-colors disabled:opacity-40"
                >
                    <svg
                        className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                        />
                    </svg>
                </button>
            </div>

            {podiumUrl && !loading && (
                <p className="text-[11px] text-nova-muted -mt-2 font-mono">
                    {podiumUrl.replace("wss://", "")}
                    {novaInfo?.eventDeviceId &&
                        ` · NovaRacing EDI ${novaInfo.eventDeviceId}`}
                </p>
            )}

            {novaLookupError && (
                <p className="text-[11px] text-yellow-500 -mt-2">
                    NovaRacing lookup failed: {novaLookupError}
                </p>
            )}

            {loading && (
                <div className="flex items-center gap-2 text-sm text-nova-dim py-8 justify-center">
                    <span className="animate-spin inline-block w-4 h-4 border-2 border-nova-border border-t-nova-red rounded-full" />
                    Connecting to Podium…
                </div>
            )}

            {!loading && error && (
                <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-4 flex flex-col gap-2">
                    <p className="text-sm text-red-400 font-semibold">
                        Could not reach Podium
                    </p>
                    <p className="text-xs text-red-300/70">{error}</p>
                    <button
                        onClick={onRefresh}
                        className="self-start text-xs px-2 py-1 rounded border border-red-800 text-red-400 hover:bg-red-900/20 transition-colors mt-1"
                    >
                        Retry
                    </button>
                </div>
            )}

            {!loading && !error && sessions.length === 0 && (
                <div className="text-center py-10 flex flex-col gap-2 text-nova-dim">
                    <p className="text-sm">No active sessions found.</p>
                    <p className="text-xs">
                        Sessions appear here when a car is transmitting live
                        telemetry.
                    </p>
                </div>
            )}

            {!loading &&
                filter === "nova" &&
                novaCount === 0 &&
                sessions.length > 0 && (
                    <div className="text-center py-6 text-nova-dim text-sm">
                        No NovaRacing sessions in the current list.
                        <button
                            onClick={() => setFilter("all")}
                            className="ml-1 text-nova-red underline underline-offset-2"
                        >
                            Show all ({sessions.length})
                        </button>
                    </div>
                )}

            {!loading && displayed.length > 0 && (
                <div className="flex flex-col gap-3">
                    {displayed.map((s) => (
                        <SessionCard
                            key={s.eventDeviceId}
                            session={s}
                            novaInfo={novaInfo}
                            onLoad={onLoad}
                            onDirectConnect={onDirectConnect}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
