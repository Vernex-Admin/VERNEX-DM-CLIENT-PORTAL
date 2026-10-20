-- Vernex Hub: 08 tenant integrity (hardening)
-- Run after 07. Safe to run again.
--
-- Why: the row-level security policies check each row's own client_id, but not that the rows it
-- points to belong to the same client. Staff who look after two clients could, by a crafted
-- request, put a milestone or deliverable of client A under a project of client B (the screens
-- never do this). These triggers make the database refuse it.
--
-- NOT yet run against a live database by the build tool: run it on a copy first, then run
-- docs/LAUNCH_TEST.md section 7 (publish and approve) before relying on it.

begin;

create or replace function public.enforce_same_client()
returns trigger language plpgsql set search_path = '' as $$
declare
  owner uuid;
begin
  if tg_table_name = 'milestones' then
    select client_id into owner from public.projects where id = new.project_id;

  elsif tg_table_name = 'deliverables' then
    select client_id into owner from public.projects where id = new.project_id;
    if new.milestone_id is not null and not exists (
      select 1 from public.milestones m where m.id = new.milestone_id and m.client_id = new.client_id
    ) then
      raise exception 'That milestone belongs to a different client.' using errcode = 'P0001';
    end if;

  elsif tg_table_name in ('deliverable_versions', 'revisions', 'revision_grants') then
    select client_id into owner from public.deliverables where id = new.deliverable_id;

  elsif tg_table_name = 'comments' then
    owner := case new.target_type
      when 'deliverable' then (select client_id from public.deliverables where id = new.target_id)
      when 'project' then (select client_id from public.projects where id = new.target_id)
      when 'file' then (select client_id from public.files where id = new.target_id)
      when 'service_request' then (select client_id from public.service_requests where id = new.target_id)
    end;
  end if;

  if owner is distinct from new.client_id then
    raise exception 'That item belongs to a different client.' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists milestones_same_client on public.milestones;
create trigger milestones_same_client
  before insert or update of client_id, project_id on public.milestones
  for each row execute function public.enforce_same_client();

drop trigger if exists deliverables_same_client on public.deliverables;
create trigger deliverables_same_client
  before insert or update of client_id, project_id, milestone_id on public.deliverables
  for each row execute function public.enforce_same_client();

drop trigger if exists versions_same_client on public.deliverable_versions;
create trigger versions_same_client
  before insert or update of client_id, deliverable_id on public.deliverable_versions
  for each row execute function public.enforce_same_client();

drop trigger if exists revisions_same_client on public.revisions;
create trigger revisions_same_client
  before insert or update of client_id, deliverable_id on public.revisions
  for each row execute function public.enforce_same_client();

drop trigger if exists grants_same_client on public.revision_grants;
create trigger grants_same_client
  before insert or update of client_id, deliverable_id on public.revision_grants
  for each row execute function public.enforce_same_client();

drop trigger if exists comments_same_client on public.comments;
create trigger comments_same_client
  before insert or update of client_id, target_type, target_id on public.comments
  for each row execute function public.enforce_same_client();

commit;
