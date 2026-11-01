import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, expect, it, vi } from "vitest";
import { ProjectService, type ProjectDraft } from "./service";

const draft: ProjectDraft = { name: "Sorter", source_type: "dsl", dsl_source: "home(", program_ir: { version: 1, name: "Sorter", commands: [] }, schema_version: 1 };
beforeEach(() => localStorage.clear());

it("keeps local projects separate and version numbers monotonic after deletion", async () => {
  const service = new ProjectService(null, "");
  const first = await service.save(draft);
  const second = await service.save({ ...draft, name: "Packing" });
  const version = await service.saveVersion(first, "Before tuning");
  await service.renameVersion(version.id, "Calibrated");
  expect((await service.revisions(first.id))[0].name).toBe("Calibrated");
  expect(await service.revisions(second.id)).toEqual([]);
  await service.removeVersion(version.id);
  const next = await service.saveVersion(first, "Next pass");
  expect(next.revision_number).toBe(2);
  await service.rename(first.id, "  Sorting cell  ");
  expect((await service.list()).find(project => project.id === first.id)?.name).toBe("Sorting cell");
  await service.remove(first.id);
  expect(await service.revisions(first.id)).toEqual([]);
  expect((await service.list()).map(project => project.id)).toEqual([second.id]);
});

it("migrates old local snapshots without deleting the originals", async () => {
  localStorage.setItem("deltax:draft", "home()");
  const legacy = JSON.stringify([{ source: "wait(1)", savedAt: "2026-10-01T00:00:00Z" }]);
  localStorage.setItem("deltax:revisions", legacy);
  const service = new ProjectService(null, "");
  const [project] = await service.list();
  expect(project.dsl_source).toBe("home()");
  expect((await service.revisions(project.id))[0].dsl_source).toBe("wait(1)");
  await service.rename(project.id, "Recovered");
  expect(localStorage.getItem("deltax:revisions")).toBe(legacy);
  expect((await service.list())[0].name).toBe("Recovered");
});

it("rejects empty, duplicate and oversized names without changing saved data", async () => {
  const service = new ProjectService(null, "");
  const project = await service.save(draft);
  for (const name of [" ", "x".repeat(121), " sorter "]) {
    await expect(service.save({ ...draft, name })).rejects.toThrow();
  }
  expect((await service.list()).map(item => item.id)).toEqual([project.id]);
});

it("does not overwrite corrupt local storage or hide quota failures", async () => {
  const service = new ProjectService(null, "");
  localStorage.setItem("deltax:projects", "broken");
  await expect(service.save(draft)).rejects.toThrow(/saved project data/i);
  expect(localStorage.getItem("deltax:projects")).toBe("broken");
  localStorage.clear();
  const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage full"); });
  await expect(service.save(draft)).rejects.toThrow("Storage full");
  write.mockRestore();
});

it("snapshots the requested source even when a newer working copy exists", async () => {
  const service = new ProjectService(null, "");
  const first = await service.save(draft);
  await service.save({ ...first, dsl_source: "wait(2)" });
  const revision = await service.saveVersion(first, "Original");
  expect(revision.dsl_source).toBe("home(");
  expect((await service.list())[0].dsl_source).toBe("wait(2)");
});

it("passes the user's exact snapshot to the atomic cloud operation and surfaces failures", async () => {
  const rpc = vi.fn().mockResolvedValueOnce({ data: { id: "revision-1" }, error: null }).mockResolvedValueOnce({ data: null, error: { message: "Access denied" } });
  const service = new ProjectService({ rpc } as unknown as SupabaseClient, "owner-1");
  const project = { ...draft, id: "project-1", current_revision: 4, updated_at: "2026-11-01T00:00:00Z" };
  await service.saveVersion(project, "  Before tuning  ");
  expect(rpc).toHaveBeenCalledWith("save_project_version", {
    target_project_id: "project-1", version_name: "Before tuning", snapshot_source_type: "dsl",
    snapshot_source: "home(", snapshot_workspace: null, snapshot_program: draft.program_ir,
  });
  await expect(service.saveVersion(project, "Retry")).rejects.toThrow("Access denied");
});
