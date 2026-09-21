import { useEffect, useRef } from "react";
import * as Blockly from "blockly";

const blocks = [
  { type: "dx_start", message0: "Start", nextStatement: null, colour: 145 },
  {
    type: "dx_home",
    message0: "Home",
    previousStatement: null,
    nextStatement: null,
    colour: 220,
  },
  {
    type: "dx_speed",
    message0: "Set speed %1 mm/s",
    args0: [{ type: "field_number", name: "SPEED", value: 100, min: 1 }],
    previousStatement: null,
    nextStatement: null,
    colour: 25,
  },
  {
    type: "dx_move",
    message0: "Move X %1 Y %2 Z %3 mm",
    args0: ["X", "Y", "Z"].map((name) => ({
      type: "field_number",
      name,
      value: name === "Z" ? -200 : 0,
    })),
    previousStatement: null,
    nextStatement: null,
    colour: 25,
  },
  {
    type: "dx_grip",
    message0: "Grip",
    previousStatement: null,
    nextStatement: null,
    colour: 220,
  },
  {
    type: "dx_release",
    message0: "Release",
    previousStatement: null,
    nextStatement: null,
    colour: 220,
  },
  {
    type: "dx_wait",
    message0: "Wait %1 seconds",
    args0: [{ type: "field_number", name: "SECONDS", value: 0.5, min: 0.01 }],
    previousStatement: null,
    nextStatement: null,
    colour: 45,
  },
  {
    type: "dx_stop",
    message0: "Stop",
    previousStatement: null,
    nextStatement: null,
    colour: 5,
  },
];
for (const block of blocks)
  if (!Blockly.Blocks[block.type])
    Blockly.common.defineBlocksWithJsonArray([block]);
const toolbox = {
  kind: "categoryToolbox",
  contents: [
    {
      kind: "category",
      name: "Program",
      colour: 220,
      contents: blocks.map((block) => ({ kind: "block", type: block.type })),
    },
  ],
};

export function BlocklyPanel({
  onWorkspace,
}: {
  onWorkspace: (json: object) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current) return;
    const workspace = Blockly.inject(host.current, {
      toolbox,
      trashcan: true,
      zoom: { controls: true, wheel: true, startScale: 0.9 },
    });
    const listener = () =>
      onWorkspace(Blockly.serialization.workspaces.save(workspace));
    workspace.addChangeListener(listener);
    return () => workspace.dispose();
  }, [onWorkspace]);
  return (
    <div ref={host} className="blockly-real" aria-label="Blockly workspace" />
  );
}
