import { useRef, useState } from "react";
import type { RobotState } from "../generated/state";
import { post } from "../api";

export function ControlPanel({ state, disabled, onError }: {
  state: RobotState | null; disabled: boolean; onError: (error: string) => void;
}) {
  const [jogMode, setJogMode] = useState<"cartesian" | "theta">("cartesian");
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
    <div className="manual-header"><div><span className="panel-eyebrow">ROBOT CONTROL</span><h2>Motion jogger</h2></div>
      <div className="jog-tabs" role="group" aria-label="Jog mode">
        <button aria-pressed={jogMode === "cartesian"} onClick={() => setJogMode("cartesian")}>Cartesian <span>XYZ</span></button>
        <button aria-pressed={jogMode === "theta"} onClick={() => setJogMode("theta")}>Theta <span>Joints</span></button>
      </div>
    </div>
    <div className="jog-section-label">{jogMode === "cartesian" ? "Cartesian step size · mm" : "Joint step size · degrees"}</div>
    <div className="step-options" role="group" aria-label="Jog step">
      {[0.1, 0.5, 1, 5, 10].map(value => <button key={value} aria-pressed={step === value} onClick={() => setStep(value)} disabled={busy}>{value}{jogMode === "theta" ? "°" : ""}</button>)}
    </div>
    {jogMode === "cartesian" ? <div className="cartesian-jog" role="group" aria-label="Jog controls">
      {([['Y+', 'y_mm', 1], ['X−', 'x_mm', -1], ['X+', 'x_mm', 1], ['Y−', 'y_mm', -1], ['Z+', 'z_mm', 1], ['Z−', 'z_mm', -1], ['RZ−', 'rz_deg', -1], ['RZ+', 'rz_deg', 1]] as const).map(([label, axis, direction]) =>
        <button key={label} className={`jog-${label.replace('−', 'minus').replace('+', 'plus')}`} aria-label={label} disabled={unavailable || (axis === 'rz_deg' && state?.mode === 'robodk')} onClick={() => void command('jog', { [axis]: step * direction })}>{label}</button>)}
      <span className="jog-center" aria-hidden="true">XY</span>
    </div> : <div className="joint-jog" role="group" aria-label="Jog controls">
      {([0, 1, 2] as const).map(index => <div className="joint-row" key={index}>
        <div className="joint-title"><strong>Motor {index + 1} <small>J{index + 1}</small></strong><output>{state ? `${state.joints_deg[index].toFixed(1)}°` : '—'}</output></div>
        <div className="joint-actions">{[-1, 1].map(direction => <button key={direction} aria-label={`J${index + 1}${direction < 0 ? '−' : '+'}`} disabled={unavailable || state?.mode === 'robodk'} onClick={() => void command('jog', { [`j${index + 1}_deg`]: step * direction })}>{direction < 0 ? '−' : '+'}</button>)}
          <div className="joint-meter" aria-hidden="true"><i style={{ left: `${Math.max(0, Math.min(100, ((state?.joints_deg[index] ?? -45) + 45) / 130 * 100))}%` }} /></div>
        </div>
      </div>)}
    </div>}
    <div className="manual-actions">
      {([['Home', 'home'], ['Grip', 'grip'], ['Release', 'release']] as const).map(([label, type]) =>
        <button key={type} disabled={type === "home" ? unavailable : auxiliaryUnavailable} onClick={() => void command("runs", { version: 1, name: `Manual ${label}`, commands: [{ id: `manual-${type}`, type }] })}>{label}</button>)}
      <span role="status">{busy ? "Moving…" : disabled ? "Motion locked or unavailable" : "Step control ready"}</span>
    </div>
    {state?.mode === "robodk" && <p>RZ and gripper are not installed in this station.</p>}
  </section>;
}
