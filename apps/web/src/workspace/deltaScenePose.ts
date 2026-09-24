export type Point3 = [number, number, number];

type PoseTelemetry = {
  x_mm: number;
  y_mm: number;
  z_mm: number;
  joints_deg: readonly number[];
};

const angles = [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3];

export function deltaScenePose(state: PoseTelemetry): {
  tool: Point3;
  motors: Point3[];
  elbows: Point3[];
  platformJoints: Point3[];
} {
  const tool: Point3 = [state.x_mm / 100, state.z_mm / 100, state.y_mm / 100];
  const motors: Point3[] = [];
  const elbows: Point3[] = [];
  const platformJoints: Point3[] = [];
  angles.forEach((angle, index) => {
    const joint = ((state.joints_deg[index] ?? 0) * Math.PI) / 180;
    const radius = 1.75 + 1.05 * Math.cos(joint);
    motors.push([1.75 * Math.cos(angle), -0.32, 1.75 * Math.sin(angle)]);
    elbows.push([radius * Math.cos(angle), -1.15 - 1.05 * Math.sin(joint), radius * Math.sin(angle)]);
    platformJoints.push([
      tool[0] + 0.55 * Math.cos(angle),
      tool[1] + 0.12,
      tool[2] + 0.55 * Math.sin(angle),
    ]);
  });
  return { tool, motors, elbows, platformJoints };
}
