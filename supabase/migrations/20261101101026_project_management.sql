alter table public.project_revisions add column name varchar(120)
  check (name is null or char_length(btrim(name)) > 0);

-- Drafts may contain unfinished Python. Executing source still requires API validation.
alter table public.robot_projects alter column program_ir drop not null;
alter table public.project_revisions alter column program_ir drop not null;

create function public.save_project_version(target_project_id uuid, version_name text,
  snapshot_source_type public.project_source_type, snapshot_source text, snapshot_workspace jsonb, snapshot_program jsonb)
returns public.project_revisions
language plpgsql security invoker set search_path = '' as $$
declare
  project public.robot_projects;
  revision public.project_revisions;
begin
  if version_name is null or char_length(btrim(version_name)) not between 1 and 120 then
    raise exception 'Enter a name between 1 and 120 characters.';
  end if;
  select * into project from public.robot_projects
    where id = target_project_id and owner_id = (select auth.uid()) for update;
  if not found then raise exception 'Project not found or access denied.'; end if;
  insert into public.project_revisions
    (project_id, name, revision_number, source_type, dsl_source, blockly_workspace, program_ir, created_by)
    values (project.id, btrim(version_name), project.current_revision + 1, snapshot_source_type,
      snapshot_source, snapshot_workspace, snapshot_program, auth.uid()) returning * into revision;
  update public.robot_projects set current_revision = revision.revision_number where id = project.id;
  return revision;
end;
$$;
revoke all on function public.save_project_version(uuid, text, public.project_source_type, text, jsonb, jsonb) from public, anon;
grant execute on function public.save_project_version(uuid, text, public.project_source_type, text, jsonb, jsonb) to authenticated;
