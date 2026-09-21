import Editor, { type OnMount } from "@monaco-editor/react";

export function MonacoPanel({
  value,
  disabled,
  onChange,
  activeLine,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  activeLine?: number;
}) {
  const mounted: OnMount = (editor) => {
    if (activeLine) {
      editor.revealLineInCenter(activeLine);
      editor.setPosition({ lineNumber: activeLine, column: 1 });
    }
  };
  return (
    <div className="monaco-panel">
      <label className="editor-label">Safe Robot DSL / RobotProgramV1</label>
      <Editor
        height="455px"
        language={value.trimStart().startsWith("{") ? "json" : "python"}
        value={value}
        options={{
          readOnly: disabled,
          minimap: { enabled: false },
          lineNumbers: "on",
          automaticLayout: true,
          quickSuggestions: true,
        }}
        onMount={mounted}
        onChange={(next) => onChange(next ?? "")}
      />
      <textarea
        className="sr-only"
        aria-label="RobotProgramV1 JSON"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
