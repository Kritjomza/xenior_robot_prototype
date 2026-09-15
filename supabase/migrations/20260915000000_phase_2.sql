create type public.project_source_format as enum ('dsl', 'blockly');
create type public.robot_adapter as enum ('mock', 'robodk');
create type public.robot_run_status as enum ('queued', 'running', 'completed', 'stopped', 'faulted');

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text check (display_name is null or char_length(display_name) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.robot_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  source_format public.project_source_format not null default 'dsl',
  editable_source text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index robot_projects_owner_name_idx
  on public.robot_projects (owner_id, lower(btrim(name)));
create index robot_projects_owner_id_idx on public.robot_projects (owner_id);

create table public.project_revisions (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.robot_projects(id) on delete cascade,
  revision_number integer not null check (revision_number > 0),
  source_format public.project_source_format not null,
  editable_source text not null,
  program jsonb not null check (jsonb_typeof(program) = 'object'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (project_id, revision_number),
  unique (project_id, id)
);

create index project_revisions_project_id_idx on public.project_revisions (project_id);

create table public.robot_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.robot_projects(id) on delete cascade,
  revision_id bigint,
  adapter public.robot_adapter not null default 'mock',
  status public.robot_run_status not null default 'queued',
  summary jsonb not null default '{}'::jsonb check (jsonb_typeof(summary) = 'object'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  constraint robot_runs_revision_fk foreign key (project_id, revision_id)
    references public.project_revisions(project_id, id),
  constraint robot_runs_time_order check (finished_at is null or started_at is null or finished_at >= started_at)
);

create index robot_runs_project_id_idx on public.robot_runs (project_id);
create index robot_runs_created_at_idx on public.robot_runs (created_at desc);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create function public.prevent_project_ownership_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'project ownership is immutable';
  end if;
  return new;
end;
$$;

create function public.prevent_child_project_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.project_id is distinct from old.project_id then
    raise exception 'project association is immutable';
  end if;
  return new;
end;
$$;

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, email, display_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'display_name');
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger robot_projects_set_updated_at
before update on public.robot_projects
for each row execute function public.set_updated_at();

create trigger preserve_robot_project_owner
before update on public.robot_projects
for each row execute function public.prevent_project_ownership_change();

create trigger preserve_project_revision_ownership
before update on public.project_revisions
for each row execute function public.prevent_child_project_change();

create trigger preserve_robot_run_ownership
before update on public.robot_runs
for each row execute function public.prevent_child_project_change();

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.robot_projects enable row level security;
alter table public.project_revisions enable row level security;
alter table public.robot_runs enable row level security;

create policy "users read own profile" on public.profiles
for select to authenticated
using ((select auth.uid()) = user_id);

create policy "users update own profile" on public.profiles
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "owners read projects" on public.robot_projects
for select to authenticated
using ((select auth.uid()) = owner_id);

create policy "owners insert projects" on public.robot_projects
for insert to authenticated
with check ((select auth.uid()) = owner_id);

create policy "owners update projects" on public.robot_projects
for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy "owners delete projects" on public.robot_projects
for delete to authenticated
using ((select auth.uid()) = owner_id);

create policy "owners read revisions" on public.project_revisions
for select to authenticated
using (exists (
  select 1 from public.robot_projects project
  where project.id = project_revisions.project_id
    and project.owner_id = (select auth.uid())
));

create policy "owners insert revisions" on public.project_revisions
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1 from public.robot_projects project
    where project.id = project_revisions.project_id
      and project.owner_id = (select auth.uid())
  )
);

create policy "owners read runs" on public.robot_runs
for select to authenticated
using (exists (
  select 1 from public.robot_projects project
  where project.id = robot_runs.project_id
    and project.owner_id = (select auth.uid())
));

create policy "owners insert runs" on public.robot_runs
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1 from public.robot_projects project
    where project.id = robot_runs.project_id
      and project.owner_id = (select auth.uid())
  )
);

create policy "owners update runs" on public.robot_runs
for update to authenticated
using (exists (
  select 1 from public.robot_projects project
  where project.id = robot_runs.project_id
    and project.owner_id = (select auth.uid())
))
with check (
  created_by = (select auth.uid())
  and exists (
    select 1 from public.robot_projects project
    where project.id = robot_runs.project_id
      and project.owner_id = (select auth.uid())
  )
);

revoke all privileges on table
  public.profiles,
  public.robot_projects,
  public.project_revisions,
  public.robot_runs
from anon, authenticated;
revoke all privileges on sequence public.project_revisions_id_seq from anon, authenticated;

grant usage on schema public to authenticated;
grant select, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.robot_projects to authenticated;
grant select, insert on table public.project_revisions to authenticated;
grant select, insert, update on table public.robot_runs to authenticated;
grant usage, select on sequence public.project_revisions_id_seq to authenticated;

revoke all on function public.prevent_project_ownership_change() from public, anon, authenticated;
revoke all on function public.prevent_child_project_change() from public, anon, authenticated;
