-- Client Code sign-in support. Run once in Supabase SQL Editor after the existing schema.
-- Codes identify a profile; passwords remain verified by Supabase Auth.

begin;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.profile_login_codes (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  code_hash text not null unique check (code_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now()
);
alter table public.profile_login_codes enable row level security;
revoke all on public.profile_login_codes from public, anon, authenticated;
grant all on public.profile_login_codes to service_role;

-- Per-IP attempt windows protect unknown-code lookups. Only the Edge Function's service role
-- can call the rate-limit RPC or read/update this table. Raw IP addresses are never stored.
create table if not exists public.client_code_login_limits (
  ip_hash text primary key check (ip_hash ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null default now(),
  attempts integer not null default 1 check (attempts > 0)
);
alter table public.client_code_login_limits enable row level security;
revoke all on public.client_code_login_limits from public, anon, authenticated;
grant all on public.client_code_login_limits to service_role;

create or replace function public.consume_client_code_login_attempt(p_ip_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt_count integer;
begin
  if p_ip_hash !~ '^[a-f0-9]{64}$' then
    return false;
  end if;

  insert into public.client_code_login_limits (ip_hash, window_started_at, attempts)
  values (p_ip_hash, now(), 1)
  on conflict (ip_hash) do update
    set attempts = case
          when public.client_code_login_limits.window_started_at < now() - interval '15 minutes' then 1
          else public.client_code_login_limits.attempts + 1
        end,
        window_started_at = case
          when public.client_code_login_limits.window_started_at < now() - interval '15 minutes' then now()
          else public.client_code_login_limits.window_started_at
        end
  returning attempts into attempt_count;

  delete from public.client_code_login_limits
   where window_started_at < now() - interval '1 day';

  return attempt_count <= 8;
end;
$$;
revoke all on function public.consume_client_code_login_attempt(text) from public, anon, authenticated;
grant execute on function public.consume_client_code_login_attempt(text) to service_role;

commit;

-- Assign or rotate a code from Supabase SQL Editor. Replace the example code and email, then
-- remove the SQL text from your query history if your code policy requires it.
-- Codes are case-insensitive and must be 6-64 letters, numbers, or hyphens.
--
-- insert into public.profile_login_codes (profile_id, code_hash)
-- select id, encode(extensions.digest(upper('VX-EXAMPLE-001'), 'sha256'), 'hex')
-- from public.profiles where lower(email) = lower('person@example.com') and is_active
-- on conflict (profile_id) do update set code_hash = excluded.code_hash, created_at = now();
