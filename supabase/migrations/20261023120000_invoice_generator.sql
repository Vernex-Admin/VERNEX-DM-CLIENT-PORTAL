-- Vernex Hub: Invoice Generator.
--
-- Builds on public.invoices / public.invoice_items (01_schema.sql, 02_security.sql):
--   * invoices.document holds the editable A4 page; totals are computed here from it, never trusted
--     from the browser (invoice_compute matches src/lib/invoiceMath.ts).
--   * Draft -> issued lifecycle. An issued invoice is frozen (issued_snapshot); changes need a
--     revision, and issuing the revision cancels the original. Issued invoices are never deleted.
--   * Payment status is set by hand by staff and every change lands in invoice_events. Nothing marks
--     an invoice paid automatically: the QR code is a placeholder while payment_mode is 'mock'.
--   * record_gateway_payment() is the hook for a future verified webhook. Only service_role may call
--     it, and it refuses to run until a gateway is configured on the server.
--   * invoice_settings (company defaults), invoice_templates, and a private invoice-assets bucket
--     for logos and QR images. Staff only; clients read images only on their own issued invoices.
--
-- Apply after the earlier migrations with `supabase db push`, after confirming the target project.

begin;

-- ---------------------------------------------------------------------------
-- 1. Invoices and line items
-- ---------------------------------------------------------------------------

alter table public.invoices drop constraint if exists invoices_currency_check;
alter table public.invoices add constraint invoices_currency_check
  check (currency in ('INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD'));

alter table public.invoices
  add column document        jsonb check (document is null or jsonb_typeof(document) = 'object'),
  add column discount_minor  bigint not null default 0 check (discount_minor >= 0),
  add column taxable_minor   bigint not null default 0 check (taxable_minor >= 0),
  add column tax_mode        text not null default 'none' check (tax_mode in ('none', 'cgst_sgst', 'igst')),
  add column gst_rate        numeric(5, 2) not null default 0 check (gst_rate >= 0 and gst_rate <= 100),
  add column revision        integer not null default 1 check (revision >= 1),
  add column revision_of     uuid references public.invoices (id) on delete set null,
  add column superseded_by   uuid references public.invoices (id) on delete set null,
  add column issued_at       timestamptz,
  add column issued_by       uuid references auth.users (id),
  add column issued_snapshot jsonb,
  add column updated_at      timestamptz not null default now(),
  add constraint invoices_tax_consistent check ((tax_mode = 'none') = (gst_rate = 0)),
  add constraint invoices_issued_complete check (issued_at is null or (issued_snapshot is not null and document is not null));

create index invoices_revision_of_idx on public.invoices (revision_of) where revision_of is not null;

-- Every invoice before this migration came from the quick form at CGST 9% + SGST 9%.
update public.invoices set taxable_minor = subtotal_minor;
update public.invoices set tax_mode = 'cgst_sgst', gst_rate = 18 where cgst_minor > 0 or sgst_minor > 0;

alter table public.invoice_items
  add column position    integer not null default 0,
  add column bill_period text not null default '' check (length(bill_period) <= 120);

-- ---------------------------------------------------------------------------
-- 2. Settings, templates, audit history, gateway payments
-- ---------------------------------------------------------------------------

-- One row. payment_mode can be 'gateway' only once gateway_configured is set, and nothing the app
-- can call sets it: a developer does, on the server, when a provider and verified webhook exist.
create table public.invoice_settings (
  id                 boolean primary key default true check (id),
  defaults           jsonb not null check (jsonb_typeof(defaults) = 'object'),
  payment_mode       text not null default 'mock' check (payment_mode in ('mock', 'gateway')),
  gateway_configured boolean not null default false,
  updated_by         uuid references auth.users (id),
  updated_at         timestamptz,
  check (payment_mode = 'mock' or gateway_configured)
);

-- Only what the reference invoice prints. Address, GSTIN and payment instructions start blank.
insert into public.invoice_settings (defaults) values ('{
  "company": {"name": "Vernex Digital Marketing", "tagline": "Crafting your digital narrative.",
    "phone": "+91 97899 12805", "email": "admin@vernex.in", "website": "www.vernex.in",
    "address": "", "gstin": "", "logo": {"kind": "default"}},
  "footer": {"thank_you": "Thank you for partnering with Vernex Digital Marketing.",
    "closing": "Let''s build something great together."},
  "payment": {"qr": {"kind": "default"}, "label": "SCAN TO PAY", "instructions": ""},
  "currency": "INR",
  "gst_rates": [5, 18],
  "tax": {"mode": "none", "rate": 0},
  "payment_terms": "",
  "show_page_numbers": false
}'::jsonb);

create table public.invoice_templates (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) between 1 and 120),
  document   jsonb not null check (jsonb_typeof(document) = 'object'),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.invoice_events (
  id            uuid primary key default gen_random_uuid(),
  invoice_id    uuid not null references public.invoices (id) on delete cascade,
  -- Null when the server itself acted, e.g. a verified gateway webhook.
  actor_user_id uuid references auth.users (id),
  event_type    text not null check (event_type in (
                  'created', 'edited', 'issued', 'revised', 'superseded', 'status_changed', 'payment_recorded')),
  details       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default clock_timestamp()
);
create index invoice_events_invoice_idx on public.invoice_events (invoice_id, created_at);

-- Gateway payments only, one row per provider payment, so a replayed webhook counts once.
create table public.invoice_payments (
  id                  uuid primary key default gen_random_uuid(),
  invoice_id          uuid not null references public.invoices (id) on delete cascade,
  provider            text not null check (length(trim(provider)) between 1 and 40),
  provider_payment_id text not null check (length(trim(provider_payment_id)) between 1 and 200),
  amount_minor        bigint not null check (amount_minor > 0),
  currency            text not null,
  created_at          timestamptz not null default clock_timestamp(),
  unique (provider, provider_payment_id)
);

alter table public.invoice_settings  enable row level security;
alter table public.invoice_templates enable row level security;
alter table public.invoice_events    enable row level security;
alter table public.invoice_payments  enable row level security;

create policy invoice_settings_staff_read on public.invoice_settings for select to authenticated
  using (public.is_staff());
create policy invoice_templates_staff_read on public.invoice_templates for select to authenticated
  using (public.is_staff());
create policy invoice_events_staff_read on public.invoice_events for select to authenticated
  using (public.is_staff() and invoice_id in (select id from public.invoices));
create policy invoice_payments_staff_read on public.invoice_payments for select to authenticated
  using (public.is_staff() and invoice_id in (select id from public.invoices));

-- Every write goes through the functions below.
revoke insert, update, delete, truncate, references, trigger
  on public.invoice_settings, public.invoice_templates, public.invoice_events, public.invoice_payments
  from authenticated, anon;
grant select on public.invoice_settings, public.invoice_templates, public.invoice_events, public.invoice_payments
  to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Totals and validation
-- ---------------------------------------------------------------------------

-- The same sums as computeInvoice() in src/lib/invoiceMath.ts. All values are non-negative, so
-- round() here (half away from zero) and the app's half-up rounding agree.
create or replace function public.invoice_compute(p_document jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  v_line     jsonb;
  v_subtotal numeric := 0;
  v_discount numeric := 0;
  v_taxable  numeric;
  v_cgst     numeric := 0;
  v_sgst     numeric := 0;
  v_igst     numeric := 0;
  v_mode     text := coalesce(p_document #>> '{tax,mode}', 'none');
  v_rate     numeric := coalesce((p_document #>> '{tax,rate}')::numeric, 0);
  v_kind     text := coalesce(p_document #>> '{discount,kind}', 'amount');
  v_value    numeric := coalesce((p_document #>> '{discount,value}')::numeric, 0);
begin
  for v_line in select value from jsonb_array_elements(coalesce(p_document -> 'lines', '[]'::jsonb)) loop
    if jsonb_typeof(v_line -> 'quantity') = 'number' and jsonb_typeof(v_line -> 'rate_minor') = 'number'
       and (v_line ->> 'quantity')::numeric >= 0 and (v_line ->> 'rate_minor')::numeric >= 0 then
      v_subtotal := v_subtotal + round(round((v_line ->> 'quantity')::numeric, 2) * round((v_line ->> 'rate_minor')::numeric));
    end if;
  end loop;

  if v_value > 0 then
    if v_kind = 'percent' then
      v_discount := round(v_subtotal * round(least(v_value, 100), 2) / 100);
    else
      v_discount := round(v_value);
    end if;
  end if;
  v_discount := least(v_discount, v_subtotal);
  v_taxable := v_subtotal - v_discount;

  if v_mode <> 'none' and v_rate > 0 then
    if v_mode = 'cgst_sgst' then
      v_cgst := round(v_taxable * round(v_rate, 2) / 200);
      v_sgst := v_cgst;
    else
      v_igst := round(v_taxable * round(v_rate, 2) / 100);
    end if;
  end if;

  return jsonb_build_object(
    'subtotal_minor', v_subtotal::bigint,
    'discount_minor', v_discount::bigint,
    'taxable_minor', v_taxable::bigint,
    'cgst_minor', v_cgst::bigint,
    'sgst_minor', v_sgst::bigint,
    'igst_minor', v_igst::bigint,
    'total_minor', (v_taxable + v_cgst + v_sgst + v_igst)::bigint
  );
end $$;

-- An uploaded image must be one of ours in the invoice-assets bucket, never another bucket's file.
create or replace function public.invoice_image_ok(p_image jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select p_image is null
      or (jsonb_typeof(p_image) = 'object' and (
           p_image ->> 'kind' in ('default', 'none')
           or (p_image ->> 'kind' = 'uploaded'
               and coalesce(p_image ->> 'path', '') ~ '^branding/(logo|qr)-[0-9a-f-]{36}\.(png|jpg|webp)$')))
$$;

-- Raises a sentence for people (errcode P0001) on the first problem. p_strict: the issue checks.
-- The same rules as validateInvoice() in src/lib/invoiceMath.ts.
create or replace function public.invoice_check(p_document jsonb, p_currency text, p_issue date, p_due date, p_strict boolean)
returns void language plpgsql stable security definer set search_path = '' as $$
declare
  v_line     jsonb;
  v_index    int := 0;
  v_qty      numeric;
  v_rate     numeric;
  v_desc     text;
  v_period   text;
  v_billed   int := 0;
  v_mode     text := p_document #>> '{tax,mode}';
  v_tax_rate numeric;
  v_kind     text := p_document #>> '{discount,kind}';
  v_value    numeric;
  v_rates    jsonb;
begin
  if p_document is null or jsonb_typeof(p_document) <> 'object' or (p_document ->> 'version') is distinct from '1'
     or coalesce(jsonb_typeof(p_document -> 'lines'), '') <> 'array' then
    raise exception 'The invoice could not be read. Reload the page and try again.';
  end if;
  if length(p_document::text) > 200000 then
    raise exception 'This invoice is too large to save. Shorten the descriptions.';
  end if;
  if (p_document ->> 'currency') is distinct from p_currency then
    raise exception 'The invoice currency could not be read. Choose the currency again.';
  end if;
  if p_issue is not null and p_due is not null and p_due < p_issue then
    raise exception 'The due date cannot be before the invoice date.';
  end if;
  if not public.invoice_image_ok(p_document #> '{company,logo}') or not public.invoice_image_ok(p_document #> '{payment,qr}') then
    raise exception 'An invoice image is not valid. Upload it again.';
  end if;
  if jsonb_array_length(p_document -> 'lines') > 200 then
    raise exception 'An invoice can have at most 200 rows.';
  end if;

  for v_line in select value from jsonb_array_elements(p_document -> 'lines') loop
    v_index := v_index + 1;
    if jsonb_typeof(v_line) <> 'object'
       or coalesce(jsonb_typeof(v_line -> 'quantity'), 'null') not in ('number', 'null')
       or coalesce(jsonb_typeof(v_line -> 'rate_minor'), 'null') not in ('number', 'null') then
      raise exception 'Row % has a value that is not a number.', v_index;
    end if;
    v_qty := (v_line ->> 'quantity')::numeric;
    v_rate := (v_line ->> 'rate_minor')::numeric;
    v_desc := trim(coalesce(v_line ->> 'description', ''));
    v_period := trim(coalesce(v_line ->> 'bill_period', ''));
    if v_qty < 0 or v_rate < 0 then
      raise exception 'Row %: quantities and rates cannot be negative.', v_index;
    end if;
    if v_qty > 10000 or v_rate > 1000000000 then
      raise exception 'Row %: the quantity or rate is too large.', v_index;
    end if;
    if v_qty <> round(v_qty, 2) or v_rate <> trunc(v_rate) then
      raise exception 'Row %: quantity and rate can have at most two decimal places.', v_index;
    end if;
    if length(v_desc) > 4000 or length(v_period) > 120 then
      raise exception 'Row %: the text is too long.', v_index;
    end if;
    if v_qty is not null and v_rate is not null then
      v_billed := v_billed + 1;
    end if;
    if p_strict and not (v_desc = '' and v_period = '' and v_qty is null and v_rate is null) then
      if v_desc = '' then raise exception 'Row % needs a description.', v_index; end if;
      if v_qty is null or v_qty = 0 then raise exception 'Row % needs a quantity above zero.', v_index; end if;
      if v_rate is null then raise exception 'Row % needs a rate.', v_index; end if;
    end if;
  end loop;

  if p_strict then
    if v_billed = 0 then
      raise exception 'Fill in at least one service row with a quantity and rate.';
    end if;
    if trim(coalesce(p_document #>> '{bill_to,company_name}', '')) = '' then
      raise exception 'Add the client or company name under Bill To.';
    end if;
    if p_issue is null or p_due is null then
      raise exception 'Set both the invoice date and the due date.';
    end if;
  end if;

  -- Tax: one GST type at a time, a configured rate, and only on INR invoices.
  if v_mode is null or v_mode not in ('none', 'cgst_sgst', 'igst') then
    raise exception 'Choose a GST type.';
  end if;
  if coalesce(jsonb_typeof(p_document #> '{tax,rate}'), '') <> 'number' then
    raise exception 'The GST rate must be a number.';
  end if;
  v_tax_rate := (p_document #>> '{tax,rate}')::numeric;
  if v_mode = 'none' and v_tax_rate <> 0 then
    raise exception 'Choose a GST type, or set the rate to 0 for no GST.';
  end if;
  if v_mode <> 'none' then
    if p_currency <> 'INR' then
      raise exception 'GST applies only to INR invoices. Choose "No GST" for other currencies.';
    end if;
    select s.defaults -> 'gst_rates' into v_rates from public.invoice_settings s where s.id;
    if v_tax_rate <= 0 or not exists (
      select 1 from jsonb_array_elements(coalesce(v_rates, '[]'::jsonb)) r
       where jsonb_typeof(r.value) = 'number' and r.value::numeric = v_tax_rate
    ) then
      raise exception '%', format('%s%% is not one of the configured GST rates.', v_tax_rate);
    end if;
  end if;

  -- Discount: a fixed amount up to the subtotal, or a percentage up to 100.
  if v_kind is null or v_kind not in ('amount', 'percent') then
    raise exception 'Choose a discount type.';
  end if;
  if coalesce(jsonb_typeof(p_document #> '{discount,value}'), '') <> 'number' then
    raise exception 'The discount must be a number.';
  end if;
  v_value := (p_document #>> '{discount,value}')::numeric;
  if v_value < 0 then
    raise exception 'The discount cannot be negative.';
  end if;
  if v_kind = 'percent' and v_value > 100 then
    raise exception 'A percentage discount cannot exceed 100%%.';
  end if;
  if v_value <> round(v_value, 2) or (v_kind = 'amount' and v_value <> trunc(v_value)) then
    raise exception 'The discount can have at most two decimal places.';
  end if;
  if v_kind = 'amount' and v_value > (public.invoice_compute(p_document) ->> 'subtotal_minor')::numeric then
    raise exception 'The discount cannot be more than the subtotal.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Guards: generator invoices change only through the functions; issued ones are frozen
-- ---------------------------------------------------------------------------

-- The functions in section 5 set this for their own transaction. PostgREST cannot set it.
create or replace function public.invoice_rpc_active()
returns boolean language sql stable set search_path = '' as $$
  select coalesce(current_setting('vernex.invoice_rpc', true), '') = 'on'
$$;

create or replace function public.guard_invoice_write()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_totals jsonb;
begin
  if tg_op = 'UPDATE' and old.issued_at is not null then
    if new.document is distinct from old.document
       or new.issued_snapshot is distinct from old.issued_snapshot
       or new.issued_at is distinct from old.issued_at
       or new.issued_by is distinct from old.issued_by
       or new.number is distinct from old.number
       or new.client_id is distinct from old.client_id
       or new.project_id is distinct from old.project_id
       or new.milestone_id is distinct from old.milestone_id
       or new.issue_date is distinct from old.issue_date
       or new.due_date is distinct from old.due_date
       or new.currency is distinct from old.currency
       or new.subtotal_minor is distinct from old.subtotal_minor
       or new.discount_minor is distinct from old.discount_minor
       or new.taxable_minor is distinct from old.taxable_minor
       or new.tax_mode is distinct from old.tax_mode
       or new.gst_rate is distinct from old.gst_rate
       or new.cgst_minor is distinct from old.cgst_minor
       or new.sgst_minor is distinct from old.sgst_minor
       or new.igst_minor is distinct from old.igst_minor
       or new.total_minor is distinct from old.total_minor
       or new.revision is distinct from old.revision
       or new.revision_of is distinct from old.revision_of then
      raise exception 'This invoice has been issued and cannot be changed. Create a revision instead.';
    end if;
    if old.superseded_by is not null and new.superseded_by is distinct from old.superseded_by then
      raise exception 'This invoice has already been replaced by a revision.';
    end if;
    if new.status is distinct from old.status and not (
         (old.status in ('sent', 'viewed') and new.status in ('sent', 'viewed', 'partially_paid', 'paid', 'overdue', 'void'))
      or (old.status = 'partially_paid' and new.status in ('paid', 'overdue', 'void'))
      or (old.status = 'overdue' and new.status in ('partially_paid', 'paid', 'void'))
    ) then
      raise exception '%', format('An issued invoice cannot move from %s to %s.', old.status, new.status);
    end if;
    if new.amount_paid_minor < 0 or new.amount_paid_minor > new.total_minor then
      raise exception 'The amount paid must be between zero and the invoice total.';
    end if;
    if new.status = 'paid' and new.amount_paid_minor <> new.total_minor then
      raise exception 'A paid invoice must record the full amount.';
    end if;
    if new.status = 'partially_paid' and (new.amount_paid_minor <= 0 or new.amount_paid_minor >= new.total_minor) then
      raise exception 'A partly paid invoice needs an amount above zero and below the total.';
    end if;
  end if;

  if new.document is not null then
    if (tg_op = 'INSERT' or new.document is distinct from old.document
        or new.issued_at is distinct from old.issued_at or new.revision_of is distinct from old.revision_of)
       and not public.invoice_rpc_active() then
      raise exception 'Use the Invoice Generator to change this invoice.';
    end if;
    if new.issued_at is null and new.status <> 'draft' then
      raise exception 'Issue this invoice from the Invoice Generator first.';
    end if;
    -- Totals always come from the document, whoever wrote it.
    if tg_op = 'INSERT' or new.document is distinct from old.document then
      v_totals := public.invoice_compute(new.document);
      new.subtotal_minor := (v_totals ->> 'subtotal_minor')::bigint;
      new.discount_minor := (v_totals ->> 'discount_minor')::bigint;
      new.taxable_minor := (v_totals ->> 'taxable_minor')::bigint;
      new.cgst_minor := (v_totals ->> 'cgst_minor')::bigint;
      new.sgst_minor := (v_totals ->> 'sgst_minor')::bigint;
      new.igst_minor := (v_totals ->> 'igst_minor')::bigint;
      new.total_minor := (v_totals ->> 'total_minor')::bigint;
      new.tax_mode := new.document #>> '{tax,mode}';
      new.gst_rate := (new.document #>> '{tax,rate}')::numeric;
    end if;
  end if;

  if tg_op = 'UPDATE' then
    new.updated_at := clock_timestamp();
  end if;
  return new;
end $$;

create trigger invoices_guard_write
  before insert or update on public.invoices
  for each row execute function public.guard_invoice_write();

-- Cancel, never delete, an issued invoice. Deleting the whole client still removes its invoices:
-- during that cascade the client row is already gone.
create or replace function public.guard_invoice_delete()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.issued_at is not null and exists (select 1 from public.clients c where c.id = old.client_id) then
    raise exception 'An issued invoice cannot be deleted. Cancel it instead, so the record is kept.';
  end if;
  return old;
end $$;

create trigger invoices_guard_delete
  before delete on public.invoices
  for each row execute function public.guard_invoice_delete();

-- Generator invoices' rows are rebuilt from the document by the functions; issued ones never change.
create or replace function public.guard_invoice_items()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_invoice_id uuid;
begin
  if tg_op = 'DELETE' then v_invoice_id := old.invoice_id; else v_invoice_id := new.invoice_id; end if;
  if exists (
    select 1 from public.invoices i
     where i.id = v_invoice_id
       and (i.issued_at is not null or (i.document is not null and not public.invoice_rpc_active()))
  ) then
    raise exception 'This invoice''s rows can only be changed in the Invoice Generator, and only while it is a draft.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create trigger invoice_items_guard
  before insert or update or delete on public.invoice_items
  for each row execute function public.guard_invoice_items();

-- Every payment status change, by any route, lands in the history with who did it. Issuing is
-- left out: issue_invoice() records its own 'issued' event.
create or replace function public.log_invoice_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.issued_at is not distinct from old.issued_at
     and (new.status is distinct from old.status or new.amount_paid_minor is distinct from old.amount_paid_minor) then
    insert into public.invoice_events (invoice_id, actor_user_id, event_type, details)
    values (new.id, auth.uid(), 'status_changed', jsonb_build_object(
      'from', old.status,
      'to', new.status,
      'amount_paid_minor', new.amount_paid_minor,
      'note', nullif(coalesce(current_setting('vernex.invoice_note', true), ''), '')
    ));
  end if;
  return null;
end $$;

create trigger invoices_log_status
  after update of status, amount_paid_minor on public.invoices
  for each row execute function public.log_invoice_status();

-- ---------------------------------------------------------------------------
-- 5. Functions the app calls
-- ---------------------------------------------------------------------------

create or replace function public.rebuild_invoice_items(p_invoice_id uuid, p_document jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.invoice_items where invoice_id = p_invoice_id;
  insert into public.invoice_items (invoice_id, description, sac_code, quantity, unit_price_minor, amount_minor, position, bill_period)
  select p_invoice_id,
         trim(coalesce(l.value ->> 'description', '')),
         null,
         round((l.value ->> 'quantity')::numeric, 2),
         round((l.value ->> 'rate_minor')::numeric)::bigint,
         round(round((l.value ->> 'quantity')::numeric, 2) * round((l.value ->> 'rate_minor')::numeric))::bigint,
         l.ordinality,
         trim(coalesce(l.value ->> 'bill_period', ''))
    from jsonb_array_elements(p_document -> 'lines') with ordinality as l(value, ordinality)
   where jsonb_typeof(l.value -> 'quantity') = 'number' and jsonb_typeof(l.value -> 'rate_minor') = 'number';
end $$;

-- Creates (p_id null) or updates a draft. An empty number is filled by set_invoice_number().
create or replace function public.save_invoice_draft(
  p_id uuid, p_client_id uuid, p_project_id uuid, p_number text, p_issue_date date, p_due_date date,
  p_document jsonb, p_source_id uuid default null)
returns public.invoices language plpgsql security definer set search_path = '' as $$
declare
  v_invoice  public.invoices;
  v_number   text := trim(coalesce(p_number, ''));
  v_currency text := p_document ->> 'currency';
begin
  if not public.is_staff() or p_client_id is null or p_client_id not in (select public.my_client_ids()) then
    raise exception 'You cannot create or edit invoices for this client.' using errcode = '42501';
  end if;
  if p_project_id is not null and not exists (
    select 1 from public.projects p where p.id = p_project_id and p.client_id = p_client_id
  ) then
    raise exception 'That project belongs to a different client.';
  end if;
  if length(v_number) > 40 then
    raise exception 'The invoice number can be at most 40 characters.';
  end if;
  if p_issue_date is null or p_due_date is null then
    raise exception 'Set the invoice date and the due date.';
  end if;
  perform public.invoice_check(p_document, v_currency, p_issue_date, p_due_date, false);
  perform set_config('vernex.invoice_rpc', 'on', true);

  if p_id is null then
    insert into public.invoices (client_id, project_id, number, status, currency, issue_date, due_date, document)
    values (p_client_id, p_project_id, v_number, 'draft', v_currency, p_issue_date, p_due_date, p_document)
    returning * into v_invoice;
    insert into public.invoice_events (invoice_id, actor_user_id, event_type, details)
    values (v_invoice.id, auth.uid(), 'created',
      case when p_source_id is null then '{}'::jsonb else jsonb_build_object('copied_from', p_source_id) end);
  else
    update public.invoices
       set client_id = p_client_id,
           project_id = p_project_id,
           number = case when v_number = '' then number else v_number end,
           currency = v_currency,
           issue_date = p_issue_date,
           due_date = p_due_date,
           document = p_document
     where id = p_id and status = 'draft' and issued_at is null and document is not null
       and client_id in (select public.my_client_ids())
    returning * into v_invoice;
    if not found then
      raise exception 'Only a draft can be edited. Create a revision of an issued invoice instead.';
    end if;
    insert into public.invoice_events (invoice_id, actor_user_id, event_type)
    values (v_invoice.id, auth.uid(), 'edited');
  end if;

  perform public.rebuild_invoice_items(v_invoice.id, p_document);
  return v_invoice;
end $$;

-- Draft to issued. The content is frozen; issuing a revision cancels the invoice it replaces.
create or replace function public.issue_invoice(p_id uuid)
returns public.invoices language plpgsql security definer set search_path = '' as $$
declare
  v_invoice  public.invoices;
  v_original public.invoices;
  v_now      timestamptz := clock_timestamp();
begin
  if not public.is_staff() then
    raise exception 'Staff permission required' using errcode = '42501';
  end if;
  select * into v_invoice from public.invoices
   where id = p_id and client_id in (select public.my_client_ids()) for update;
  if not found or v_invoice.status <> 'draft' or v_invoice.document is null then
    raise exception 'Only a draft from the Invoice Generator can be issued.';
  end if;
  perform public.invoice_check(v_invoice.document, v_invoice.currency, v_invoice.issue_date, v_invoice.due_date, true);

  if v_invoice.revision_of is not null then
    select * into v_original from public.invoices where id = v_invoice.revision_of for update;
    if not found or v_original.superseded_by is not null or v_original.status not in ('sent', 'viewed', 'overdue')
       or v_original.amount_paid_minor > 0 then
      raise exception 'The invoice this revises can no longer be replaced: it was paid, cancelled or already replaced.';
    end if;
  end if;

  perform set_config('vernex.invoice_rpc', 'on', true);
  update public.invoices
     set status = 'sent',
         issued_at = v_now,
         issued_by = auth.uid(),
         issued_snapshot = jsonb_build_object(
           'number', number, 'issue_date', issue_date, 'due_date', due_date, 'currency', currency,
           'document', document, 'totals', public.invoice_compute(document))
   where id = p_id
  returning * into v_invoice;
  insert into public.invoice_events (invoice_id, actor_user_id, event_type, details, created_at)
  values (p_id, auth.uid(), 'issued', jsonb_build_object('number', v_invoice.number, 'total_minor', v_invoice.total_minor), v_now);

  if v_invoice.revision_of is not null then
    perform set_config('vernex.invoice_note', 'Replaced by revision ' || v_invoice.number, true);
    update public.invoices set status = 'void', superseded_by = p_id where id = v_invoice.revision_of;
    perform set_config('vernex.invoice_note', '', true);
    insert into public.invoice_events (invoice_id, actor_user_id, event_type, details)
    values (v_invoice.revision_of, auth.uid(), 'superseded', jsonb_build_object('superseded_by', p_id, 'number', v_invoice.number));
  end if;
  return v_invoice;
end $$;

-- A new draft revision of an issued, unpaid invoice. The original stays valid until it is issued.
create or replace function public.revise_invoice(p_id uuid)
returns public.invoices language plpgsql security definer set search_path = '' as $$
declare
  v_original public.invoices;
  v_invoice  public.invoices;
begin
  if not public.is_staff() then
    raise exception 'Staff permission required' using errcode = '42501';
  end if;
  select * into v_original from public.invoices
   where id = p_id and client_id in (select public.my_client_ids()) for update;
  if not found or v_original.issued_at is null then
    raise exception 'Only an invoice issued from the Invoice Generator can be revised.';
  end if;
  if v_original.superseded_by is not null then
    raise exception 'This invoice has already been replaced by a revision.';
  end if;
  if v_original.status not in ('sent', 'viewed', 'overdue') or v_original.amount_paid_minor > 0 then
    raise exception 'Paid, part-paid or cancelled invoices cannot be revised.';
  end if;
  if exists (select 1 from public.invoices i where i.revision_of = p_id and i.status = 'draft') then
    raise exception 'A draft revision of this invoice already exists. Open it from the invoice list.';
  end if;

  perform set_config('vernex.invoice_rpc', 'on', true);
  insert into public.invoices (client_id, project_id, milestone_id, number, status, currency, issue_date, due_date,
                               document, revision, revision_of)
  values (v_original.client_id, v_original.project_id, v_original.milestone_id,
          regexp_replace(v_original.number, '-R[0-9]+$', '') || '-R' || (v_original.revision + 1),
          'draft', v_original.currency, v_original.issue_date, v_original.due_date,
          v_original.document, v_original.revision + 1, p_id)
  returning * into v_invoice;
  perform public.rebuild_invoice_items(v_invoice.id, v_invoice.document);

  insert into public.invoice_events (invoice_id, actor_user_id, event_type, details)
  values (p_id, auth.uid(), 'revised', jsonb_build_object('revision_id', v_invoice.id, 'number', v_invoice.number)),
         (v_invoice.id, auth.uid(), 'created', jsonb_build_object('revision_of', p_id));
  return v_invoice;
end $$;

-- A person records the payment status. The guard trigger checks the move; the log trigger records it.
create or replace function public.set_invoice_payment_status(
  p_id uuid, p_status text, p_amount_paid_minor bigint default null, p_note text default null)
returns public.invoices language plpgsql security definer set search_path = '' as $$
declare
  v_invoice public.invoices;
  v_amount  bigint;
begin
  if not public.is_staff() then
    raise exception 'Staff permission required' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('sent', 'partially_paid', 'paid', 'overdue', 'void') then
    raise exception 'Choose a valid status.';
  end if;
  if length(coalesce(p_note, '')) > 500 then
    raise exception 'Keep the note under 500 characters.';
  end if;
  select * into v_invoice from public.invoices
   where id = p_id and client_id in (select public.my_client_ids()) for update;
  if not found then
    raise exception 'Invoice not found.' using errcode = 'P0002';
  end if;
  if v_invoice.status = 'draft' then
    raise exception 'Issue the invoice before recording a payment status.';
  end if;

  v_amount := case p_status
    when 'paid' then v_invoice.total_minor
    when 'partially_paid' then p_amount_paid_minor
    else v_invoice.amount_paid_minor
  end;
  if p_status = 'partially_paid' and (v_amount is null or v_amount <= 0 or v_amount >= v_invoice.total_minor) then
    raise exception 'Enter the amount received: above zero and below the invoice total.';
  end if;
  if p_status = v_invoice.status and v_amount = v_invoice.amount_paid_minor then
    raise exception 'That is already the invoice''s status.';
  end if;

  perform set_config('vernex.invoice_note', coalesce(trim(p_note), ''), true);
  update public.invoices
     set status = p_status,
         amount_paid_minor = v_amount,
         paid_at = case when p_status = 'paid' then coalesce(paid_at, clock_timestamp()) else null end
   where id = p_id
  returning * into v_invoice;
  perform set_config('vernex.invoice_note', '', true);
  return v_invoice;
end $$;

create or replace function public.save_invoice_settings(p_defaults jsonb, p_payment_mode text)
returns public.invoice_settings language plpgsql security definer set search_path = '' as $$
declare
  v_settings public.invoice_settings;
  v_mode     text := p_defaults #>> '{tax,mode}';
  v_rate     numeric;
begin
  if not public.is_staff() then
    raise exception 'Staff permission required' using errcode = '42501';
  end if;
  if p_defaults is null or jsonb_typeof(p_defaults) <> 'object'
     or coalesce(jsonb_typeof(p_defaults -> 'gst_rates'), '') <> 'array'
     or coalesce(jsonb_typeof(p_defaults -> 'company'), '') <> 'object'
     or length(p_defaults::text) > 50000 then
    raise exception 'The invoice settings could not be read. Reload the page and try again.';
  end if;
  if jsonb_array_length(p_defaults -> 'gst_rates') > 20 or exists (
    select 1 from jsonb_array_elements(p_defaults -> 'gst_rates') r
     where jsonb_typeof(r.value) <> 'number' or r.value::numeric <= 0 or r.value::numeric > 100
        or r.value::numeric <> round(r.value::numeric, 2)
  ) then
    raise exception 'GST rates must be numbers above 0 and up to 100, with at most two decimals.';
  end if;
  if v_mode is null or v_mode not in ('none', 'cgst_sgst', 'igst')
     or coalesce(jsonb_typeof(p_defaults #> '{tax,rate}'), '') <> 'number' then
    raise exception 'Choose a default GST type.';
  end if;
  v_rate := (p_defaults #>> '{tax,rate}')::numeric;
  if (v_mode = 'none' and v_rate <> 0) or (v_mode <> 'none' and not exists (
    select 1 from jsonb_array_elements(p_defaults -> 'gst_rates') r where r.value::numeric = v_rate
  )) then
    raise exception 'The default GST rate must be one of the configured rates, or 0 for no GST.';
  end if;
  if v_mode <> 'none' and p_defaults ->> 'currency' <> 'INR' then
    raise exception 'GST applies only to INR invoices. Choose "No GST" as the default for other currencies.';
  end if;
  if not public.invoice_image_ok(p_defaults #> '{company,logo}') or not public.invoice_image_ok(p_defaults #> '{payment,qr}') then
    raise exception 'An invoice image is not valid. Upload it again.';
  end if;
  if p_payment_mode is null or p_payment_mode not in ('mock', 'gateway') then
    raise exception 'Choose Mock Payment or Gateway Integration.';
  end if;
  if p_payment_mode = 'gateway' and not coalesce((select s.gateway_configured from public.invoice_settings s where s.id), false) then
    raise exception 'Gateway Integration is not configured, so Mock Payment stays on. A payment provider and its verified webhook must be set up on the server first.';
  end if;

  update public.invoice_settings
     set defaults = p_defaults, payment_mode = p_payment_mode, updated_by = auth.uid(), updated_at = clock_timestamp()
   where id
  returning * into v_settings;
  return v_settings;
end $$;

create or replace function public.save_invoice_template(p_id uuid, p_name text, p_document jsonb)
returns public.invoice_templates language plpgsql security definer set search_path = '' as $$
declare
  v_template public.invoice_templates;
begin
  if not public.is_staff() then
    raise exception 'Staff permission required' using errcode = '42501';
  end if;
  if p_name is null or length(trim(p_name)) not between 1 and 120 then
    raise exception 'Give the template a name of up to 120 characters.';
  end if;
  if p_document is null or jsonb_typeof(p_document) <> 'object' or (p_document ->> 'version') is distinct from '1'
     or length(p_document::text) > 200000
     or not public.invoice_image_ok(p_document #> '{company,logo}') or not public.invoice_image_ok(p_document #> '{payment,qr}') then
    raise exception 'The template could not be read. Reload the page and try again.';
  end if;
  if p_id is null then
    insert into public.invoice_templates (name, document, created_by)
    values (trim(p_name), p_document, auth.uid()) returning * into v_template;
  else
    update public.invoice_templates set name = trim(p_name), document = p_document, updated_at = clock_timestamp()
     where id = p_id returning * into v_template;
    if not found then raise exception 'Template not found.' using errcode = 'P0002'; end if;
  end if;
  return v_template;
end $$;

create or replace function public.delete_invoice_template(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then
    raise exception 'Staff permission required' using errcode = '42501';
  end if;
  delete from public.invoice_templates where id = p_id;
  if not found then raise exception 'Template not found.' using errcode = 'P0002'; end if;
end $$;

-- Integration point for a future payment gateway. Call it ONLY from a server-side webhook handler
-- (an Edge Function holding the service_role key) AFTER verifying the provider's signature over the
-- raw request body. It refuses to run until invoice_settings says a gateway is configured and on,
-- and each provider payment id counts once, so a replayed webhook changes nothing.
create or replace function public.record_gateway_payment(
  p_invoice_id uuid, p_provider text, p_provider_payment_id text, p_amount_minor bigint, p_currency text)
returns public.invoices language plpgsql security definer set search_path = '' as $$
declare
  v_invoice  public.invoices;
  v_settings public.invoice_settings;
  v_paid     bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into v_settings from public.invoice_settings where id;
  if v_settings.payment_mode <> 'gateway' or not v_settings.gateway_configured then
    raise exception 'Gateway payments are disabled: the portal is in Mock Payment mode.';
  end if;
  if exists (select 1 from public.invoice_payments p where p.provider = p_provider and p.provider_payment_id = p_provider_payment_id) then
    select * into v_invoice from public.invoices where id = p_invoice_id;
    return v_invoice;
  end if;
  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found or v_invoice.status not in ('sent', 'viewed', 'partially_paid', 'overdue') then
    raise exception 'This invoice is not open for payment.';
  end if;
  if p_amount_minor is null or p_amount_minor <= 0 or p_currency is distinct from v_invoice.currency then
    raise exception 'The payment amount or currency does not match the invoice.';
  end if;
  v_paid := v_invoice.amount_paid_minor + p_amount_minor;
  if v_paid > v_invoice.total_minor then
    raise exception 'The payment is more than the amount due. Review it by hand.';
  end if;

  insert into public.invoice_payments (invoice_id, provider, provider_payment_id, amount_minor, currency)
  values (p_invoice_id, p_provider, p_provider_payment_id, p_amount_minor, p_currency);
  perform set_config('vernex.invoice_note', format('Verified %s payment %s', p_provider, p_provider_payment_id), true);
  update public.invoices
     set amount_paid_minor = v_paid,
         status = case when v_paid = total_minor then 'paid' else 'partially_paid' end,
         paid_at = case when v_paid = total_minor then clock_timestamp() else paid_at end
   where id = p_invoice_id
  returning * into v_invoice;
  perform set_config('vernex.invoice_note', '', true);
  insert into public.invoice_events (invoice_id, actor_user_id, event_type, details)
  values (p_invoice_id, null, 'payment_recorded', jsonb_build_object(
    'provider', p_provider, 'provider_payment_id', p_provider_payment_id, 'amount_minor', p_amount_minor));
  return v_invoice;
end $$;

revoke all on function public.invoice_compute(jsonb) from public, anon;
revoke all on function public.invoice_image_ok(jsonb) from public, anon;
revoke all on function public.invoice_check(jsonb, text, date, date, boolean) from public, anon, authenticated;
revoke all on function public.invoice_rpc_active() from public, anon;
revoke all on function public.rebuild_invoice_items(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.save_invoice_draft(uuid, uuid, uuid, text, date, date, jsonb, uuid) from public, anon;
revoke all on function public.issue_invoice(uuid) from public, anon;
revoke all on function public.revise_invoice(uuid) from public, anon;
revoke all on function public.set_invoice_payment_status(uuid, text, bigint, text) from public, anon;
revoke all on function public.save_invoice_settings(jsonb, text) from public, anon;
revoke all on function public.save_invoice_template(uuid, text, jsonb) from public, anon;
revoke all on function public.delete_invoice_template(uuid) from public, anon;
revoke all on function public.record_gateway_payment(uuid, text, text, bigint, text) from public, anon, authenticated;
-- The guard triggers run as the signed-in user, so they need these two.
grant execute on function public.invoice_compute(jsonb) to authenticated;
grant execute on function public.invoice_rpc_active() to authenticated;
grant execute on function public.save_invoice_draft(uuid, uuid, uuid, text, date, date, jsonb, uuid) to authenticated;
grant execute on function public.issue_invoice(uuid) to authenticated;
grant execute on function public.revise_invoice(uuid) to authenticated;
grant execute on function public.set_invoice_payment_status(uuid, text, bigint, text) to authenticated;
grant execute on function public.save_invoice_settings(jsonb, text) to authenticated;
grant execute on function public.save_invoice_template(uuid, text, jsonb) to authenticated;
grant execute on function public.delete_invoice_template(uuid) to authenticated;
grant execute on function public.record_gateway_payment(uuid, text, text, bigint, text) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Private storage for invoice logos and QR images
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('invoice-assets', 'invoice-assets', false, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Staff upload under a fresh random name. There is no update or delete policy: an issued invoice
-- may point at an image, so replacing or removing one only changes which file new invoices use.
create policy invoice_assets_staff_upload on storage.objects for insert to authenticated with check (
  bucket_id = 'invoice-assets' and public.is_staff()
  and name ~ '^branding/(logo|qr)-[0-9a-f-]{36}\.(png|jpg|webp)$'
);

-- Staff read any; a client only the images on their own issued invoices.
create policy invoice_assets_read on storage.objects for select to authenticated using (
  bucket_id = 'invoice-assets' and (
    public.is_staff()
    or exists (
      select 1 from public.invoices i
       where i.status <> 'draft' and i.client_id in (select public.my_client_ids())
         and (i.document #>> '{company,logo,path}' = objects.name or i.document #>> '{payment,qr,path}' = objects.name)
    )
  )
);

commit;
