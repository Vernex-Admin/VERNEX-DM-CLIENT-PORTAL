begin;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles drop constraint if exists profiles_role_client;
alter table public.profiles add constraint profiles_role_check
  check (role in ('vernex_founder', 'vernex_pm', 'vernex_finance', 'client_admin', 'client_member'));
alter table public.profiles add constraint profiles_role_client check (
  (role in ('client_admin', 'client_member') and client_id is not null)
  or (role in ('vernex_founder', 'vernex_pm', 'vernex_finance') and client_id is null)
);

create or replace function public.is_finance_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.current_user_role() = 'vernex_finance', false)
$$;

create or replace function public.is_invoice_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_staff() or public.is_finance_admin()
$$;

create or replace function public.is_agreement_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_staff() or public.is_finance_admin()
$$;

create or replace function public.financial_client_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select ids.client_id from public.my_client_ids() as ids(client_id)
  union
  select c.id from public.clients c where public.is_finance_admin()
$$;

revoke all on function public.is_finance_admin() from public, anon;
revoke all on function public.is_invoice_admin() from public, anon;
revoke all on function public.is_agreement_admin() from public, anon;
revoke all on function public.financial_client_ids() from public, anon;
grant execute on function public.is_finance_admin() to authenticated;
grant execute on function public.is_invoice_admin() to authenticated;
grant execute on function public.is_agreement_admin() to authenticated;
grant execute on function public.financial_client_ids() to authenticated;

drop policy if exists clients_finance_read on public.clients;
create policy clients_finance_read on public.clients for select to authenticated
  using (public.is_finance_admin());
drop policy if exists projects_finance_read on public.projects;
create policy projects_finance_read on public.projects for select to authenticated
  using (public.is_finance_admin());

drop policy if exists invoices_read on public.invoices;
drop policy if exists invoices_staff_write on public.invoices;
create policy invoices_read on public.invoices for select to authenticated
  using (client_id in (select public.financial_client_ids()) and (status <> 'draft' or public.is_invoice_admin()));
create policy invoices_staff_write on public.invoices for all to authenticated
  using (public.is_invoice_admin() and client_id in (select public.financial_client_ids()))
  with check (public.is_invoice_admin() and client_id in (select public.financial_client_ids()));

drop policy if exists invoice_items_read on public.invoice_items;
drop policy if exists invoice_items_staff_write on public.invoice_items;
create policy invoice_items_read on public.invoice_items for select to authenticated
  using (invoice_id in (select id from public.invoices));
create policy invoice_items_staff_write on public.invoice_items for all to authenticated
  using (public.is_invoice_admin() and invoice_id in (select id from public.invoices))
  with check (public.is_invoice_admin() and invoice_id in (select id from public.invoices));

drop policy if exists invoice_settings_staff_read on public.invoice_settings;
drop policy if exists invoice_templates_staff_read on public.invoice_templates;
drop policy if exists invoice_events_staff_read on public.invoice_events;
drop policy if exists invoice_payments_staff_read on public.invoice_payments;
create policy invoice_settings_staff_read on public.invoice_settings for select to authenticated
  using (public.is_invoice_admin());
create policy invoice_templates_staff_read on public.invoice_templates for select to authenticated
  using (public.is_invoice_admin());
create policy invoice_events_staff_read on public.invoice_events for select to authenticated
  using (public.is_invoice_admin() and invoice_id in (select id from public.invoices));
create policy invoice_payments_staff_read on public.invoice_payments for select to authenticated
  using (public.is_invoice_admin() and invoice_id in (select id from public.invoices));

drop policy if exists agreement_templates_staff_read on public.agreement_templates;
drop policy if exists agreements_authorized_read on public.agreements;
create policy agreement_templates_staff_read on public.agreement_templates
  for select to authenticated using (public.is_agreement_admin());
create policy agreements_authorized_read on public.agreements
  for select to authenticated using (
    (public.is_agreement_admin() and client_id in (select public.financial_client_ids()))
    or (client_id in (select public.my_client_ids()) and sent_at is not null
      and status in ('awaiting_client_signature', 'signed', 'cancelled'))
  );

drop policy if exists agreement_signature_read on storage.objects;
create policy agreement_signature_read on storage.objects for select to authenticated using (
  bucket_id = 'agreements' and exists (
    select 1 from public.agreements a
    where a.id = ((storage.foldername(name))[2])::uuid
      and ((public.is_agreement_admin() and a.client_id in (select public.financial_client_ids()))
        or (a.client_id in (select public.my_client_ids()) and a.sent_at is not null
          and a.status in ('awaiting_client_signature', 'signed', 'cancelled')))
  )
);

drop policy if exists invoice_assets_staff_upload on storage.objects;
drop policy if exists invoice_assets_read on storage.objects;
create policy invoice_assets_staff_upload on storage.objects for insert to authenticated with check (
  bucket_id = 'invoice-assets' and public.is_invoice_admin()
  and name ~ '^branding/(logo|qr)-[0-9a-f-]{36}\.(png|jpg|webp)$'
);
create policy invoice_assets_read on storage.objects for select to authenticated using (
  bucket_id = 'invoice-assets' and (
    public.is_invoice_admin()
    or exists (
      select 1 from public.invoices i
       where i.status <> 'draft' and i.client_id in (select public.my_client_ids())
         and (i.document #>> '{company,logo,path}' = objects.name or i.document #>> '{payment,qr,path}' = objects.name)
    )
  )
);

do $$
declare
  signature text;
  target regprocedure;
  definition text;
begin
  foreach signature in array array[
    'public.save_agreement_template(uuid,text,jsonb)',
    'public.create_agreement_draft(uuid,text,jsonb,uuid)',
    'public.update_agreement_draft(uuid,text,jsonb)',
    'public.request_agreement_founder_signature(uuid)',
    'public.cancel_agreement(uuid)'
  ] loop
    target := to_regprocedure(signature);
    if target is null then
      raise exception 'Required agreement function is missing: %', signature;
    end if;
    definition := pg_get_functiondef(target);
    definition := replace(definition, 'public.is_staff()', 'public.is_agreement_admin()');
    definition := replace(definition, 'public.my_client_ids()', 'public.financial_client_ids()');
    execute definition;
  end loop;

  foreach signature in array array[
    'public.save_invoice_draft(uuid,uuid,uuid,text,date,date,jsonb,uuid)',
    'public.issue_invoice(uuid)',
    'public.revise_invoice(uuid)',
    'public.set_invoice_payment_status(uuid,text,bigint,text)',
    'public.save_invoice_settings(jsonb,text)',
    'public.save_invoice_template(uuid,text,jsonb)',
    'public.delete_invoice_template(uuid)'
  ] loop
    target := to_regprocedure(signature);
    if target is null then
      raise exception 'Required invoice function is missing: %', signature;
    end if;
    definition := pg_get_functiondef(target);
    definition := replace(definition, 'public.is_staff()', 'public.is_invoice_admin()');
    definition := replace(definition, 'public.my_client_ids()', 'public.financial_client_ids()');
    execute definition;
  end loop;
end $$;

commit;
