import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { RobotState } from "../generated/state";
import { DeltaRobot3D } from "./exampleRobot3D.js";

export type DeltaRobotSceneHandle = {
  resetView: () => void;
  fitView: () => void;
  setView: (view: "iso" | "top" | "front" | "side") => void;
};

export const DeltaRobotScene = forwardRef<DeltaRobotSceneHandle, { state: RobotState | null }>(function DeltaRobotScene({ state }, ref) {
  const container = useRef<HTMLDivElement>(null);
  const robot = useRef<DeltaRobot3D | null>(null);
  const [error, setError] = useState("");
  useImperativeHandle(ref, () => ({
    resetView: () => robot.current?.setCameraView("iso"),
    fitView: () => robot.current?.setCameraView("iso"),
    setView: view => robot.current?.setCameraView(view),
  }), []);
  useEffect(() => {
    if (!container.current) return;
    try {
      robot.current = new DeltaRobot3D(container.current, { L: 150, l: 400, R: 110, r: 45, phi_rad: [0, 2 * Math.PI / 3, 4 * Math.PI / 3] });
    } catch {
      setError("3D graphics unavailable. Live pose remains available below.");
    }
    return () => { robot.current?.dispose(); robot.current = null; };
  }, []);
  useEffect(() => {
    if (state) robot.current?.updatePose(state.joints_deg, [state.x_mm, state.y_mm, state.z_mm]);
  }, [state]);
  return <div className="delta-scene" ref={container} aria-label="Interactive 3D delta robot">{error && <p role="alert">{error}</p>}</div>;
});
export default DeltaRobotScene;
