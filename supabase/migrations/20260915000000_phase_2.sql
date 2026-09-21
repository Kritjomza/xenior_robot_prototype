create type public.project_source_type as enum ('blockly', 'dsl');
create type public.robot_adapter_type as enum ('mock', 'robodk');
create type public.robot_run_status as enum ('queued', 'running', 'completed', 'stopped', 'failed');

create table public.profiles (id uuid primary key references auth.users(id) on delete cascade, display_name text not null default '' check(char_length(display_name)<=100), avatar_url text check(avatar_url is null or avatar_url ~ '^https?://'), role text not null default 'student' check(role in ('student','instructor')), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.robot_projects (id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade, name varchar(120) not null check(char_length(btrim(name))>0), description text, source_type public.project_source_type not null, blockly_workspace jsonb, dsl_source text, program_ir jsonb not null check(jsonb_typeof(program_ir)='object'), schema_version integer not null default 1 check(schema_version>0), current_revision integer not null default 0 check(current_revision>=0), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), constraint source_matches_type check((source_type='dsl' and dsl_source is not null) or (source_type='blockly' and blockly_workspace is not null)));
create table public.project_revisions (id uuid primary key default gen_random_uuid(), project_id uuid not null references public.robot_projects(id) on delete cascade, revision_number integer not null check(revision_number>0), source_type public.project_source_type not null, blockly_workspace jsonb, dsl_source text, program_ir jsonb not null check(jsonb_typeof(program_ir)='object'), created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), unique(project_id,revision_number), check((source_type='dsl' and dsl_source is not null) or (source_type='blockly' and blockly_workspace is not null)));
create table public.robot_runs (id uuid primary key default gen_random_uuid(), project_id uuid references public.robot_projects(id) on delete set null, revision_id uuid references public.project_revisions(id) on delete set null, user_id uuid not null references auth.users(id) on delete cascade, adapter_type public.robot_adapter_type not null, status public.robot_run_status not null default 'queued', started_at timestamptz not null default now(), finished_at timestamptz, error_code text, error_message text, check(finished_at is null or finished_at>=started_at));
create unique index robot_projects_owner_name_idx on public.robot_projects(owner_id,lower(btrim(name)));
create index project_revisions_project_idx on public.project_revisions(project_id,revision_number desc);
create index robot_runs_user_started_idx on public.robot_runs(user_id,started_at desc);

create function public.set_updated_at() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now(); return new; end $$;
create function public.reject_owner_change() returns trigger language plpgsql set search_path='' as $$ begin if new.owner_id<>old.owner_id then raise exception 'owner_id is immutable'; end if; return new; end $$;
create function public.reject_child_owner_change() returns trigger language plpgsql set search_path='' as $$ begin if new.project_id is distinct from old.project_id or new.created_by is distinct from old.created_by then raise exception 'child ownership is immutable'; end if; return new; end $$;
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$ begin insert into public.profiles(id,display_name) values(new.id,substring(coalesce(new.raw_user_meta_data->>'display_name',new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name',''),1,100)) on conflict (id) do nothing; return new; end $$;
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger projects_updated before update on public.robot_projects for each row execute function public.set_updated_at();
create trigger projects_owner_immutable before update on public.robot_projects for each row execute function public.reject_owner_change();
create trigger revisions_owner_immutable before update on public.project_revisions for each row execute function public.reject_child_owner_change();
create trigger auth_user_profile after insert on auth.users for each row execute function public.handle_new_user();

alter table public.profiles enable row level security; alter table public.robot_projects enable row level security; alter table public.project_revisions enable row level security; alter table public.robot_runs enable row level security;
create policy profiles_select on public.profiles for select to authenticated using((select auth.uid())=id);
create policy profiles_update on public.profiles for update to authenticated using((select auth.uid())=id) with check((select auth.uid())=id);
create policy projects_all on public.robot_projects for all to authenticated using((select auth.uid())=owner_id) with check((select auth.uid())=owner_id);
create policy revisions_select on public.project_revisions for select to authenticated using(exists(select 1 from public.robot_projects p where p.id=project_id and p.owner_id=(select auth.uid())));
create policy revisions_insert on public.project_revisions for insert to authenticated with check(created_by=(select auth.uid()) and exists(select 1 from public.robot_projects p where p.id=project_id and p.owner_id=(select auth.uid())));
create policy revisions_update on public.project_revisions for update to authenticated using(created_by=(select auth.uid()) and exists(select 1 from public.robot_projects p where p.id=project_id and p.owner_id=(select auth.uid()))) with check(created_by=(select auth.uid()) and exists(select 1 from public.robot_projects p where p.id=project_id and p.owner_id=(select auth.uid())));
create policy revisions_delete on public.project_revisions for delete to authenticated using(exists(select 1 from public.robot_projects p where p.id=project_id and p.owner_id=(select auth.uid())));
create policy runs_all on public.robot_runs for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));

revoke all on public.profiles,public.robot_projects,public.project_revisions,public.robot_runs from anon,authenticated;
grant select,update on public.profiles to authenticated; grant select,insert,update,delete on public.robot_projects to authenticated; grant select,insert,update,delete on public.project_revisions to authenticated; grant select,insert,update,delete on public.robot_runs to authenticated;
revoke all on function public.handle_new_user(),public.reject_owner_change(),public.reject_child_owner_change(),public.set_updated_at() from public,anon,authenticated;
