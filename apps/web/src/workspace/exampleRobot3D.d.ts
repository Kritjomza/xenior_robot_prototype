export class DeltaRobot3D {
  constructor(container: HTMLElement, kinematics: { L: number; l: number; R: number; r: number; phi_rad: number[] });
  updatePose(joints: number[], position: number[]): void;
  setCameraView(view: string): void;
  dispose(): void;
}
