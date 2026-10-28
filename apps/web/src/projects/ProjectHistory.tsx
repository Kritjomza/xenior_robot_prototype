import { useEffect, useState } from "react";
import { supabase } from "../auth/supabase";
import { ProjectService } from "./service";
import { programToDsl, type RobotProgram } from "../program/ir";

type Revision = { source?: string; dsl_source?: string; program_ir?: RobotProgram; savedAt?: string; created_at?: string; revision_number?: number };
type SavedProject = { id: string; name: string };
export function ProjectHistory({userId, projectId, onRestore, onError}: {
  userId?: string; projectId?: string;
  onRestore: (source: string, id?: string, name?: string) => void;
  onError: (message: string) => void;
}) {
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [selected, setSelected] = useState(projectId ?? "");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        if (supabase && userId) {
          const service = new ProjectService(supabase, userId);
          const records = await service.list() as SavedProject[];
          const id = selected || projectId || records[0]?.id;
          const versions = id ? await service.revisions(id) as Revision[] : [];
          if (active) { setProjects(records); setRevisions(versions); if (id && !selected) setSelected(id); }
        } else {
          const records = JSON.parse(localStorage.getItem("deltax:revisions") || "[]") as Revision[];
          if (active) setRevisions(records.map((record, index) => ({...record, revision_number: index + 1})).reverse());
        }
      } catch (error) { if (active) onError(error instanceof Error ? error.message : "History unavailable"); }
      finally { if (active) setLoading(false); }
    }
    void load(); return () => { active = false; };
  }, [userId, projectId, selected, onError]);
  function restore(revision: Revision) {
    const raw = revision.dsl_source ?? revision.source;
    let source = raw;
    try {
      if (raw?.trimStart().startsWith("{")) source = programToDsl(JSON.parse(raw) as RobotProgram);
      if (!source && revision.program_ir) source = programToDsl(revision.program_ir);
      if (!source) throw new Error("This revision has no restorable program");
      if (window.confirm("Load this revision into the editor? Unsaved edits will be replaced; the saved revision stays unchanged."))
        onRestore(source, selected || undefined, projects.find(project => project.id === selected)?.name);
    } catch (error) { onError(error instanceof Error ? error.message : "Cannot restore revision"); }
  }
  return <section className="project-history" aria-label="Version history">
    <h2>Version history</h2>
    {projects.length > 0 && <label>Project <select aria-label="History project" value={selected} onChange={event => setSelected(event.target.value)}>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>}
    {loading ? <p role="status">Loading revisions…</p> : revisions.length === 0 ? <p>No saved revisions. Use Save Version to keep a snapshot.</p> :
      <ol>{revisions.map((revision, index) => <li key={revision.revision_number ?? index}>
        <span>Version {revision.revision_number ?? index + 1}</span>
        <time>{revision.created_at || revision.savedAt ? new Date(revision.created_at ?? revision.savedAt!).toLocaleString() : 'Timestamp unavailable'}</time>
        <button onClick={() => restore(revision)}>Load into editor</button>
      </li>)}</ol>}
  </section>;
}
