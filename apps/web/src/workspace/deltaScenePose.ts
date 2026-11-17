export type Point3 = [number, number, number];

type PoseTelemetry = {
  x_mm: number;
  y_mm: number;
  z_mm: number;
  joints_deg: readonly number[];
  mode?: string;
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
  const baseRadius = 1.1;
  const platformRadius = 0.45;
  angles.forEach((angle, index) => {
    const joint = ((state.joints_deg[index] ?? 0) * Math.PI) / 180;
    const radius = baseRadius + 1.5 * Math.cos(joint);
    motors.push([baseRadius * Math.cos(angle), 0, baseRadius * Math.sin(angle)]);
    elbows.push([radius * Math.cos(angle), -1.5 * Math.sin(joint), radius * Math.sin(angle)]);
    platformJoints.push([
      tool[0] + platformRadius * Math.cos(angle),
      tool[1],
      tool[2] + platformRadius * Math.sin(angle),
    ]);
  });
  return { tool, motors, elbows, platformJoints };
}

