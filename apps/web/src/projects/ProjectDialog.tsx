import { useEffect, useRef, useState } from "react";
import { checkedName } from "./service";

export function ProjectDialog({ title, description, label, initialValue = "", confirmLabel, destructive = false, onConfirm, onClose }: {
  title: string; description?: string; label?: string; initialValue?: string;
  confirmLabel: string; destructive?: boolean;
  onConfirm: (name: string) => Promise<void> | void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [returnFocus] = useState(() => document.activeElement as HTMLElement | null);
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => { element.close(); if (returnFocus?.isConnected) returnFocus.focus(); };
  }, [returnFocus]);
  return <dialog ref={dialog} className="project-dialog" aria-labelledby="project-dialog-title" aria-describedby={description ? "project-dialog-description" : undefined}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <form onSubmit={async event => {
      event.preventDefault();
      if (busy) return;
      setError("");
      setBusy(true);
      try { await onConfirm(label ? checkedName(value) : ""); onClose(); }
      catch (failure) { setError(failure instanceof Error ? failure.message : "Could not complete this action. Try again."); }
      finally { setBusy(false); }
    }}>
      <h2 id="project-dialog-title">{title}</h2>
      {description && <p id="project-dialog-description">{description}</p>}
      {label && <label>{label}<input autoFocus required maxLength={120} value={value} disabled={busy} onChange={event => setValue(event.target.value)} aria-invalid={!!error} aria-describedby={error ? "project-dialog-error" : undefined} /></label>}
      {error && <p id="project-dialog-error" className="request-error" role="alert">{error}</p>}
      <div className="dialog-actions">
        <button type="button" disabled={busy} onClick={onClose} autoFocus={!label}>Cancel</button>
        <button className={destructive ? "danger-action" : "primary"} disabled={busy || (!!label && !value.trim())}>{busy ? "Working…" : confirmLabel}</button>
      </div>
    </form>
  </dialog>;
}
