import { expect, it } from "vitest";
import { deltaScenePose } from "./deltaScenePose";

it("places tool from RoboDK millimetre telemetry in 3D viewer units", () => {
  expect(deltaScenePose({ x_mm: 100, y_mm: -50, z_mm: -426, joints_deg: [0, 0, 0] }).tool)
    .toEqual([1, -4.26, -0.5]);
});

it("moves an elbow when its corresponding joint changes", () => {
  const home = deltaScenePose({ x_mm: 0, y_mm: 0, z_mm: -426, joints_deg: [0, 0, 0] });
  const moved = deltaScenePose({ x_mm: 0, y_mm: 0, z_mm: -426, joints_deg: [20, 0, 0] });
  expect(moved.elbows[0][1]).toBeLessThan(home.elbows[0][1]);
  expect(moved.elbows[1]).toEqual(home.elbows[1]);
});

it("preserves the example arm lengths for the home pose", () => {
  const pose = deltaScenePose({ x_mm: 0, y_mm: 0, z_mm: -350, joints_deg: [4.730137264504335, 4.730137264504335, 4.730137264504335], mode: "mock" });
  const distance = (a: number[], b: number[]) => Math.hypot(...a.map((v, i) => v - b[i]));
  for (let i = 0; i < 3; i++) {
    expect(distance(pose.motors[i], pose.elbows[i])).toBeCloseTo(1.5, 8);
    expect(distance(pose.elbows[i], pose.platformJoints[i])).toBeCloseTo(4, 8);
  }
});
