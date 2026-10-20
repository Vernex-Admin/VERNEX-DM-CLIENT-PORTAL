-- Vernex Hub: 03 functions (actions with rules the database must enforce)
-- Run after 02_security.sql. The app calls these with supabase.rpc('<name>', { ... }).
-- Each one checks who is calling, so a client cannot do a staff action by calling it directly.

begin;

-- Shared error helper: raises a message the app can show as-is.
create or replace function public.fail(msg text)
returns void language plpgsql as $$
begin
  raise exception '%', msg using errcode = 'P0001';
end $$;

-- ---------------------------------------------------------------------------
-- Clients
-- ---------------------------------------------------------------------------

-- Turns "AGK Fitness & Gym" into a unique "agk-fitness-gym".
create or replace function public.unique_client_slug(p_name text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  base text := trim(both '-' from regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '-', 'g'));
  candidate text;
  n int := 1;
begin
  if base = '' then base := 'client'; end if;
  candidate := base;
  while exists (select 1 from public.clients where slug = candidate) loop
    n := n + 1;
    candidate := base || '-' || n;
  end loop;
  return candidate;
end $$;

-- Staff create a client. A PM is made account lead of what they create, so they can see it.
-- p_client: {"name": "...", "industry": "...", "city": "...", "gstin": "...", "billing_email": "...",
--            "retainer_minor": 1500000, "retainer_months": 6, "logo_url": "...", "service_type": "social"}
create or replace function public.create_client(p_client jsonb)
returns public.clients language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles;
  c public.clients;
begin
  select * into me from public.profiles where user_id = auth.uid() and is_active;
  if me.id is null or me.role not in ('vernex_founder', 'vernex_pm') then
    perform public.fail('Only Vernex staff can create clients.');
  end if;
  if coalesce(trim(p_client->>'name'), '') = '' then
    perform public.fail('Give the client a name.');
  end if;

  insert into public.clients (name, slug, logo_url, industry, city, gstin, billing_email,
                              retainer_minor, retainer_months, service_type)
  values (trim(p_client->>'name'),
          public.unique_client_slug(coalesce(nullif(p_client->>'slug', ''), p_client->>'name')),
          nullif(p_client->>'logo_url', ''), nullif(p_client->>'industry', ''), nullif(p_client->>'city', ''),
          nullif(p_client->>'gstin', ''), nullif(p_client->>'billing_email', ''),
          (p_client->>'retainer_minor')::bigint, (p_client->>'retainer_months')::int,
          nullif(p_client->>'service_type', ''))
  returning * into c;

  if me.role = 'vernex_pm' then
    insert into public.client_assignments (client_id, user_id, is_account_lead) values (c.id, me.id, true);
  end if;
  return c;
end $$;

-- Pipeline: a Closed Won lead becomes a client.
create or replace function public.convert_lead_to_client(p_lead_id uuid)
returns public.clients language plpgsql security definer set search_path = '' as $$
declare
  l public.leads;
  c public.clients;
begin
  if not public.is_staff() then perform public.fail('Only Vernex staff can convert leads.'); end if;
  select * into l from public.leads where id = p_lead_id for update;
  if l.id is null then perform public.fail('Lead not found.'); end if;
  if l.stage <> 'closed_won' then perform public.fail('Only a Closed Won lead can become a client.'); end if;
  if l.converted_client_id is not null then perform public.fail('This lead is already a client.'); end if;

  c := public.create_client(jsonb_build_object(
    'name', l.company, 'industry', l.industry, 'city', l.city, 'billing_email', l.email));

  update public.leads set converted_client_id = c.id where id = l.id;
  insert into public.lead_activity (lead_id, kind, text, by)
  values (l.id, 'converted', 'Converted to client ' || c.name, public.current_profile_id());
  return c;
end $$;

-- One account lead per client.
create or replace function public.set_account_lead(p_client_id uuid, p_user_id uuid)
returns public.client_assignments language plpgsql security definer set search_path = '' as $$
declare
  a public.client_assignments;
begin
  if not (public.is_staff() and p_client_id in (select public.my_client_ids())) then
    perform public.fail('You cannot change this client''s account lead.');
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id and role in ('vernex_founder', 'vernex_pm')) then
    perform public.fail('The account lead must be a Vernex staff member.');
  end if;
  update public.client_assignments set is_account_lead = false where client_id = p_client_id;
  insert into public.client_assignments (client_id, user_id, is_account_lead)
  values (p_client_id, p_user_id, true)
  on conflict (client_id, user_id) do update set is_account_lead = true
  returning * into a;
  return a;
end $$;

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------

-- The signed-in user edits their own name, WhatsApp number and notification choices.
create or replace function public.update_me(
  p_full_name text default null,
  p_phone_e164 text default null,
  p_notification_prefs jsonb default null
)
returns public.profiles language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles;
begin
  if p_full_name is not null and trim(p_full_name) = '' then
    perform public.fail('Your name cannot be empty.');
  end if;
  update public.profiles
     set full_name          = coalesce(trim(p_full_name), full_name),
         phone_e164         = coalesce(p_phone_e164, phone_e164),
         notification_prefs = coalesce(p_notification_prefs, notification_prefs)
   where user_id = auth.uid() and is_active
  returning * into p;
  if p.id is null then perform public.fail('Sign in again.'); end if;
  return p;
end $$;

-- ---------------------------------------------------------------------------
-- Deliverables: publish, approve, request changes, bonus revisions
-- ---------------------------------------------------------------------------

-- Staff add a new version. If the deliverable is client-visible it goes to the client for review.
create or replace function public.publish_version(
  p_deliverable_id uuid,
  p_preview_kind text,
  p_preview_url text,
  p_visibility text default null
)
returns public.deliverables language plpgsql security definer set search_path = '' as $$
declare
  d public.deliverables;
  v int;
begin
  select * into d from public.deliverables where id = p_deliverable_id for update;
  if d.id is null or not (public.is_staff() and d.client_id in (select public.my_client_ids())) then
    perform public.fail('Deliverable not found.');
  end if;
  if coalesce(trim(p_preview_url), '') = '' then perform public.fail('Add a file or a Google Drive link.'); end if;

  select coalesce(max(version), 0) + 1 into v from public.deliverable_versions where deliverable_id = d.id;
  insert into public.deliverable_versions (deliverable_id, client_id, version, preview_kind, preview_url)
  values (d.id, d.client_id, v, p_preview_kind, trim(p_preview_url));

  update public.deliverables
     set current_version = v,
         visibility = coalesce(p_visibility, visibility)
   where id = d.id
  returning * into d;

  if d.visibility = 'client' then
    update public.revisions set status = 'delivered', delivered_at = now()
     where deliverable_id = d.id and status not in ('delivered', 'rejected_out_of_scope');
    update public.action_items set resolved_at = now()
     where ref_type = 'deliverable' and ref_id = d.id and resolved_at is null;
    insert into public.action_items (client_id, project_id, type, title, ref_type, ref_id, due_at)
    values (d.client_id, d.project_id, 'approval', 'Review ' || d.title || ' (version ' || v || ')',
            'deliverable', d.id, case when d.due_date is not null then (d.due_date + time '12:00') at time zone 'UTC' end);
    update public.deliverables set status = 'in_review' where id = d.id returning * into d;
  elsif d.status = 'draft' then
    update public.deliverables set status = 'in_progress' where id = d.id returning * into d;
  end if;
  return d;
end $$;

-- A client approver approves work that is in review.
create or replace function public.approve_deliverable(p_deliverable_id uuid)
returns public.deliverables language plpgsql security definer set search_path = '' as $$
declare
  d public.deliverables;
begin
  select * into d from public.deliverables where id = p_deliverable_id for update;
  if d.id is null or d.visibility <> 'client' or d.client_id not in (select public.my_client_ids()) then
    perform public.fail('Deliverable not found.');
  end if;
  if not public.can_approve_work() then
    perform public.fail('Your admin approves this.');
  end if;
  if d.status <> 'in_review' then
    perform public.fail('Only a deliverable that is in review can be approved.');
  end if;

  update public.deliverables
     set status = 'approved', approved_by = public.current_profile_id(), approved_at = now(), approved_via = 'portal'
   where id = d.id
  returning * into d;
  update public.action_items set resolved_at = now()
   where ref_type = 'deliverable' and ref_id = d.id and resolved_at is null;
  return d;
end $$;

-- A client approver asks for changes. Counts one revision; refuses at the limit.
create or replace function public.request_revision(
  p_deliverable_id uuid,
  p_description text,
  p_revision_type text default 'other',
  p_priority text default 'normal',
  p_attachment_names text[] default '{}',
  p_idempotency_key text default null
)
returns public.revisions language plpgsql security definer set search_path = '' as $$
declare
  d public.deliverables;
  r public.revisions;
begin
  if p_idempotency_key is not null then
    select * into r from public.revisions where idempotency_key = p_idempotency_key;
    if r.id is not null then return r; end if;
  end if;

  select * into d from public.deliverables where id = p_deliverable_id for update;
  if d.id is null or d.visibility <> 'client' or d.client_id not in (select public.my_client_ids()) then
    perform public.fail('Deliverable not found.');
  end if;
  if not public.can_approve_work() then
    perform public.fail('Your admin approves this.');
  end if;
  if d.status <> 'in_review' then
    perform public.fail('Changes can only be requested on a deliverable that is in review.');
  end if;
  if length(trim(coalesce(p_description, ''))) < 20 then
    perform public.fail('Describe the change in at least 20 characters.');
  end if;
  if d.revisions_used >= d.revision_limit then
    perform public.fail('No revisions are left on this deliverable. Submit a service request for further changes.');
  end if;

  insert into public.revisions (deliverable_id, client_id, revision_number, on_version, revision_type, description,
                                attachment_names, priority, requested_by, idempotency_key)
  values (d.id, d.client_id,
          (select coalesce(max(revision_number), 0) + 1 from public.revisions where deliverable_id = d.id),
          d.current_version, coalesce(p_revision_type, 'other'), trim(p_description),
          coalesce(p_attachment_names, '{}'), coalesce(p_priority, 'normal'),
          public.current_profile_id(), p_idempotency_key)
  returning * into r;

  update public.deliverables set revisions_used = revisions_used + 1, status = 'revision_requested' where id = d.id;
  update public.action_items set resolved_at = now()
   where ref_type = 'deliverable' and ref_id = d.id and resolved_at is null;
  return r;
end $$;

-- Staff give one extra free revision, always with a reason the client can see.
create or replace function public.grant_bonus_revision(p_deliverable_id uuid, p_reason text)
returns public.deliverables language plpgsql security definer set search_path = '' as $$
declare
  d public.deliverables;
begin
  select * into d from public.deliverables where id = p_deliverable_id for update;
  if d.id is null or not (public.is_staff() and d.client_id in (select public.my_client_ids())) then
    perform public.fail('Deliverable not found.');
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    perform public.fail('Give a reason for the bonus revision.');
  end if;
  update public.deliverables set revision_limit = revision_limit + 1 where id = d.id returning * into d;
  insert into public.revision_grants (deliverable_id, client_id, reason, granted_by)
  values (d.id, d.client_id, trim(p_reason), public.current_profile_id());
  return d;
end $$;

-- Staff reorder a project's milestones: pass the ids in the new order.
create or replace function public.reorder_milestones(p_project_id uuid, p_ordered_ids uuid[])
returns setof public.milestones language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.projects p
                  where p.id = p_project_id and public.is_staff() and p.client_id in (select public.my_client_ids())) then
    perform public.fail('Project not found.');
  end if;
  update public.milestones m
     set position = o.ord - 1
    from unnest(p_ordered_ids) with ordinality as o(id, ord)
   where m.id = o.id and m.project_id = p_project_id;
  return query select * from public.milestones where project_id = p_project_id order by position;
end $$;

-- ---------------------------------------------------------------------------
-- Onboarding (playbook)
-- ---------------------------------------------------------------------------

-- Staff build a client's checklist from the master list. Replaces any existing checklist.
-- p_service: 'social', 'website' or 'both'.
create or replace function public.generate_onboarding(p_client_id uuid, p_service text)
returns setof public.onboarding_items language plpgsql security definer set search_path = '' as $$
begin
  if not (public.is_staff() and p_client_id in (select public.my_client_ids())) then
    perform public.fail('Client not found.');
  end if;
  if p_service not in ('social', 'website', 'both') then
    perform public.fail('Choose social, website or both.');
  end if;

  update public.clients set service_type = p_service where id = p_client_id;
  delete from public.onboarding_items where client_id = p_client_id;
  insert into public.onboarding_items (client_id, service, stage, title, owner, position, due_date)
  select p_client_id, t.service, t.stage, t.title, t.owner,
         row_number() over (order by case t.service when 'common' then 0 when 'social' then 1 else 2 end, t.position),
         current_date + t.due_offset_days
    from public.onboarding_item_templates t
   where t.service = 'common'
      or t.service = p_service
      or (p_service = 'both' and t.service in ('social', 'website'));

  return query select * from public.onboarding_items where client_id = p_client_id order by position;
end $$;

-- A client user saves the first-login setup form and ticks their checklist items.
create or replace function public.submit_onboarding(p_answers jsonb, p_done_item_ids uuid[] default '{}')
returns public.clients language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles;
  c public.clients;
begin
  select * into me from public.profiles where user_id = auth.uid() and is_active;
  if me.id is null or me.client_id is null then
    perform public.fail('Only a client user can submit the setup form.');
  end if;
  update public.clients set onboarding_answers = p_answers where id = me.client_id returning * into c;
  update public.onboarding_items
     set status = 'done', completed_at = now()
   where client_id = me.client_id and owner = 'client' and id = any (coalesce(p_done_item_ids, '{}'))
     and status <> 'done';
  return c;
end $$;

-- The two playbook gates: work starts only after both are true.
create or replace function public.onboarding_gates(p_client_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when p_client_id in (select public.my_client_ids()) then jsonb_build_object(
    'agreement_signed', exists (select 1 from public.documents
                                 where client_id = p_client_id and kind = 'agreement' and status = 'signed'),
    'first_invoice_paid', exists (select 1 from public.invoices
                                   where client_id = p_client_id and status = 'paid')
  ) end
$$;

-- ---------------------------------------------------------------------------
-- Who may call what
-- ---------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.current_profile_id(), public.current_user_role(), public.is_staff(), public.is_founder(),
  public.my_client_ids(), public.can_approve_work(),
  public.create_client(jsonb), public.convert_lead_to_client(uuid), public.set_account_lead(uuid, uuid),
  public.update_me(text, text, jsonb),
  public.publish_version(uuid, text, text, text), public.approve_deliverable(uuid),
  public.request_revision(uuid, text, text, text, text[], text), public.grant_bonus_revision(uuid, text),
  public.reorder_milestones(uuid, uuid[]),
  public.generate_onboarding(uuid, text), public.submit_onboarding(jsonb, uuid[]), public.onboarding_gates(uuid)
to authenticated;

commit;
