import { useEffect, useMemo, useState } from "react";
import { supabase } from "../auth/supabase";
import { ProjectService, projectSource, type Revision, type SavedProject } from "./service";
import { ProjectDialog } from "./ProjectDialog";

type EditAction = { kind: "project-name" | "project-delete"; project: SavedProject } | { kind: "version-name" | "version-delete"; version: Revision };
const timestamp = (value: string) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "Date unavailable";

export function ProjectHistory({ userId, projectId, onRestore, onError, onDeleted, onRenamed, onNew }: {
  userId?: string; projectId?: string;
  onRestore: (source: string, id: string, name: string, isVersion?: boolean) => void;
  onError: (message: string) => void; onDeleted: (id: string) => void;
  onRenamed: (project: SavedProject) => void; onNew: () => void;
}) {
  const service = useMemo(() => new ProjectService(userId ? supabase : null, userId ?? ""), [userId]);
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [selected, setSelected] = useState(projectId ?? "");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [query, setQuery] = useState("");
  const [action, setAction] = useState<EditAction | null>(null);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true); setLoadError("");
      try {
        const records = await service.list();
        const id = records.some(project => project.id === selected) ? selected : records[0]?.id ?? "";
        const versions = id ? await service.revisions(id) : [];
        if (active) { setProjects(records); setRevisions(versions); setSelected(id); }
      } catch (failure) { if (active) setLoadError(failure instanceof Error ? failure.message : "Projects unavailable."); }
      finally { if (active) setLoading(false); }
    }
    void load(); return () => { active = false; };
  }, [service, selected, refresh]);
  const project = projects.find(record => record.id === selected);
  const filtered = projects.filter(record => record.name.toLowerCase().includes(query.trim().toLowerCase()));
  function open(record: SavedProject | Revision) {
    if (!project) return;
    try { onRestore(projectSource(record), project.id, project.name, "revision_number" in record); }
    catch (failure) { onError(failure instanceof Error ? failure.message : "Cannot open program."); }
  }
  return <section className="project-library" aria-label="Project library">
    <div className="library-toolbar">
      <div><h2>Your projects</h2><p>{userId && supabase ? "Saved to your account" : "Saved in this browser"} · {projects.length} {projects.length === 1 ? "project" : "projects"}</p></div>
      <button className="primary" onClick={onNew}>New project</button>
    </div>
    {notice && <p className="library-notice" role="status">{notice}</p>}
    {loadError ? <div className="library-empty"><p role="alert">{loadError}</p><button onClick={() => setRefresh(value => value + 1)}>Try again</button></div> :
      <div className="library-layout" aria-busy={loading}>
        <aside className="project-list" aria-label="Saved projects">
          <label className="project-search">Find a project<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by name" /></label>
          {loading && <p role="status">Loading projects…</p>}
          {!loading && projects.length === 0 && <p>No projects yet. Save your program or create a project to get started.</p>}
          {!loading && projects.length > 0 && filtered.length === 0 && <p>No projects match “{query}”.</p>}
          <ul>{filtered.map(record => <li key={record.id}><button className={selected === record.id ? "is-selected" : ""} aria-pressed={selected === record.id} disabled={loading} onClick={() => { setSelected(record.id); setNotice(""); }}>
            <strong>{record.name}</strong><span>{record.id === projectId ? "In editor · " : ""}{timestamp(record.updated_at)}</span>
          </button></li>)}</ul>
        </aside>
        <div className="project-detail">
          {project && !loading ? <>
            <div className="project-detail-header"><div><h2>{project.name}</h2><p>Last saved {timestamp(project.updated_at)}</p></div>
              <div className="project-actions"><button onClick={() => setAction({ kind: "project-name", project })}>Rename project</button><button className="danger-text" onClick={() => setAction({ kind: "project-delete", project })}>Delete project</button></div>
            </div>
            <div className="saved-draft"><div><h3>Latest saved program</h3><p>Your working copy, separate from version snapshots.</p></div><button onClick={() => open(project)}>Open project</button></div>
            <section className="project-history" aria-label="Version history">
              <div className="history-heading"><h2>Version history</h2><span>{revisions.length} {revisions.length === 1 ? "version" : "versions"}</span></div>
              {revisions.length === 0 ? <p className="history-empty">No versions yet. Open this project and use Save Version to keep a named snapshot.</p> :
                <ol>{revisions.map(revision => <li key={revision.id}>
                  <div className="version-info"><strong>{revision.name || `Version ${revision.revision_number}`}</strong><span>Version {revision.revision_number} · {timestamp(revision.created_at)}</span></div>
                  <div className="version-actions"><button onClick={() => open(revision)}>Load into editor</button><button aria-label={`Rename version ${revision.revision_number}`} onClick={() => setAction({ kind: "version-name", version: revision })}>Rename</button><button className="danger-text" aria-label={`Delete version ${revision.revision_number}`} onClick={() => setAction({ kind: "version-delete", version: revision })}>Delete</button></div>
                </li>)}</ol>}
            </section>
          </> : !loading && <div className="library-empty"><h2>Keep your robot programs together</h2><p>Save working programs, name milestones, and return to an earlier version.</p><button onClick={onNew}>Create a project</button></div>}
        </div>
      </div>}
    {action && <ProjectDialog
      title={action.kind === "project-name" ? "Rename project" : action.kind === "project-delete" ? "Delete project?" : action.kind === "version-name" ? "Rename version" : "Delete version?"}
      label={action.kind.endsWith("name") ? (action.kind === "project-name" ? "Project name" : "Version name") : undefined}
      initialValue={"project" in action ? action.project.name : action.version.name ?? `Version ${action.version.revision_number}`}
      description={action.kind === "project-delete" ? `“${action.project.name}” and all its saved versions will be permanently deleted. The program in the editor will be kept as an unsaved draft.` : action.kind === "version-delete" ? `This permanently deletes “${action.version.name || `Version ${action.version.revision_number}`}”. The latest saved program stays unchanged.` : undefined}
      destructive={action.kind.endsWith("delete")} confirmLabel={action.kind.endsWith("delete") ? "Delete permanently" : "Save name"}
      onClose={() => setAction(null)} onConfirm={async name => {
        if (action.kind === "project-name") { const updated = await service.rename(action.project.id, name); onRenamed(updated); }
        if (action.kind === "project-delete") { await service.remove(action.project.id); onDeleted(action.project.id); }
        if (action.kind === "version-name") await service.renameVersion(action.version.id, name);
        if (action.kind === "version-delete") await service.removeVersion(action.version.id);
        setNotice(action.kind.endsWith("delete") ? "Deleted." : "Name updated.");
        setRefresh(value => value + 1);
      }} />}
  </section>;
}
