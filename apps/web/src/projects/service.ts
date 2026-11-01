import type { SupabaseClient } from "@supabase/supabase-js";
import { programToDsl, type RobotProgram } from "../program/ir";

export type SourceType = "dsl" | "blockly";
export interface ProjectDraft {
  id?: string;
  name: string;
  description?: string;
  source_type: SourceType;
  dsl_source?: string;
  blockly_workspace?: object;
  program_ir?: RobotProgram | null;
  schema_version: 1;
}
export type SavedProject = ProjectDraft & { id: string; current_revision: number; updated_at: string };
export type Revision = Omit<ProjectDraft, "schema_version" | "name"> & {
  id: string; project_id: string; name: string | null; revision_number: number; created_at: string;
};
type LocalData = { projects: SavedProject[]; revisions: Revision[] };

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}
export function checkedName(value: string): string {
  const name = value.trim();
  if (!name || name.length > 120) throw new Error("Enter a name between 1 and 120 characters.");
  return name;
}
export function projectSource(record: Pick<ProjectDraft, "dsl_source" | "program_ir">): string {
  if (record.dsl_source !== undefined && record.dsl_source !== null) {
    return record.dsl_source.trimStart().startsWith("{")
      ? programToDsl(JSON.parse(record.dsl_source) as RobotProgram) : record.dsl_source;
  }
  if (record.program_ir) return programToDsl(record.program_ir);
  throw new Error("This project has no restorable program.");
}
export function readLocalProjects(): LocalData {
  try {
    const stored = localStorage.getItem("deltax:projects");
    if (stored !== null) {
      const data = JSON.parse(stored) as LocalData;
      if (!Array.isArray(data.projects) || !Array.isArray(data.revisions) ||
        !data.projects.every(project => typeof project.id === "string" && typeof project.name === "string" && Number.isInteger(project.current_revision) && project.current_revision >= 0) ||
        !data.revisions.every(version => typeof version.id === "string" && typeof version.project_id === "string" && Number.isInteger(version.revision_number) && version.revision_number > 0)) throw new Error();
      return data;
    }
    const legacy = JSON.parse(localStorage.getItem("deltax:revisions") ?? "[]") as { source: string; savedAt?: string }[];
    if (!Array.isArray(legacy) || !legacy.every(record => typeof record.source === "string")) throw new Error();
    const source = localStorage.getItem("deltax:draft") ?? legacy.at(-1)?.source;
    if (source === undefined) return { projects: [], revisions: [] };
    const project: SavedProject = { id: "legacy-local", name: "Pick & Place", source_type: "dsl", dsl_source: source, schema_version: 1, current_revision: legacy.length, updated_at: legacy.at(-1)?.savedAt ?? "" };
    return { projects: [project], revisions: legacy.map((record, index) => ({ id: `legacy-${index}`, project_id: project.id, name: null, source_type: "dsl", dsl_source: record.source, revision_number: index + 1, created_at: record.savedAt ?? "" })) };
  } catch {
    throw new Error("Saved project data could not be read. Export or repair browser storage before saving; existing data has been kept.");
  }
}
function writeLocal(data: LocalData) {
  // Keep legacy keys untouched as a recovery copy; all new records commit in one write.
  localStorage.setItem("deltax:projects", JSON.stringify(data));
}
export class ProjectService {
  constructor(private client: SupabaseClient | null, private userId: string) {}
  async list(): Promise<SavedProject[]> {
    if (!this.client) return readLocalProjects().projects.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    const result = await this.client.from("robot_projects").select("*").order("updated_at", { ascending: false });
    fail(result.error);
    return result.data ?? [];
  }
  async save(draft: ProjectDraft): Promise<SavedProject> {
    const name = checkedName(draft.name);
    if (!this.client) {
      const data = readLocalProjects();
      if (data.projects.some(project => project.id !== draft.id && project.name.toLowerCase() === name.toLowerCase())) throw new Error("A project with this name already exists.");
      const previous = data.projects.find(project => project.id === draft.id);
      if (draft.id && !previous) throw new Error("Project no longer exists. Create a new project to save these edits.");
      const saved: SavedProject = { ...draft, name, id: previous?.id ?? crypto.randomUUID(), current_revision: previous?.current_revision ?? 0, updated_at: new Date().toISOString() };
      data.projects = [...data.projects.filter(project => project.id !== saved.id), saved];
      writeLocal(data);
      return saved;
    }
    const payload = { ...draft, name, program_ir: draft.program_ir ?? null, owner_id: this.userId };
    const result = draft.id
      ? await this.client.from("robot_projects").update(payload).eq("id", draft.id).select().single()
      : await this.client.from("robot_projects").insert(payload).select().single();
    fail(result.error);
    return result.data;
  }
  async saveVersion(project: SavedProject, versionName: string): Promise<Revision> {
    const name = checkedName(versionName);
    if (!this.client) {
      const data = readLocalProjects();
      const saved = data.projects.find(record => record.id === project.id);
      if (!saved) throw new Error("Project no longer exists.");
      const revision: Revision = { ...project, id: crypto.randomUUID(), project_id: saved.id, name, revision_number: saved.current_revision + 1, created_at: new Date().toISOString() };
      saved.current_revision = revision.revision_number;
      data.revisions.push(revision);
      writeLocal(data);
      return revision;
    }
    const result = await this.client.rpc("save_project_version", { target_project_id: project.id, version_name: name, snapshot_source_type: project.source_type, snapshot_source: project.dsl_source ?? null, snapshot_workspace: project.blockly_workspace ?? null, snapshot_program: project.program_ir ?? null });
    fail(result.error);
    return result.data;
  }
  async revisions(projectId: string): Promise<Revision[]> {
    if (!this.client) return readLocalProjects().revisions.filter(record => record.project_id === projectId).sort((a, b) => b.revision_number - a.revision_number);
    const result = await this.client.from("project_revisions").select("*").eq("project_id", projectId).order("revision_number", { ascending: false });
    fail(result.error);
    return result.data ?? [];
  }
  async rename(id: string, value: string) {
    const name = checkedName(value);
    if (!this.client) {
      const data = readLocalProjects();
      const project = data.projects.find(record => record.id === id);
      if (!project) throw new Error("Project no longer exists.");
      return this.save({ ...project, name });
    }
    const result = await this.client.from("robot_projects").update({ name }).eq("id", id).select().single();
    fail(result.error);
    return result.data as SavedProject;
  }
  async renameVersion(id: string, value: string) {
    const name = checkedName(value);
    if (!this.client) {
      const data = readLocalProjects();
      const version = data.revisions.find(record => record.id === id);
      if (!version) throw new Error("Version no longer exists.");
      version.name = name;
      writeLocal(data);
      return;
    }
    const result = await this.client.from("project_revisions").update({ name }).eq("id", id).select("id").single();
    fail(result.error);
  }
  async removeVersion(id: string) {
    if (!this.client) {
      const data = readLocalProjects();
      data.revisions = data.revisions.filter(record => record.id !== id);
      writeLocal(data);
      return;
    }
    const result = await this.client.from("project_revisions").delete().eq("id", id).select("id").single();
    fail(result.error);
  }
  async remove(id: string) {
    if (!this.client) {
      const data = readLocalProjects();
      data.projects = data.projects.filter(project => project.id !== id);
      data.revisions = data.revisions.filter(revision => revision.project_id !== id);
      writeLocal(data);
      return;
    }
    const result = await this.client.from("robot_projects").delete().eq("id", id).select("id").single();
    fail(result.error);
  }
  async duplicate(project: ProjectDraft) {
    return this.save({ name: `${project.name} Copy`, description: project.description, source_type: project.source_type, dsl_source: project.dsl_source, blockly_workspace: project.blockly_workspace, program_ir: project.program_ir, schema_version: 1 });
  }
}
