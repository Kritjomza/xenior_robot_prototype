import { expect, it } from "vitest";
import { programToWorkspace, workspaceToPython } from "./blockly";

it("retains ordered commands and explicit move speed through Blockly conversion", () => {
  const workspace = programToWorkspace({version:1,name:"Test",commands:[
    {id:"home",type:"home"},
    {id:"move",type:"move_xyz",x_mm:-50,y_mm:20,z_mm:-250,speed_mm_s:12},
    {id:"grip",type:"grip"}, {id:"wait",type:"wait",seconds:0.5}, {id:"stop",type:"stop"},
  ]});
  expect(workspaceToPython(workspace)).toBe("home()\nmove_to(x=-50, y=20, z=-250, speed=12)\ngrip()\nwait(0.5)\nstop()");
});

it("rejects disconnected stacks instead of silently running only one", () => {
  expect(() => workspaceToPython({blocks:{blocks:[{type:"dx_home"},{type:"dx_grip"}]}})).toThrow("one program stack");
});
