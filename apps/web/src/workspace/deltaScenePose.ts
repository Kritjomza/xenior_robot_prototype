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
  const geometric = state.mode === "mock";
  const baseRadius = 340 / (2 * Math.sqrt(3)) / 100;
  const platformRadius = 120 / (2 * Math.sqrt(3)) / 100;
  const motorY = (-200 + Math.sqrt(420 ** 2 - ((340 - 120) / (2 * Math.sqrt(3)) + 180) ** 2)) / 100;
  angles.forEach((angle, index) => {
    const joint = ((state.joints_deg[index] ?? 0) * Math.PI) / 180;
    const radius = geometric ? baseRadius + 1.8 * Math.cos(joint) : 1.75 + 1.05 * Math.cos(joint);
    motors.push(geometric ? [baseRadius * Math.cos(angle), motorY, baseRadius * Math.sin(angle)] : [1.75 * Math.cos(angle), -0.32, 1.75 * Math.sin(angle)]);
    elbows.push([radius * Math.cos(angle), geometric ? motorY - 1.8 * Math.sin(joint) : -1.15 - 1.05 * Math.sin(joint), radius * Math.sin(angle)]);
    platformJoints.push([
      tool[0] + (geometric ? platformRadius : 0.55) * Math.cos(angle),
      tool[1] + (geometric ? 0 : 0.12),
      tool[2] + (geometric ? platformRadius : 0.55) * Math.sin(angle),
    ]);
  });
  return { tool, motors, elbows, platformJoints };
}

