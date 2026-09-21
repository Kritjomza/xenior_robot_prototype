import type { SupabaseClient } from "@supabase/supabase-js";
import type { RobotProgram } from "../program/ir";

export type SourceType = "dsl" | "blockly";
export interface ProjectDraft {
  id?: string;
  name: string;
  description?: string;
  source_type: SourceType;
  dsl_source?: string;
  blockly_workspace?: object;
  program_ir: RobotProgram;
  schema_version: 1;
}

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export class ProjectService {
  constructor(
    private client: SupabaseClient,
    private userId: string,
  ) {}
  async list() {
    const result = await this.client
      .from("robot_projects")
      .select("*")
      .order("updated_at", { ascending: false });
    fail(result.error);
    return result.data ?? [];
  }
  async save(draft: ProjectDraft) {
    const payload = { ...draft, owner_id: this.userId };
    const result = draft.id
      ? await this.client
          .from("robot_projects")
          .update(payload)
          .eq("id", draft.id)
          .select()
          .single()
      : await this.client
          .from("robot_projects")
          .insert(payload)
          .select()
          .single();
    fail(result.error);
    return result.data;
  }
  async saveVersion(
    project: ProjectDraft & { id: string; current_revision: number },
  ) {
    const revision = project.current_revision + 1;
    const result = await this.client
      .from("project_revisions")
      .insert({
        project_id: project.id,
        revision_number: revision,
        source_type: project.source_type,
        dsl_source: project.dsl_source,
        blockly_workspace: project.blockly_workspace,
        program_ir: project.program_ir,
        created_by: this.userId,
      })
      .select()
      .single();
    fail(result.error);
    const update = await this.client
      .from("robot_projects")
      .update({ current_revision: revision })
      .eq("id", project.id);
    fail(update.error);
    return result.data;
  }
  async revisions(projectId: string) {
    const result = await this.client
      .from("project_revisions")
      .select("*")
      .eq("project_id", projectId)
      .order("revision_number", { ascending: false });
    fail(result.error);
    return result.data ?? [];
  }
  async remove(id: string) {
    const result = await this.client
      .from("robot_projects")
      .delete()
      .eq("id", id);
    fail(result.error);
  }
  async duplicate(project: ProjectDraft) {
    return this.save({
      name: `${project.name} Copy`,
      description: project.description,
      source_type: project.source_type,
      dsl_source: project.dsl_source,
      blockly_workspace: project.blockly_workspace,
      program_ir: project.program_ir,
      schema_version: 1,
    });
  }
}
