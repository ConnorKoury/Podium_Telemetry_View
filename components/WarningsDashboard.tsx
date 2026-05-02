"use client";

import type { ActiveWarning, WarningDefinition, WarningLogEntry } from "@/hooks/useWarningConfig";

function formatTime(t: number) {
  return new Date(t).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function ActiveWarningsBanner({
  warnings,
  onOpen,
}: {
  warnings: ActiveWarning[];
  onOpen: () => void;
}) {
  if (warnings.length === 0) return null;
  const primary = warnings[0];
  const extra = warnings.length - 1;

  return (
    <button
      onClick={onOpen}
      className="mx-6 mt-3 rounded-md border border-red-500/70 bg-red-950/70 px-4 py-3 text-left shadow-lg shadow-red-950/30 hover:bg-red-950 transition-colors"
    >
      <div className="flex items-center gap-3">
        <span className="shrink-0 rounded bg-red-500 px-2 py-1 text-xs font-bold uppercase tracking-widest text-white">
          Warning
        </span>
        <span className="min-w-0 truncate text-xl font-black uppercase tracking-wide text-red-100">
          {primary.display}
        </span>
        {extra > 0 && (
          <span className="shrink-0 rounded border border-red-400/50 px-2 py-1 text-xs font-semibold text-red-200">
            +{extra}
          </span>
        )}
        <span className="ml-auto hidden shrink-0 text-xs text-red-200/80 sm:block">
          {primary.channel} = {primary.value}
        </span>
      </div>
    </button>
  );
}

export default function WarningsDashboard({
  definitions,
  activeWarnings,
  log,
  onUpdate,
  onReset,
  onClearLog,
}: {
  definitions: WarningDefinition[];
  activeWarnings: ActiveWarning[];
  log: WarningLogEntry[];
  onUpdate: (id: string, patch: Partial<WarningDefinition>) => void;
  onReset: () => void;
  onClearLog: () => void;
}) {
  const activeIds = new Set(activeWarnings.map((warning) => warning.id));

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <section>
        <div className="mb-3 flex items-center gap-3">
          <h2 className="text-xs uppercase tracking-widest text-nova-dim">Active Warnings</h2>
          <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${activeWarnings.length ? "bg-red-500/20 text-red-300" : "bg-green-900/40 text-green-400"}`}>
            {activeWarnings.length ? `${activeWarnings.length} active` : "clear"}
          </span>
        </div>
        {activeWarnings.length === 0 ? (
          <div className="rounded border border-nova-border bg-nova-panel px-4 py-5 text-sm text-nova-dim">
            No active warning codes.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {activeWarnings.map((warning) => (
              <div key={warning.id} className="rounded border border-red-500/60 bg-red-950/50 p-4">
                <p className="text-lg font-black uppercase tracking-wide text-red-100">{warning.display}</p>
                <p className="mt-1 text-xs text-red-200/80">
                  {warning.name} · {warning.channel} = {warning.value}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center gap-3">
          <h2 className="text-xs uppercase tracking-widest text-nova-dim">Definitions</h2>
          <button
            onClick={onReset}
            className="ml-auto rounded border border-nova-border px-2 py-1 text-xs text-nova-dim hover:border-nova-muted hover:text-nova-text"
          >
            Reset defaults
          </button>
        </div>
        <div className="overflow-x-auto rounded border border-nova-border bg-nova-panel">
          <table className="w-full min-w-[780px] text-left text-xs">
            <thead className="border-b border-nova-border text-[10px] uppercase tracking-widest text-nova-dim">
              <tr>
                <th className="px-3 py-2">On</th>
                <th className="px-3 py-2">Warning</th>
                <th className="px-3 py-2">Screen Text</th>
                <th className="px-3 py-2">Channel</th>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">State</th>
              </tr>
            </thead>
            <tbody>
              {definitions.map((warning) => {
                const active = activeIds.has(warning.id);
                return (
                  <tr key={warning.id} className={`border-b border-nova-border last:border-b-0 ${active ? "bg-red-950/30" : ""}`}>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={warning.enabled}
                        onChange={(e) => onUpdate(warning.id, { enabled: e.target.checked })}
                        className="accent-red-500"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={warning.name}
                        onChange={(e) => onUpdate(warning.id, { name: e.target.value })}
                        className="w-full rounded border border-nova-border bg-black px-2 py-1 text-nova-text focus:border-nova-red focus:outline-none"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={warning.display}
                        onChange={(e) => onUpdate(warning.id, { display: e.target.value })}
                        className="w-full rounded border border-nova-border bg-black px-2 py-1 text-nova-text focus:border-nova-red focus:outline-none"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={warning.channel}
                        onChange={(e) => onUpdate(warning.id, { channel: e.target.value })}
                        className="w-full rounded border border-nova-border bg-black px-2 py-1 font-mono text-nova-text focus:border-nova-red focus:outline-none"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={warning.equals}
                        onChange={(e) => onUpdate(warning.id, { equals: Number(e.target.value) })}
                        className="w-20 rounded border border-nova-border bg-black px-2 py-1 font-mono text-nova-text focus:border-nova-red focus:outline-none"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded px-2 py-1 text-[10px] font-semibold ${active ? "bg-red-500/20 text-red-300" : "bg-nova-muted/10 text-nova-dim"}`}>
                        {active ? "ACTIVE" : "clear"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center gap-3">
          <h2 className="text-xs uppercase tracking-widest text-nova-dim">Warning Log</h2>
          <button
            onClick={onClearLog}
            disabled={log.length === 0}
            className="ml-auto rounded border border-nova-border px-2 py-1 text-xs text-nova-dim hover:border-nova-muted hover:text-nova-text disabled:opacity-40"
          >
            Clear log
          </button>
        </div>
        <div className="overflow-hidden rounded border border-nova-border bg-nova-panel">
          {log.length === 0 ? (
            <p className="px-4 py-5 text-sm text-nova-dim">No warnings logged.</p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="border-b border-nova-border text-[10px] uppercase tracking-widest text-nova-dim">
                <tr>
                  <th className="px-3 py-2">Time</th>
                  <th className="px-3 py-2">Warning</th>
                  <th className="px-3 py-2">Channel</th>
                  <th className="px-3 py-2">Code</th>
                </tr>
              </thead>
              <tbody>
                {log.map((entry) => (
                  <tr key={entry.id} className="border-b border-nova-border last:border-b-0">
                    <td className="px-3 py-2 font-mono text-nova-dim">{formatTime(entry.at)}</td>
                    <td className="px-3 py-2 font-semibold text-red-200">{entry.display}</td>
                    <td className="px-3 py-2 font-mono text-nova-dim">{entry.channel}</td>
                    <td className="px-3 py-2 font-mono text-nova-text">{entry.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
