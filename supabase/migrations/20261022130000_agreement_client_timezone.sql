begin;

alter table public.agreements
  add column client_timezone text check (
    client_timezone is null or (length(trim(client_timezone)) between 1 and 100 and client_timezone !~ '[[:cntrl:]]')
  );

drop function public.client_sign_agreement(uuid, text, boolean);

create function public.client_sign_agreement(
  p_id uuid,
  p_signature_path text,
  p_consent boolean,
  p_client_timezone text
)
returns public.agreements
language plpgsql security definer set search_path = '' as $$
declare
  v_agreement public.agreements;
  v_path text;
  v_now timestamptz := clock_timestamp();
begin
  if p_consent is distinct from true then
    raise exception 'Explicit consent is required' using errcode = '22023';
  end if;
  if p_client_timezone is null or length(trim(p_client_timezone)) not between 1 and 100
    or not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p_client_timezone)
  then
    raise exception 'A valid IANA client timezone is required' using errcode = '22023';
  end if;
  if public.current_user_role() not in ('client_admin', 'client_member') then
    raise exception 'Client permission required' using errcode = '42501';
  end if;

  v_path := p_signature_path;
  if v_path not in (
    'agreements/' || p_id::text || '/client-' || auth.uid()::text || '.png',
    'agreements/' || p_id::text || '/client-' || auth.uid()::text || '.jpg'
  ) or not exists (
    select 1 from storage.objects o where o.bucket_id = 'agreements' and o.name = v_path
  ) then
    raise exception 'Client signature upload is missing or invalid' using errcode = '22023';
  end if;

  update public.agreements set
    status = 'signed',
    client_user_id = auth.uid(),
    client_signature_path = v_path,
    client_signed_at = v_now,
    client_timezone = p_client_timezone,
    updated_at = v_now
  where id = p_id and status = 'awaiting_client_signature'
    and client_id in (select public.my_client_ids()) and sent_at is not null
  returning * into v_agreement;
  if not found then
    raise exception 'Agreement is not available for signing' using errcode = '42501';
  end if;

  insert into public.agreement_events(agreement_id, actor_user_id, event_type, details, created_at)
  values (
    p_id,
    auth.uid(),
    'client_signed',
    jsonb_build_object('consent', true, 'signed_at', v_now, 'client_timezone', p_client_timezone),
    v_now
  );
  return v_agreement;
end $$;

revoke all on function public.client_sign_agreement(uuid, text, boolean, text) from public, anon;
grant execute on function public.client_sign_agreement(uuid, text, boolean, text) to authenticated;

commit;
