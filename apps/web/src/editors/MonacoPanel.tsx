import { useEffect, useState } from "react";
import Editor, { loader, type OnMount } from "@monaco-editor/react";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";


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
      getWorker: () => new EditorWorker(),
    };
    void Promise.all([
      import("monaco-editor/esm/vs/editor/editor.api"),
      import("monaco-editor/esm/vs/basic-languages/python/python.contribution"),
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
      <label className="editor-label">Python robot program</label>
      <div className="monaco-editor-wrapper">
        {editorReady ? <Editor
          height="100%"
          language="python"
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
        className={import.meta.env.MODE === "test" ? "test-editor" : "sr-only"}
        aria-label="Python program"
        tabIndex={-1}
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
