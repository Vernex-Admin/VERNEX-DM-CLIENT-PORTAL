begin;

create table public.agreement_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  content jsonb not null,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.agreements (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  template_id uuid references public.agreement_templates(id) on delete set null,
  title text not null check (length(trim(title)) between 1 and 200),
  content jsonb not null,
  status text not null default 'draft' check (status in (
    'draft', 'awaiting_founder_signature', 'awaiting_client_signature', 'signed', 'cancelled'
  )),
  created_by uuid not null references auth.users(id),
  founder_user_id uuid references auth.users(id),
  founder_signature_path text,
  founder_signed_at timestamptz,
  sent_at timestamptz,
  client_user_id uuid references auth.users(id),
  client_signature_path text,
  client_signed_at timestamptz,
  signed_content jsonb,
  signed_pdf_path text,
  cancelled_by uuid references auth.users(id),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  check ((founder_user_id is null) = (founder_signed_at is null)),
  check ((client_user_id is null) = (client_signed_at is null)),
  check (status <> 'signed' or (
    founder_user_id is not null and client_user_id is not null and
    founder_signature_path is not null and client_signature_path is not null and
    founder_signed_at is not null and client_signed_at is not null and signed_content is not null
  ))
);
create index agreements_client_idx on public.agreements(client_id, created_at desc);
create index agreements_status_idx on public.agreements(status, updated_at desc);

create table public.agreement_events (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.agreements(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id),
  event_type text not null check (event_type in (
    'created', 'edited', 'submitted_for_founder_signature', 'founder_signed_and_sent',
    'client_signed', 'cancelled', 'signed_pdf_generated'
  )),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp()
);
create index agreement_events_agreement_idx on public.agreement_events(agreement_id, created_at);

alter table public.agreement_templates enable row level security;
alter table public.agreements enable row level security;
alter table public.agreement_events enable row level security;

create policy agreement_templates_staff_read on public.agreement_templates
  for select to authenticated using (public.is_staff());
create policy agreements_authorized_read on public.agreements
  for select to authenticated using (
    (public.is_staff() and client_id in (select public.my_client_ids()))
    or (client_id in (select public.my_client_ids()) and sent_at is not null
      and status in ('awaiting_client_signature', 'signed', 'cancelled'))
  );
create policy agreement_events_authorized_read on public.agreement_events
  for select to authenticated using (
    exists (select 1 from public.agreements a where a.id = agreement_id)
  );

revoke insert, update, delete, truncate, references, trigger on public.agreement_templates from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.agreements from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.agreement_events from authenticated;
grant select on public.agreement_templates, public.agreements, public.agreement_events to authenticated;

insert into public.agreement_templates(name, content, created_by)
select 'Vernex Services Agreement', '{"projectTitle":"","agreementDate":"","startDate":"","endDate":"","services":"","scope":"","paymentTerms":"","clientName":"","clientEmail":"","developerName":"","companyName":"VerneX","companySigner":"BOSS ANANDAA","companyTitle":"CEO & Founder","clauses":[]}'::jsonb, p.user_id
from public.profiles p where p.role = 'vernex_founder' and p.is_active and p.user_id is not null
order by p.created_at limit 1
on conflict do nothing;

create or replace function public.save_agreement_template(p_id uuid, p_name text, p_content jsonb)
returns public.agreement_templates language plpgsql security definer set search_path = '' as $$
declare v_template public.agreement_templates;
begin
  if not public.is_staff() then raise exception 'Staff permission required' using errcode = '42501'; end if;
  if p_name is null or length(trim(p_name)) not between 1 and 120 or jsonb_typeof(p_content) <> 'object' then
    raise exception 'Template name or content is invalid' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.agreement_templates(name, content, created_by)
    values (trim(p_name), p_content, auth.uid()) returning * into v_template;
  else
    update public.agreement_templates set name = trim(p_name), content = p_content, updated_at = clock_timestamp()
    where id = p_id and is_active returning * into v_template;
    if not found then raise exception 'Template not found' using errcode = 'P0002'; end if;
  end if;
  return v_template;
end $$;

create or replace function public.create_agreement_draft(p_client_id uuid, p_title text, p_content jsonb, p_template_id uuid default null)
returns public.agreements language plpgsql security definer set search_path = '' as $$
declare v_agreement public.agreements;
begin
  if not public.is_staff() or p_client_id not in (select public.my_client_ids()) then
    raise exception 'You cannot create an agreement for this client' using errcode = '42501';
  end if;
  if p_title is null or length(trim(p_title)) not between 1 and 200 or jsonb_typeof(p_content) <> 'object' then
    raise exception 'Agreement title or content is invalid' using errcode = '22023';
  end if;
  if p_template_id is not null and not exists (
    select 1 from public.agreement_templates t where t.id = p_template_id and t.is_active
  ) then raise exception 'Template not found' using errcode = 'P0002'; end if;
  insert into public.agreements(client_id, template_id, title, content, created_by)
  values (p_client_id, p_template_id, trim(p_title), p_content, auth.uid()) returning * into v_agreement;
  insert into public.agreement_events(agreement_id, actor_user_id, event_type)
  values (v_agreement.id, auth.uid(), 'created');
  return v_agreement;
end $$;

create or replace function public.update_agreement_draft(p_id uuid, p_title text, p_content jsonb)
returns public.agreements language plpgsql security definer set search_path = '' as $$
declare v_agreement public.agreements;
begin
  if not public.is_staff() then raise exception 'Staff permission required' using errcode = '42501'; end if;
  update public.agreements set title = trim(p_title), content = p_content,
    version = version + 1, updated_at = clock_timestamp()
  where id = p_id and status = 'draft' and client_id in (select public.my_client_ids())
  returning * into v_agreement;
  if not found then raise exception 'Only an accessible draft can be edited' using errcode = '42501'; end if;
  insert into public.agreement_events(agreement_id, actor_user_id, event_type, details)
  values (p_id, auth.uid(), 'edited', jsonb_build_object('version', v_agreement.version));
  return v_agreement;
end $$;

create or replace function public.request_agreement_founder_signature(p_id uuid)
returns public.agreements language plpgsql security definer set search_path = '' as $$
declare v_agreement public.agreements;
begin
  if not public.is_staff() then raise exception 'Staff permission required' using errcode = '42501'; end if;
  update public.agreements set status = 'awaiting_founder_signature', updated_at = clock_timestamp()
  where id = p_id and status = 'draft' and client_id in (select public.my_client_ids()) returning * into v_agreement;
  if not found then raise exception 'Only an accessible draft can be submitted' using errcode = '42501'; end if;
  insert into public.agreement_events(agreement_id, actor_user_id, event_type)
  values (p_id, auth.uid(), 'submitted_for_founder_signature');
  return v_agreement;
end $$;

create or replace function public.founder_sign_and_send_agreement(p_id uuid, p_signature_path text)
returns public.agreements language plpgsql security definer set search_path = '' as $$
declare v_agreement public.agreements; v_path text; v_now timestamptz := clock_timestamp();
begin
  if not public.is_founder() then raise exception 'Founder permission required' using errcode = '42501'; end if;
  v_path := p_signature_path;
  if v_path not in (
    'agreements/' || p_id::text || '/founder-' || auth.uid()::text || '.png',
    'agreements/' || p_id::text || '/founder-' || auth.uid()::text || '.jpg'
  ) or not exists (select 1 from storage.objects o where o.bucket_id = 'agreements' and o.name = v_path)
  then raise exception 'Founder signature upload is missing or invalid' using errcode = '22023'; end if;
  update public.agreements set status = 'awaiting_client_signature',
    founder_user_id = auth.uid(), founder_signature_path = v_path,
    founder_signed_at = v_now, sent_at = v_now, signed_content = content,
    updated_at = v_now
  where id = p_id and status = 'awaiting_founder_signature' and client_id in (select public.my_client_ids())
  returning * into v_agreement;
  if not found then raise exception 'Agreement is not awaiting founder signature' using errcode = '42501'; end if;
  insert into public.agreement_events(agreement_id, actor_user_id, event_type, details, created_at)
  values (p_id, auth.uid(), 'founder_signed_and_sent', jsonb_build_object('sent_at', v_now), v_now);
  return v_agreement;
end $$;

create or replace function public.client_sign_agreement(p_id uuid, p_signature_path text, p_consent boolean)
returns public.agreements language plpgsql security definer set search_path = '' as $$
declare v_agreement public.agreements; v_path text; v_now timestamptz := clock_timestamp();
begin
  if p_consent is distinct from true then raise exception 'Explicit consent is required' using errcode = '22023'; end if;
  if public.current_user_role() not in ('client_admin', 'client_member') then
    raise exception 'Client permission required' using errcode = '42501';
  end if;
  v_path := p_signature_path;
  if v_path not in (
    'agreements/' || p_id::text || '/client-' || auth.uid()::text || '.png',
    'agreements/' || p_id::text || '/client-' || auth.uid()::text || '.jpg'
  ) or not exists (select 1 from storage.objects o where o.bucket_id = 'agreements' and o.name = v_path)
  then raise exception 'Client signature upload is missing or invalid' using errcode = '22023'; end if;
  update public.agreements set status = 'signed', client_user_id = auth.uid(),
    client_signature_path = v_path, client_signed_at = v_now, updated_at = v_now
  where id = p_id and status = 'awaiting_client_signature'
    and client_id in (select public.my_client_ids()) and sent_at is not null
  returning * into v_agreement;
  if not found then raise exception 'Agreement is not available for signing' using errcode = '42501'; end if;
  insert into public.agreement_events(agreement_id, actor_user_id, event_type, details, created_at)
  values (p_id, auth.uid(), 'client_signed', jsonb_build_object('consent', true, 'signed_at', v_now), v_now);
  return v_agreement;
end $$;

create or replace function public.cancel_agreement(p_id uuid)
returns public.agreements language plpgsql security definer set search_path = '' as $$
declare v_agreement public.agreements; v_now timestamptz := clock_timestamp();
begin
  if not public.is_staff() then raise exception 'Staff permission required' using errcode = '42501'; end if;
  update public.agreements set status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = v_now, updated_at = v_now
  where id = p_id and status in ('draft', 'awaiting_founder_signature', 'awaiting_client_signature')
    and client_id in (select public.my_client_ids()) returning * into v_agreement;
  if not found then raise exception 'This agreement cannot be cancelled' using errcode = '42501'; end if;
  insert into public.agreement_events(agreement_id, actor_user_id, event_type, created_at)
  values (p_id, auth.uid(), 'cancelled', v_now);
  return v_agreement;
end $$;

revoke all on function public.save_agreement_template(uuid, text, jsonb) from public, anon;
revoke all on function public.create_agreement_draft(uuid, text, jsonb, uuid) from public, anon;
revoke all on function public.update_agreement_draft(uuid, text, jsonb) from public, anon;
revoke all on function public.request_agreement_founder_signature(uuid) from public, anon;
revoke all on function public.founder_sign_and_send_agreement(uuid, text) from public, anon;
revoke all on function public.client_sign_agreement(uuid, text, boolean) from public, anon;
revoke all on function public.cancel_agreement(uuid) from public, anon;
grant execute on function public.save_agreement_template(uuid, text, jsonb) to authenticated;
grant execute on function public.create_agreement_draft(uuid, text, jsonb, uuid) to authenticated;
grant execute on function public.update_agreement_draft(uuid, text, jsonb) to authenticated;
grant execute on function public.request_agreement_founder_signature(uuid) to authenticated;
grant execute on function public.founder_sign_and_send_agreement(uuid, text) to authenticated;
grant execute on function public.client_sign_agreement(uuid, text, boolean) to authenticated;
grant execute on function public.cancel_agreement(uuid) to authenticated;

insert into storage.buckets(id, name, public, file_size_limit)
values ('agreements', 'agreements', false, 5242880)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

create policy agreement_signature_read on storage.objects for select to authenticated using (
  bucket_id = 'agreements' and exists (
    select 1 from public.agreements a
    where a.id = ((storage.foldername(name))[2])::uuid
      and ((public.is_staff() and a.client_id in (select public.my_client_ids()))
        or (a.client_id in (select public.my_client_ids()) and a.sent_at is not null
          and a.status in ('awaiting_client_signature', 'signed', 'cancelled')))
  )
);
create policy agreement_signature_upload on storage.objects for insert to authenticated with check (
  bucket_id = 'agreements' and (storage.foldername(name))[1] = 'agreements'
  and exists (
    select 1 from public.agreements a
    where a.id = ((storage.foldername(name))[2])::uuid
      and (
        (public.is_founder() and a.status = 'awaiting_founder_signature'
          and storage.filename(name) in ('founder-' || auth.uid()::text || '.png', 'founder-' || auth.uid()::text || '.jpg'))
        or (public.current_user_role() in ('client_admin', 'client_member')
          and a.client_id in (select public.my_client_ids()) and a.status = 'awaiting_client_signature'
          and storage.filename(name) in ('client-' || auth.uid()::text || '.png', 'client-' || auth.uid()::text || '.jpg'))
      )
  )
);
-- Allow retrying an interrupted signature upload while the signer is still in
-- the corresponding pending state. The policy stops permitting changes as soon
-- as the RPC moves the agreement to the next status.
create policy agreement_signature_retry on storage.objects for update to authenticated using (
  bucket_id = 'agreements' and exists (
    select 1 from public.agreements a
    where a.id = ((storage.foldername(name))[2])::uuid
      and (
        (public.is_founder() and a.status = 'awaiting_founder_signature'
          and storage.filename(name) = 'founder-' || auth.uid()::text || '.jpg')
        or (public.current_user_role() in ('client_admin', 'client_member')
          and a.client_id in (select public.my_client_ids()) and a.status = 'awaiting_client_signature'
          and storage.filename(name) = 'client-' || auth.uid()::text || '.jpg')
      )
  )
) with check (
  bucket_id = 'agreements' and exists (
    select 1 from public.agreements a
    where a.id = ((storage.foldername(name))[2])::uuid
      and (
        (public.is_founder() and a.status = 'awaiting_founder_signature'
          and storage.filename(name) = 'founder-' || auth.uid()::text || '.jpg')
        or (public.current_user_role() in ('client_admin', 'client_member')
          and a.client_id in (select public.my_client_ids()) and a.status = 'awaiting_client_signature'
          and storage.filename(name) = 'client-' || auth.uid()::text || '.jpg')
      )
  )
);

-- Respect the existing onboarding gate: signing a workflow agreement counts as signed.
create or replace function public.onboarding_gates(p_client_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when p_client_id in (select public.my_client_ids()) then jsonb_build_object(
    'agreement_signed', (
      exists (select 1 from public.documents d where d.client_id = p_client_id and d.kind = 'agreement' and d.status = 'signed')
      or exists (select 1 from public.agreements a where a.client_id = p_client_id and a.status = 'signed')
    ),
    'first_invoice_paid', exists (select 1 from public.invoices i where i.client_id = p_client_id and i.status = 'paid')
  ) end
$$;
revoke all on function public.onboarding_gates(uuid) from public, anon;
grant execute on function public.onboarding_gates(uuid) to authenticated;

commit;
