import { describe, expect, it } from "vitest";
import {
  blocklyToProgram,
  dslToProgram,
  programToBlockly,
  programToDsl,
} from "./ir";

describe("RobotProgramV1 editor conversions", () => {
  it("converts DSL to Blockly-compatible IR and back", () => {
    const program = dslToProgram([
      "home()",
      "move_to(x=10, y=20, z=-200, speed=40)",
      "grip()",
    ]);
    expect(programToBlockly(program).blocks[1].id).toBe("line-2");
    expect(programToDsl(blocklyToProgram(programToBlockly(program)))).toContain(
      "move_to",
    );
  });

  it("rejects unsupported calls", () => {
    expect(() => dslToProgram(["import os"])).toThrow(/unsupported syntax/);
  });
});
