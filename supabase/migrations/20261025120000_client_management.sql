-- Vernex Hub: Client Management.
--
--   * Client Codes. Every client gets VXC-1001, VXC-1002, ... from a sequence when it is created.
--     The code is unique and can never be changed or chosen by the caller.
--   * Login codes. A client's first person signs in with the Client Code; each further person with
--     the code and a number (VXC-1001-2). Only the client-credentials Edge Function (service role)
--     sets them, together with the Supabase Auth password and the private lookup hash.
--   * client_credentials keeps the current password of each client login so Vernex staff can read
--     it back. Nobody but the service role touches the table; staff read it only through
--     list_client_credentials(), which checks they are staff and the client is theirs.
--   * The client details form: clients.detail_fields (the questions; null = the app's standard
--     form), clients.details (the answers), submitted and locked timestamps. Clients write only
--     through save_client_details(), which refuses once Vernex has locked the details.
--
-- Apply after the earlier migrations with `supabase db push`, after confirming the target project.
-- Then deploy the Edge Functions: `supabase functions deploy client-credentials` and
-- `supabase functions deploy login-with-identifier`.

begin;

-- ---------------------------------------------------------------------------
-- 1. Client Codes
-- ---------------------------------------------------------------------------

create sequence if not exists public.client_code_seq start 1001;
-- Only the insert trigger draws numbers, so a caller cannot use one up and leave a gap.
revoke all on sequence public.client_code_seq from public, anon, authenticated;

alter table public.clients add column if not exists client_code text;

-- Existing clients get codes in the order they were created.
do $$
declare
  r record;
begin
  for r in select id from public.clients where client_code is null order by created_at, id loop
    update public.clients set client_code = 'VXC-' || nextval('public.client_code_seq') where id = r.id;
  end loop;
end $$;

-- No column default: the insert trigger in section 2 assigns the code, so each client uses one
-- number and the codes have no gaps. (NOT NULL is checked after that trigger runs.)
alter table public.clients alter column client_code drop default;
alter table public.clients alter column client_code set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clients_client_code_key') then
    alter table public.clients add constraint clients_client_code_key unique (client_code);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'clients_client_code_format') then
    alter table public.clients add constraint clients_client_code_format check (client_code ~ '^VXC-[0-9]{4,}$');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. The details form
-- ---------------------------------------------------------------------------

alter table public.clients
  add column if not exists detail_fields        jsonb check (detail_fields is null or jsonb_typeof(detail_fields) = 'array'),
  add column if not exists details              jsonb check (details is null or jsonb_typeof(details) = 'object'),
  add column if not exists details_submitted_at timestamptz,
  add column if not exists details_locked_at    timestamptz,
  add column if not exists details_locked_by    uuid references public.profiles (id) on delete set null;

-- The functions below set this for their own transaction. PostgREST cannot set it.
create or replace function public.client_details_rpc_active()
returns boolean language sql stable set search_path = '' as $$
  select coalesce(current_setting('vernex.client_details_rpc', true), '') = 'on'
$$;

-- A form layout: an array of {key, label, type, required, section, hint}.
create or replace function public.detail_fields_ok(p_fields jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select p_fields is null or (
    jsonb_typeof(p_fields) = 'array'
    and jsonb_array_length(p_fields) between 1 and 100
    and not exists (
      select 1 from jsonb_array_elements(p_fields) f
       where jsonb_typeof(f) <> 'object'
          or coalesce(f->>'key', '') !~ '^[a-z][a-z0-9_]{0,63}$'
          or length(trim(coalesce(f->>'label', ''))) not between 1 and 120
          or coalesce(f->>'type', '') not in ('text', 'textarea', 'email', 'phone', 'url', 'number', 'date')
          or jsonb_typeof(f->'required') is distinct from 'boolean'
          or length(coalesce(f->>'section', '')) > 60
          or length(coalesce(f->>'hint', '')) > 300
    )
    and (select count(distinct f->>'key') from jsonb_array_elements(p_fields) f) = jsonb_array_length(p_fields)
  )
$$;

-- The Client Code is assigned here and never changes. The details, and when they were submitted or
-- locked, change only through the functions in section 4.
create or replace function public.guard_client_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.client_code := 'VXC-' || nextval('public.client_code_seq');
    if not public.client_details_rpc_active() then
      new.details := null;
      new.details_submitted_at := null;
      new.details_locked_at := null;
      new.details_locked_by := null;
    end if;
  else
    if new.client_code is distinct from old.client_code then
      perform public.fail('A Client Code cannot be changed.');
    end if;
    if not public.client_details_rpc_active() and (
         new.details is distinct from old.details
      or new.details_submitted_at is distinct from old.details_submitted_at
      or new.details_locked_at is distinct from old.details_locked_at
      or new.details_locked_by is distinct from old.details_locked_by) then
      perform public.fail('Client details are saved through the details form.');
    end if;
  end if;
  if not public.detail_fields_ok(new.detail_fields) then
    perform public.fail('Check the form fields: each needs a label, a type and a unique key.');
  end if;
  return new;
end $$;

drop trigger if exists clients_guard_write on public.clients;
create trigger clients_guard_write
  before insert or update on public.clients
  for each row execute function public.guard_client_write();

-- ---------------------------------------------------------------------------
-- 3. Login codes and the passwords staff can read back
-- ---------------------------------------------------------------------------

alter table public.profiles add column if not exists login_code text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_login_code_format') then
    alter table public.profiles add constraint profiles_login_code_format
      check (login_code is null or login_code ~ '^VXC-[0-9]{4,}(-[0-9]{1,3})?$');
  end if;
end $$;
create unique index if not exists profiles_login_code_key on public.profiles (login_code) where login_code is not null;

-- Signed-in people (staff included) cannot set a login code through the API; the Edge Function
-- uses the service role, and the SQL Editor has no signed-in user.
create or replace function public.guard_profile_login_code()
returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(auth.role(), '') = 'authenticated' then
    if tg_op = 'INSERT' then
      new.login_code := null;
    elsif new.login_code is distinct from old.login_code then
      perform public.fail('Login codes are set from Client Management.');
    end if;
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard_login_code on public.profiles;
create trigger profiles_guard_login_code
  before insert or update on public.profiles
  for each row execute function public.guard_profile_login_code();

create table if not exists public.client_credentials (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  client_id  uuid not null references public.clients (id) on delete cascade,
  login_code text not null unique check (login_code ~ '^VXC-[0-9]{4,}(-[0-9]{1,3})?$'),
  password   text not null check (length(password) between 8 and 72),
  set_by     text not null check (set_by in ('vernex', 'client')),
  updated_at timestamptz not null default now()
);
create index if not exists client_credentials_client_idx on public.client_credentials (client_id);
alter table public.client_credentials enable row level security;
revoke all on public.client_credentials from public, anon, authenticated;
grant all on public.client_credentials to service_role;

create or replace function public.list_client_credentials()
returns setof public.client_credentials language sql stable security definer set search_path = '' as $$
  select cc.* from public.client_credentials cc
   where public.is_staff() and cc.client_id in (select public.my_client_ids())
   order by cc.login_code
$$;
revoke all on function public.list_client_credentials() from public, anon;
grant execute on function public.list_client_credentials() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Saving, submitting and locking the details
-- ---------------------------------------------------------------------------

-- p_values: every field of the form by key; an empty string clears an answer. Keys that are not
-- sent are kept. A client may only save their own client's details, and only while unlocked.
create or replace function public.save_client_details(p_client_id uuid, p_values jsonb, p_submit boolean default false)
returns public.clients language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles;
  c public.clients;
  is_staff boolean;
  k text;
  v jsonb;
  answer text;
  clean jsonb := '{}';
  f jsonb;
begin
  select * into me from public.profiles where user_id = auth.uid() and is_active;
  if me.id is null then perform public.fail('Your session has ended. Sign in again.'); end if;
  is_staff := me.role in ('vernex_founder', 'vernex_pm');
  if not (p_client_id in (select public.my_client_ids())) then
    perform public.fail('We couldn''t find that client.');
  end if;
  if jsonb_typeof(coalesce(p_values, '{}')) <> 'object' then perform public.fail('Check the details and try again.'); end if;

  select * into c from public.clients where id = p_client_id for update;
  if not is_staff and c.details_locked_at is not null then
    perform public.fail('Vernex has locked your details. Ask your account manager to change anything.');
  end if;

  for k, v in select key, value from jsonb_each(coalesce(p_values, '{}')) loop
    if k !~ '^[a-z][a-z0-9_]{0,63}$' or jsonb_typeof(v) <> 'string' then continue; end if;
    if c.detail_fields is not null
       and not exists (select 1 from jsonb_array_elements(c.detail_fields) e where e->>'key' = k) then
      continue;
    end if;
    answer := trim(v #>> '{}');
    if answer = '' then continue; end if;
    if length(answer) > 2000 then perform public.fail('Keep each answer under 2000 characters.'); end if;
    if k in ('gstin', 'pan') then answer := upper(answer); end if;
    clean := clean || jsonb_build_object(k, answer);
  end loop;

  if p_submit and not is_staff and c.detail_fields is not null then
    for f in select value from jsonb_array_elements(c.detail_fields) loop
      if (f->>'required')::boolean and not (clean ? (f->>'key')) then
        perform public.fail('Enter ' || lower(f->>'label') || '.');
      end if;
    end loop;
  end if;

  perform set_config('vernex.client_details_rpc', 'on', true);
  update public.clients
     set details = (coalesce(details, '{}') - array(select jsonb_object_keys(coalesce(p_values, '{}')))) || clean,
         details_submitted_at = case when p_submit and not is_staff then now() else details_submitted_at end,
         industry = coalesce(clean->>'industry', industry),
         city = coalesce(clean->>'city', city),
         gstin = coalesce(clean->>'gstin', gstin),
         billing_email = coalesce(clean->>'billing_email', billing_email)
   where id = p_client_id
  returning * into c;
  perform set_config('vernex.client_details_rpc', 'off', true);
  return c;
end $$;

create or replace function public.set_client_details_lock(p_client_id uuid, p_locked boolean)
returns public.clients language plpgsql security definer set search_path = '' as $$
declare
  c public.clients;
begin
  if not public.is_staff() then perform public.fail('Only Vernex staff can lock client details.'); end if;
  if not (p_client_id in (select public.my_client_ids())) then
    perform public.fail('We couldn''t find that client.');
  end if;
  perform set_config('vernex.client_details_rpc', 'on', true);
  update public.clients
     set details_locked_at = case when p_locked then now() else null end,
         details_locked_by = case when p_locked then public.current_profile_id() else null end
   where id = p_client_id
  returning * into c;
  perform set_config('vernex.client_details_rpc', 'off', true);
  return c;
end $$;

revoke all on function public.save_client_details(uuid, jsonb, boolean) from public, anon;
revoke all on function public.set_client_details_lock(uuid, boolean) from public, anon;
grant execute on function public.save_client_details(uuid, jsonb, boolean) to authenticated;
grant execute on function public.set_client_details_lock(uuid, boolean) to authenticated;

commit;
