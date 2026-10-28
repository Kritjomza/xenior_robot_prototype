import { useRef, useState } from "react";
import type { RobotState } from "../generated/state";
import { post } from "../api";

export function ControlPanel({ state, disabled, onError }: {
  state: RobotState | null; disabled: boolean; onError: (error: string) => void;
}) {
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  async function command(path: string, body: unknown) {
    if (disabled || inFlight.current) return;
    inFlight.current = true; setBusy(true);
    try { await post(path, body); }
    catch (error) { onError(error instanceof Error ? error.message : "Manual command failed"); }
    finally { inFlight.current = false; setBusy(false); }
  }
  const unavailable = disabled || busy;
  const auxiliaryUnavailable = unavailable || state?.mode === "robodk";
  return <section className="control-panel" aria-label="Manual controls">
    <div className="manual-header"><h2>Manual controls</h2>
      <label>Step <select aria-label="Jog step" value={step} onChange={event => setStep(Number(event.target.value))} disabled={busy}>
        {[0.1, 0.5, 1, 5, 10].map(value => <option key={value} value={value}>{value} mm / °</option>)}
      </select></label>
    </div>
    <div className="jog-grid" aria-label="Jog controls">
      {(["x_mm", "y_mm", "z_mm", "rz_deg"] as const).map(axis => {
        const label = axis.replace("_mm", "").replace("_deg", "").toUpperCase();
        return <div className="jog-axis" key={axis}><span>{label}</span>
          {[-1, 1].map(direction => <button key={direction} aria-label={`${label}${direction < 0 ? "−" : "+"}`} disabled={unavailable || (axis === "rz_deg" && state?.mode === "robodk")}
            onClick={() => void command("jog", { [axis]: step * direction })}>{direction < 0 ? "−" : "+"}</button>)}
        </div>;
      })}
    </div>
    <div className="manual-actions">
      {([['Home', 'home'], ['Grip', 'grip'], ['Release', 'release']] as const).map(([label, type]) =>
        <button key={type} disabled={type === "home" ? unavailable : auxiliaryUnavailable} onClick={() => void command("runs", { version: 1, name: `Manual ${label}`, commands: [{ id: `manual-${type}`, type }] })}>{label}</button>)}
      <span role="status">{busy ? "Moving…" : disabled ? "Motion locked or unavailable" : "Step control ready"}</span>
    </div>
    {state?.mode === "robodk" && <p>RZ and gripper are not installed in this station.</p>}
  </section>;
}
