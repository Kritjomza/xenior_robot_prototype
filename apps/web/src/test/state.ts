import type { RobotState } from '../generated/state'

export const initialState: RobotState = {
  version: 1, revision: 1, mode: 'mock', connected: true, status: 'idle',
  x_mm: 0, y_mm: 0, z_mm: -200, joints_deg: [0, 0, 0], rz_deg: 0, speed_mm_s: 100,
  global_speed_percent: 100, locked: true, lock_reason: 'startup',
  gripper: 'released', run_id: null, program_name: null,
  active_command_id: null, active_command_type: null,
  completed_commands: 0, total_commands: 0, error: null,
}
