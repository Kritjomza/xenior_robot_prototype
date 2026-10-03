import { useEffect, useState } from "react";
import Editor, { loader, type OnMount } from "@monaco-editor/react";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";

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
  const [editorReady, setEditorReady] = useState(import.meta.env.MODE === "test");
  useEffect(() => {
    if (import.meta.env.MODE === "test") return;
    let active = true;
    (globalThis as typeof globalThis & {
      MonacoEnvironment?: { getWorker: (_moduleId: string, label: string) => Worker };
    }).MonacoEnvironment = {
      getWorker: (_moduleId, label) =>
        label === "json" ? new JsonWorker() : new EditorWorker(),
    };
    void Promise.all([
      import("monaco-editor/esm/vs/editor/editor.api"),
      import("monaco-editor/esm/vs/language/json/monaco.contribution"),
    ]).then(([monaco]) => {
      loader.config({ monaco });
      if (active) setEditorReady(true);
    });
    return () => { active = false; };
  }, []);
  const mounted: OnMount = (editor) => {
    if (activeLine) {
      editor.revealLineInCenter(activeLine);
      editor.setPosition({ lineNumber: activeLine, column: 1 });
    }
  };
  return (
    <div className="monaco-panel">
      <label className="editor-label">Safe Robot DSL / RobotProgramV1</label>
      <div className="monaco-editor-wrapper">
        {editorReady ? <Editor
          height="400px"
          language={value.trimStart().startsWith("{") ? "json" : "python"}
          value={value}
          options={{
            readOnly: disabled,
            minimap: { enabled: false },
            lineNumbers: "on",
            automaticLayout: true,
            quickSuggestions: true,
            scrollBeyondLastLine: false,
          }}
          onMount={mounted}
          onChange={(next) => onChange(next ?? "")}
        /> : <div className="editor-loading">Loading editor…</div>}
      </div>
      <textarea
        className="sr-only"
        aria-label="RobotProgramV1 JSON"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
