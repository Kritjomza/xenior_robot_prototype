begin;
select plan(34);

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

select policies_are('public', 'profiles', array['users read own profile', 'users update own profile']);
select policies_are('public', 'robot_projects', array[
  'owners delete projects', 'owners insert projects', 'owners read projects', 'owners update projects'
]);
select policies_are('public', 'project_revisions', array[
  'owners insert revisions', 'owners read revisions'
]);
select policies_are('public', 'robot_runs', array[
  'owners insert runs', 'owners read runs', 'owners update runs'
]);

select table_privs_are('authenticated', 'public', 'profiles', array['SELECT', 'UPDATE']);
select table_privs_are('authenticated', 'public', 'robot_projects', array['DELETE', 'INSERT', 'SELECT', 'UPDATE']);
select table_privs_are('authenticated', 'public', 'project_revisions', array['INSERT', 'SELECT']);
select table_privs_are('authenticated', 'public', 'robot_runs', array['INSERT', 'SELECT', 'UPDATE']);

select has_column('public', 'robot_projects', 'owner_id');
select col_not_null('public', 'robot_projects', 'owner_id');
select has_column('public', 'project_revisions', 'project_id');
select has_column('public', 'robot_runs', 'project_id');
select has_index('public', 'robot_projects', 'robot_projects_owner_id_idx');
select has_index('public', 'project_revisions', 'project_revisions_project_id_idx');
select has_index('public', 'robot_runs', 'robot_runs_project_id_idx');
select has_trigger('public', 'robot_projects', 'preserve_robot_project_owner');
select has_trigger('public', 'project_revisions', 'preserve_project_revision_ownership');
select has_trigger('auth', 'users', 'on_auth_user_created');
select has_function('public', 'set_updated_at', array[]::text[]);
select has_function('public', 'handle_new_user', array[]::text[]);
select has_function('public', 'prevent_project_ownership_change', array[]::text[]);

select is(
  (select count(*) from pg_policies
    where schemaname = 'public' and cmd = 'UPDATE'
      and qual is not null and with_check is not null),
  3::bigint,
  'every authenticated update policy has USING and WITH CHECK predicates'
);
select ok(
  has_sequence_privilege('authenticated', 'public.project_revisions_id_seq', 'USAGE'),
  'authenticated can allocate revision identity values'
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
for each row execute function public.prevent_project_ownership_change();
insert into project_ownership_probe values ('11111111-1111-4111-8111-111111111111');
select throws_ok(
  $$ update project_ownership_probe set owner_id = '22222222-2222-4222-8222-222222222222' $$,
  'P0001', 'project ownership is immutable',
  'project ownership trigger rejects reassignment'
);

create temporary table child_ownership_probe (project_id uuid not null);
create trigger preserve_child_probe before update on child_ownership_probe
for each row execute function public.prevent_child_project_change();
insert into child_ownership_probe values ('11111111-1111-4111-8111-111111111111');
select throws_ok(
  $$ update child_ownership_probe set project_id = '22222222-2222-4222-8222-222222222222' $$,
  'P0001', 'project association is immutable',
  'child ownership trigger rejects project reassignment'
);

select * from finish();
rollback;
