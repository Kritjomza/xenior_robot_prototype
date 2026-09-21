import type { RobotState } from "../generated/state";
import { post } from "../api";

export function ControlPanel({
  state,
  disabled,
  onError,
}: {
  state: RobotState | null;
  disabled: boolean;
  onError: (error: string) => void;
}) {
  const jog = async (
    axis: "x_mm" | "y_mm" | "z_mm" | "rz_deg",
    delta: number,
  ) => {
    try {
      await post("jog", {
        x_mm: 0,
        y_mm: 0,
        z_mm: 0,
        rz_deg: 0,
        [axis]: delta,
      });
    } catch (error) {
      onError(error instanceof Error ? error.message : "Jog failed");
    }
  };
  return (
    <section className="control-panel">
      <h2>Cartesian simulation control</h2>
      <p>
        {disabled
          ? "Unlock a connected, valid simulator to jog."
          : "Step mode · one validated increment per command."}
      </p>
      <div className="jog-grid" aria-label="Jog controls">
        {(["x_mm", "y_mm", "z_mm", "rz_deg"] as const).map((axis) => {
          const value = state?.[axis];
          const label = axis
            .replace("_mm", "")
            .replace("_deg", "")
            .toUpperCase();
          return (
            <div className="jog-axis" key={axis}>
              <div className="jog-axis__readout">
                <span>{label}</span>
                <strong>{value ?? "—"}</strong>
                <small>{axis === "rz_deg" ? "deg" : "mm"}</small>
              </div>
              <div className="jog-axis__actions">
                {[-1, 1].map((direction) => (
                  <button
                    key={`${axis}${direction}`}
                    disabled={disabled}
                    onClick={() => void jog(axis, direction)}
                  >
                    <span className="sr-only">{label}</span>
                    {direction < 0 ? "−" : "+"}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <dl>
        <dt>X</dt>
        <dd>{state?.x_mm ?? "—"} mm</dd>
        <dt>Y</dt>
        <dd>{state?.y_mm ?? "—"} mm</dd>
        <dt>Z</dt>
        <dd>{state?.z_mm ?? "—"} mm</dd>
        <dt>RZ/J4</dt>
        <dd>{state?.rz_deg ?? "—"}°</dd>
      </dl>
    </section>
  );
}
