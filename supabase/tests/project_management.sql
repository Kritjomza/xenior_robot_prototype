begin;
select plan(1);
insert into auth.users(id, email) values
  ('10000000-0000-4000-8000-000000000001', 'project-management-test-1@example.invalid'),
  ('10000000-0000-4000-8000-000000000002', 'project-management-test-2@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into public.robot_projects(id, owner_id, name, source_type, dsl_source, program_ir) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Project management SQL test', 'dsl', 'home(', null);

-- Named versions keep the caller's source even if another tab has since saved a draft.
select public.save_project_version('20000000-0000-4000-8000-000000000001', ' First pass ', 'dsl', 'wait(1)', null, null);
do $$ begin
  assert (select name = 'First pass' and dsl_source = 'wait(1)' and program_ir is null and revision_number = 1 from public.project_revisions where project_id = '20000000-0000-4000-8000-000000000001'), 'Named source snapshot was not preserved';
  assert (select current_revision = 1 from public.robot_projects where id = '20000000-0000-4000-8000-000000000001'), 'Version counter was not updated';
end $$;
update public.project_revisions set name = 'Calibrated' where project_id = '20000000-0000-4000-8000-000000000001';
delete from public.project_revisions where project_id = '20000000-0000-4000-8000-000000000001';
select public.save_project_version('20000000-0000-4000-8000-000000000001', 'Second pass', 'dsl', '', null, null);
do $$ begin
  assert (select revision_number = 2 and dsl_source = '' from public.project_revisions where project_id = '20000000-0000-4000-8000-000000000001'), 'Deleted version number was reused';
  begin
    perform public.save_project_version('20000000-0000-4000-8000-000000000001', ' ', 'dsl', '', null, null);
    raise exception 'Expected name validation' using errcode = 'XX000';
  exception when raise_exception then null;
  end;
  begin
    perform public.save_project_version('20000000-0000-4000-8000-000000000001', 'Invalid source', 'dsl', null, null, null);
    raise exception 'Expected source validation' using errcode = 'XX000';
  exception when check_violation then null;
  end;
  assert (select current_revision = 2 from public.robot_projects where id = '20000000-0000-4000-8000-000000000001'), 'Failed snapshot changed counter';
end $$;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
do $$ begin
  assert (select count(*) = 0 from public.robot_projects where id = '20000000-0000-4000-8000-000000000001'), 'Another user can read the project';
  assert (select count(*) = 0 from public.project_revisions where project_id = '20000000-0000-4000-8000-000000000001'), 'Another user can read versions';
  begin
    perform public.save_project_version('20000000-0000-4000-8000-000000000001', 'Stolen', 'dsl', '', null, null);
    raise exception 'Expected ownership validation' using errcode = 'XX000';
  exception when raise_exception then null;
  end;
  update public.project_revisions set name = 'Stolen' where project_id = '20000000-0000-4000-8000-000000000001';
  delete from public.robot_projects where id = '20000000-0000-4000-8000-000000000001';
end $$;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
do $$ begin
  assert (select name = 'Second pass' from public.project_revisions where project_id = '20000000-0000-4000-8000-000000000001'), 'Another user changed a version';
end $$;
delete from public.robot_projects where id = '20000000-0000-4000-8000-000000000001';
do $$ begin
  assert (select count(*) = 0 from public.project_revisions where project_id = '20000000-0000-4000-8000-000000000001'), 'Project deletion did not remove versions';
end $$;
reset role;
select pass('Named project versions preserve source, counters, ownership and deletion semantics');
select * from finish();
rollback;
