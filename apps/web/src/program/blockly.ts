import { programToDsl, type RobotCommand, type RobotProgram } from "./ir";

type Block = {
  type: string;
  id?: string;
  fields?: Record<string, number>;
  data?: string;
  next?: { block: Block };
};
type Workspace = { blocks: { languageVersion: number; blocks: Block[] } };

export function programToWorkspace(program: RobotProgram): Workspace {
  let next: Block | undefined;
  for (const command of [...program.commands].reverse()) {
    const type = command.type === "set_speed" ? "speed" : command.type === "move_xyz" ? "move" : command.type;
    const block: Block = { type: `dx_${type}`, id: `block-${command.id}` };
    if (command.type === "set_speed") block.fields = { SPEED: Number(command.speed_mm_s) };
    if (command.type === "wait") block.fields = { SECONDS: Number(command.seconds) };
    if (command.type === "move_xyz") {
      block.fields = { X: Number(command.x_mm), Y: Number(command.y_mm), Z: Number(command.z_mm) };
      if (command.speed_mm_s != null) block.data = String(command.speed_mm_s);
    }
    if (next) block.next = { block: next };
    next = block;
  }
  return { blocks: { languageVersion: 0, blocks: [{ type: "dx_start", id: "program-start", ...(next ? { next: { block: next } } : {}) }] } };
}

export function workspaceToPython(json: object): string {
  const roots = (json as Workspace).blocks?.blocks ?? [];
  if (roots.length !== 1) throw new Error("Connect all blocks in one program stack.");
  const commands: RobotCommand[] = [];
  const visited = new Set<Block>();
  let block: Block | undefined = roots[0];
  while (block) {
    if (visited.has(block) || visited.size >= 1001) throw new Error("Block program is too large or contains a cycle.");
    visited.add(block);
    const id = `block-${commands.length + 1}`;
    const value = (field: string) => {
      const number = block!.fields?.[field];
      if (typeof number !== "number" || !Number.isFinite(number)) throw new Error(`Enter a finite number for ${field}.`);
      return number;
    };
    switch (block.type) {
      case "dx_start":
        if (visited.size !== 1) throw new Error("Start must be the first block.");
        break;
      case "dx_home": case "dx_grip": case "dx_release": case "dx_stop":
        commands.push({ id, type: block.type.slice(3) as RobotCommand["type"] }); break;
      case "dx_speed": commands.push({ id, type: "set_speed", speed_mm_s: value("SPEED") }); break;
      case "dx_wait": commands.push({ id, type: "wait", seconds: value("SECONDS") }); break;
      case "dx_move": {
        const command: RobotCommand = { id, type: "move_xyz", x_mm: value("X"), y_mm: value("Y"), z_mm: value("Z") };
        if (block.data) {
          const speed = Number(block.data);
          if (!Number.isFinite(speed) || speed <= 0) throw new Error("Move speed must be a positive finite number.");
          command.speed_mm_s = speed;
        }
        commands.push(command); break;
      }
      default: throw new Error("Unsupported robot block.");
    }
    block = block.next?.block;
  }
  if (!commands.length) throw new Error("Add a robot command below Start.");
  return programToDsl({ version: 1, name: "Blockly program", commands });
}
