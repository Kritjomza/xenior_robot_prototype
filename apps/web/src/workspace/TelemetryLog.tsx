import { useEffect, useRef, useState } from "react";
import type { RobotState } from "../generated/state";

type Entry = { id: number; time: string; kind: string; text: string };
export function TelemetryLog({ state, live, errors }: { state: RobotState | null; live: boolean; errors: { id: number; time: string; text: string }[] }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const previous = useRef<{ live: boolean; status?: string; command?: string | null; error?: string | null } | null>(null);
  const nextId = useRef(0);
  useEffect(() => {
    const before = previous.current;
    const events: { kind: string; text: string }[] = [];
    if (!before || before.live !== live) events.push({ kind: "SYSTEM", text: live ? "Telemetry connected" : "Telemetry disconnected" });
    if (state && before?.status !== state.status) events.push({ kind: "STATE", text: `Robot ${state.status}` });
    if (state?.active_command_id && before?.command !== state.active_command_id) events.push({ kind: "COMMAND", text: `${state.active_command_id} · ${state.active_command_type}` });
    if (state?.error && before?.error !== state.error) events.push({ kind: "ERROR", text: state.error });
    previous.current = { live, status: state?.status, command: state?.active_command_id, error: state?.error };
    if (events.length) {
      const time = new Date().toLocaleTimeString();
      setEntries(current => [...current, ...events.map(event => ({ ...event, time, id: nextId.current++ }))].slice(-100));
    }
  }, [live, state]);
  return <section className="telemetry-log" aria-label="Terminal and telemetry log">
    <div className="telemetry-log-header"><div><span className="panel-eyebrow">ACTIVITY</span><h2>Terminal & telemetry log</h2></div><span className={`log-indicator ${live ? 'is-live' : ''}`}>{live ? 'LIVE' : 'OFFLINE'}</span></div>
    <div className="telemetry-log-body" role="log" aria-live="polite" aria-relevant="additions">
      {!entries.length && !errors.length && <div className="log-empty">Waiting for simulator events…</div>}
      {[...errors.map(entry => ({ ...entry, kind: "ERROR" })), ...entries].sort((a, b) => a.id - b.id).map(entry => <div className="log-entry" key={`${entry.kind}-${entry.id}`}><time>{entry.time}</time><b className={entry.kind === 'ERROR' ? 'log-error' : ''}>{entry.kind}</b><span>{entry.text}</span></div>)}
    </div>
  </section>;
}
