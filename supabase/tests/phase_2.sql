begin;
select plan(37);

select has_table('public', 'profiles');
select has_table('public', 'robot_projects');
select has_table('public', 'project_revisions');
select has_table('public', 'robot_runs');

select results_eq(
  $$ select relrowsecurity from pg_class where relname = 'robot_projects' $$,
  array[true], 'robot_projects enables RLS'
);
select results_eq(
  $$ select relrowsecurity from pg_class where relname = 'profiles' $$,
  array[true], 'profiles enables RLS'
);
select results_eq(
  $$ select relrowsecurity from pg_class where relname = 'project_revisions' $$,
  array[true], 'project_revisions enables RLS'
);
select results_eq(
  $$ select relrowsecurity from pg_class where relname = 'robot_runs' $$,
  array[true], 'robot_runs enables RLS'
);

select policies_are('public', 'profiles', array['profiles_select', 'profiles_update']);
select policies_are('public', 'robot_projects', array[
  'projects_all'
]);
select policies_are('public', 'project_revisions', array[
  'revisions_delete', 'revisions_insert', 'revisions_select', 'revisions_update'
]);
select policies_are('public', 'robot_runs', array[
  'runs_all'
]);

select table_privs_are('authenticated', 'public', 'profiles', array['SELECT', 'UPDATE']);
select table_privs_are('authenticated', 'public', 'robot_projects', array['DELETE', 'INSERT', 'SELECT', 'UPDATE']);
select table_privs_are('authenticated', 'public', 'project_revisions', array['DELETE', 'INSERT', 'SELECT', 'UPDATE']);
select table_privs_are('authenticated', 'public', 'robot_runs', array['DELETE', 'INSERT', 'SELECT', 'UPDATE']);

-- Exact empty anon grants and exact authenticated grants cover both Supabase projects whose
-- default privileges auto-expose new tables and projects whose defaults grant nothing.
select table_privs_are('anon', 'public', 'profiles', array[]::text[]);
select table_privs_are('anon', 'public', 'robot_projects', array[]::text[]);
select table_privs_are('anon', 'public', 'project_revisions', array[]::text[]);
select table_privs_are('anon', 'public', 'robot_runs', array[]::text[]);
select has_column('public', 'robot_projects', 'owner_id');
select col_not_null('public', 'robot_projects', 'owner_id');
select has_column('public', 'project_revisions', 'project_id');
select has_column('public', 'robot_runs', 'project_id');
select has_index('public', 'robot_projects', 'robot_projects_owner_name_idx');
select has_index('public', 'project_revisions', 'project_revisions_project_idx');
select has_index('public', 'robot_runs', 'robot_runs_user_started_idx');
select has_trigger('public', 'robot_projects', 'projects_owner_immutable');
select has_trigger('public', 'project_revisions', 'revisions_owner_immutable');
select has_trigger('auth', 'users', 'auth_user_profile');
select has_function('public', 'set_updated_at', array[]::text[]);
select has_function('public', 'handle_new_user', array[]::text[]);
select has_function('public', 'reject_owner_change', array[]::text[]);

select is(
  (select count(*) from pg_policies
    where schemaname = 'public' and cmd = 'UPDATE'
      and qual is not null and with_check is not null),
  3::bigint,
  'every authenticated update policy has USING and WITH CHECK predicates'
);
select ok(
  (select count(*) >= 5 from pg_constraint constraint_record
    join pg_class relation on relation.oid = constraint_record.conrelid
    join pg_namespace namespace_record on namespace_record.oid = relation.relnamespace
    where namespace_record.nspname = 'public'
      and relation.relname in ('profiles', 'robot_projects', 'project_revisions', 'robot_runs')
      and constraint_record.contype = 'c'),
  'domain tables keep their check constraints'
);

create temporary table project_ownership_probe (owner_id uuid not null);
create trigger preserve_owner_probe before update on project_ownership_probe
for each row execute function public.reject_owner_change();
insert into project_ownership_probe values ('11111111-1111-4111-8111-111111111111');
select throws_ok(
  $$ update project_ownership_probe set owner_id = '22222222-2222-4222-8222-222222222222' $$,
  'P0001', 'owner_id is immutable',
  'project ownership trigger rejects reassignment'
);

create temporary table child_ownership_probe (project_id uuid not null);
create trigger preserve_child_probe before update on child_ownership_probe
for each row execute function public.reject_child_owner_change();
insert into child_ownership_probe values ('11111111-1111-4111-8111-111111111111');
select throws_ok(
  $$ update child_ownership_probe set project_id = '22222222-2222-4222-8222-222222222222' $$,
  'P0001', 'child ownership is immutable',
  'child ownership trigger rejects project reassignment'
);

select * from finish();
rollback;
