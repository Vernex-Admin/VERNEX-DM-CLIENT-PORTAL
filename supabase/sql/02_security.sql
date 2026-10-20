-- Vernex Hub: 02 security (who can see and change what)
-- Run after 01_schema.sql.
--
-- Rules, matching CLAUDE.md and src/lib/permissions.ts:
--   * vernex_founder sees every client. vernex_pm sees only clients in client_assignments.
--   * Staff create, edit and delete clients, users, projects, milestones, deliverables, invoices.
--   * Client users see only their own client, and never internal items, drafts, leads or other clients.
--   * Clients may: comment, upload Brand Assets, submit service requests, use the Founder Box.
--     Approving and requesting revisions go through functions in 03_functions.sql.
--   * Founder Box messages are read by the founder and the sender only, never by PMs.
--   * Only invited emails can sign in: an email with no profile row is refused.

begin;

-- ---------------------------------------------------------------------------
-- Helper functions used by the policies. SECURITY DEFINER so they can read
-- profiles without tripping over profiles' own policies.
-- ---------------------------------------------------------------------------

create or replace function public.current_profile_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.profiles where user_id = auth.uid() and is_active
$$;

create or replace function public.current_user_role()
returns text language sql stable security definer set search_path = '' as $$
  select role from public.profiles where user_id = auth.uid() and is_active
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.current_user_role() in ('vernex_founder', 'vernex_pm'), false)
$$;

create or replace function public.is_founder()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.current_user_role() = 'vernex_founder', false)
$$;

create or replace function public.my_client_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  -- A client user: their own client.
  select p.client_id from public.profiles p
   where p.user_id = auth.uid() and p.is_active and p.client_id is not null
  union
  -- A PM: assigned clients.
  select ca.client_id from public.client_assignments ca
    join public.profiles p on p.id = ca.user_id
   where p.user_id = auth.uid() and p.is_active and p.role = 'vernex_pm'
  union
  -- The founder: everyone.
  select c.id from public.clients c where public.is_founder()
$$;

-- Can the signed-in user approve or request changes for their client?
create or replace function public.can_approve_work()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select p.role = 'client_admin' or (p.role = 'client_member' and p.can_approve)
      from public.profiles p where p.user_id = auth.uid() and p.is_active
  ), false)
$$;

-- ---------------------------------------------------------------------------
-- Invite-only sign-in. When Supabase Auth creates a user (magic link or Google),
-- link it to the profile with the same email. No profile = sign-in refused.
-- ---------------------------------------------------------------------------

create or replace function public.link_auth_user_to_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles
     set user_id = new.id
   where lower(email) = lower(new.email) and user_id is null and is_active;
  if not found then
    raise exception 'This email has not been invited to Vernex Hub. Ask Vernex to add you.';
  end if;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.link_auth_user_to_profile();

-- When staff add a profile for someone who already has a login (for example after
-- being removed and re-added), link it straight away.
create or replace function public.link_profile_to_existing_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.user_id is null then
    select u.id into new.user_id from auth.users u where lower(u.email) = lower(new.email) limit 1;
  end if;
  new.email := lower(trim(new.email));
  return new;
end $$;

create trigger profiles_link_auth_user
  before insert on public.profiles
  for each row execute function public.link_profile_to_existing_auth_user();

-- ---------------------------------------------------------------------------
-- Invoice numbers: VX/26-27/0001, following the Indian financial year (April-March).
-- ---------------------------------------------------------------------------

create or replace function public.set_invoice_number()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  y int := extract(year from coalesce(new.issue_date, current_date))::int;
  m int := extract(month from coalesce(new.issue_date, current_date))::int;
  fy_start int := case when m >= 4 then y else y - 1 end;
begin
  if new.number is null or new.number = '' then
    new.number := 'VX/' || lpad((fy_start % 100)::text, 2, '0') || '-' || lpad(((fy_start + 1) % 100)::text, 2, '0')
                  || '/' || lpad(nextval('public.invoice_number_seq')::text, 4, '0');
  end if;
  return new;
end $$;

create trigger invoices_set_number
  before insert on public.invoices
  for each row execute function public.set_invoice_number();

-- ---------------------------------------------------------------------------
-- Row-level security: switch it on for every table.
-- ---------------------------------------------------------------------------

alter table public.clients                   enable row level security;
alter table public.profiles                  enable row level security;
alter table public.client_assignments        enable row level security;
alter table public.projects                  enable row level security;
alter table public.milestones                enable row level security;
alter table public.deliverables              enable row level security;
alter table public.deliverable_versions      enable row level security;
alter table public.revisions                 enable row level security;
alter table public.revision_grants           enable row level security;
alter table public.comments                  enable row level security;
alter table public.files                     enable row level security;
alter table public.service_requests          enable row level security;
alter table public.invoices                  enable row level security;
alter table public.invoice_items             enable row level security;
alter table public.action_items              enable row level security;
alter table public.feedback                  enable row level security;
alter table public.social_metrics_daily      enable row level security;
alter table public.social_posts              enable row level security;
alter table public.leads                     enable row level security;
alter table public.lead_activity             enable row level security;
alter table public.reminders                 enable row level security;
alter table public.ai_drafts                 enable row level security;
alter table public.onboarding_item_templates enable row level security;
alter table public.onboarding_items          enable row level security;
alter table public.documents                 enable row level security;
alter table public.message_templates         enable row level security;

-- clients: read your own; staff write. (New clients are created through create_client()
-- so a PM is assigned to what they create.)
create policy clients_read on public.clients for select to authenticated
  using (id in (select public.my_client_ids()));
create policy clients_staff_update on public.clients for update to authenticated
  using (public.is_staff() and id in (select public.my_client_ids()))
  with check (public.is_staff());
create policy clients_founder_delete on public.clients for delete to authenticated
  using (public.is_founder());

-- profiles: staff see staff and their clients' people; clients see their teammates
-- and the Vernex staff assigned to them (for the account-lead card).
create policy profiles_read on public.profiles for select to authenticated
  using (
    user_id = auth.uid()
    or (public.is_staff() and (client_id is null or client_id in (select public.my_client_ids())))
    or client_id in (select public.my_client_ids())
    or id in (select ca.user_id from public.client_assignments ca
               where ca.client_id in (select public.my_client_ids()))
  );
create policy profiles_staff_insert on public.profiles for insert to authenticated
  with check (
    public.is_staff()
    and (client_id in (select public.my_client_ids())
         or (client_id is null and public.is_founder()))
  );
create policy profiles_staff_update on public.profiles for update to authenticated
  using (public.is_staff() and (client_id in (select public.my_client_ids()) or public.is_founder()))
  with check (public.is_staff() and (client_id in (select public.my_client_ids()) or public.is_founder()));
create policy profiles_staff_delete on public.profiles for delete to authenticated
  using (public.is_staff() and (client_id in (select public.my_client_ids()) or public.is_founder())
         and id <> public.current_profile_id());

-- client_assignments
create policy assignments_read on public.client_assignments for select to authenticated
  using (client_id in (select public.my_client_ids()));
create policy assignments_staff_write on public.client_assignments for all to authenticated
  using (public.is_staff() and client_id in (select public.my_client_ids()))
  with check (public.is_staff() and client_id in (select public.my_client_ids()));

-- A reusable shape: read rows of your clients; staff write rows of their clients.
-- projects, milestones, social_metrics_daily, social_posts
create policy projects_read on public.projects for select to authenticated
  using (client_id in (select public.my_client_ids()));
create policy projects_staff_write on public.projects for all to authenticated
  using (public.is_staff() and client_id in (select public.my_client_ids()))
  with check (public.is_staff() and client_id in (select public.my_client_ids()));

create policy milestones_read on public.milestones for select to authenticated
  using (client_id in (select public.my_client_ids()));
create policy milestones_staff_write on public.milestones for all to authenticated
  using (public.is_staff() and client_id in (select public.my_client_ids()))
  with check (public.is_staff() and client_id in (select public.my_client_ids()));

create policy metrics_read on public.social_metrics_daily for select to authenticated
  using (client_id in (select public.my_client_ids()));
create policy metrics_staff_write on public.social_metrics_daily for all to authenticated
  using (public.is_staff() and client_id in (select public.my_client_ids()))
  with check (public.is_staff() and client_id in (select public.my_client_ids()));

create policy posts_read on public.social_posts for select to authenticated
  using (client_id in (select public.my_client_ids()));
create policy posts_staff_write on public.social_posts for all to authenticated
  using (public.is_staff() and client_id in (select public.my_client_ids()))
  with check (public.is_staff() and client_id in (select public.my_client_ids()));

-- deliverables: clients see only client-visible work. Clients never write directly;
-- approve_deliverable() and request_revision() do it for them.
create policy deliverables_read on public.deliverables for select to authenticated
  using (client_id in (select public.my_client_ids()) and (visibility = 'client' or public.is_staff()));
create policy deliverables_staff_write on public.deliverables for all to authenticated
  using (public.is_staff() and client_id in (select public.my_client_ids()))
  with check (public.is_staff() and client_id in (select public.my_client_ids()));

-- Versions, revisions and grants follow their deliverable's visibility.
create policy versions_read on public.deliverable_versions for select to authenticated
  using (deliverable_id in (select id from public.deliverables));
create policy versions_staff_write on public.deliverable_versions for all to authenticated
  using (public.is_staff() and client_id in (select public.my_client_ids()))
  with check (public.is_staff() and client_id in (select public.my_client_ids()));

create policy revisions_read on public.revisions for select to authenticated
  using (deliverable_id in (select id from public.deliverables));
create policy revisions_staff_update on public.revisions for update to authenticated
  using (public.is_staff() and client_id in (select public.my_client_ids()))
  with check (public.is_staff() and client_id in (select public.my_client_ids()));

create policy grants_read on public.revision_grants for select to authenticated
  using (deliverable_id in (select id from public.deliverables));

-- comments: internal comments are staff-only. Anyone on the client may add a
-- client-visible comment as themselves.
create policy comments_read on public.comments for select to authenticated
  using (client_id in (select public.my_client_ids()) and (visibility = 'client' or public.is_staff()));
create policy comments_insert on public.comments for insert to authenticated
  with check (
    client_id in (select public.my_client_ids())
    and author_id = public.current_profile_id()
    and (visibility = 'client' or public.is_staff())
  );
create policy comments_staff_delete on public.comments for delete to authenticated
  using (public.is_staff() and client_id in (select public.my_client_ids()));

-- files: clients see client-visible files; may add Brand Assets and remove their own.
create policy files_read on public.files for select to authenticated
  using (client_id in (select public.my_client_ids()) and (visibility = 'client' or public.is_staff()));
create policy files_insert on public.files for insert to authenticated
  with check (
    client_id in (select public.my_client_ids())
    and (public.is_staff()
         or (folder = 'brand_assets' and visibility = 'client' and uploaded_by = public.current_profile_id()))
  );
create policy files_staff_update on public.files for update to authenticated
  using (public.is_staff() and client_id in (select public.my_client_ids()))
  with check (public.is_staff() and client_id in (select public.my_client_ids()));
create policy files_delete on public.files for delete to authenticated
  using (
    client_id in (select public.my_client_ids())
    and (public.is_staff() or (folder = 'brand_assets' and uploaded_by = public.current_profile_id()))
  );

-- service_requests: clients submit; staff manage.
create policy requests_read on public.service_requests for select to authenticated
  using (client_id in (select public.my_client_ids()));
create policy requests_insert on public.service_requests for insert to authenticated
  with check (
    client_id in (select public.my_client_ids())
    and (public.is_staff() or (status = 'submitted' and requested_by = public.current_profile_id()))
  );
create policy requests_staff_update on public.service_requests for update to authenticated
  using (public.is_staff() and client_id in (select public.my_client_ids()))
  with check (public.is_staff() and client_id in (select public.my_client_ids()));
create policy requests_staff_delete on public.service_requests for delete to authenticated
  using (public.is_staff() and client_id in (select public.my_client_ids()));

-- invoices: clients never see drafts.
create policy invoices_read on public.invoices for select to authenticated
  using (client_id in (select public.my_client_ids()) and (status <> 'draft' or public.is_staff()));
create policy invoices_staff_write on public.invoices for all to authenticated
  using (public.is_staff() and client_id in (select public.my_client_ids()))
  with check (public.is_staff() and client_id in (select public.my_client_ids()));

create policy invoice_items_read on public.invoice_items for select to authenticated
  using (invoice_id in (select id from public.invoices));
create policy invoice_items_staff_write on public.invoice_items for all to authenticated
  using (public.is_staff() and invoice_id in (select id from public.invoices))
  with check (public.is_staff() and invoice_id in (select id from public.invoices));

-- action_items
create policy action_items_read on public.action_items for select to authenticated
  using (client_id in (select public.my_client_ids()));
create policy action_items_staff_write on public.action_items for all to authenticated
  using (public.is_staff() and client_id in (select public.my_client_ids()))
  with check (public.is_staff() and client_id in (select public.my_client_ids()));

-- feedback: Founder Box goes to the founder only. CSAT is visible to the client's staff.
create policy feedback_read on public.feedback for select to authenticated
  using (
    submitted_by = public.current_profile_id()
    or public.is_founder()
    or (kind = 'csat' and public.is_staff() and client_id in (select public.my_client_ids()))
  );
create policy feedback_insert on public.feedback for insert to authenticated
  with check (
    client_id in (select public.my_client_ids())
    and submitted_by = public.current_profile_id()
    and status = 'new' and reply is null
  );
create policy feedback_founder_update on public.feedback for update to authenticated
  using (public.is_founder()) with check (public.is_founder());

-- Staff-only tables: leads, lead_activity, reminders, ai_drafts, templates.
create policy leads_staff on public.leads for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy lead_activity_staff on public.lead_activity for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy reminders_staff on public.reminders for all to authenticated
  using (public.is_staff() and (client_id is null or client_id in (select public.my_client_ids())))
  with check (public.is_staff());
create policy ai_drafts_staff on public.ai_drafts for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy item_templates_staff on public.onboarding_item_templates for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy message_templates_staff on public.message_templates for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- onboarding_items: staff manage all; clients see only the items that are theirs to do.
-- Clients tick items through submit_onboarding().
create policy onboarding_items_read on public.onboarding_items for select to authenticated
  using (client_id in (select public.my_client_ids()) and (owner = 'client' or public.is_staff()));
create policy onboarding_items_staff_write on public.onboarding_items for all to authenticated
  using (public.is_staff() and client_id in (select public.my_client_ids()))
  with check (public.is_staff() and client_id in (select public.my_client_ids()));

-- documents: clients see proposals and agreements once sent, never drafts.
create policy documents_read on public.documents for select to authenticated
  using (client_id in (select public.my_client_ids()) and (status in ('sent', 'signed') or public.is_staff()));
create policy documents_staff_write on public.documents for all to authenticated
  using (public.is_staff() and client_id in (select public.my_client_ids()))
  with check (public.is_staff() and client_id in (select public.my_client_ids()));

-- ---------------------------------------------------------------------------
-- Signed-out visitors get nothing.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- Signed-in users may reach the tables; the policies above decide which rows.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

commit;
