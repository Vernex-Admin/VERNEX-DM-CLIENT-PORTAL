-- Vernex Hub: Invoice Generator, part 2 (issue notices, audit names, row guards).
--
-- Builds on 20261023120000_invoice_generator.sql and is safe whether or not that one has already
-- been applied to a project, as long as the two run in order:
--   * invoice_events.actor_name: the person's name, filled on the server when the event is written.
--   * invoice_check(): description limits (1,500 characters, 30 lines) so one row always fits on an
--     A4 page, and refusal of duplicated rows.
--   * Issuing an invoice puts an "invoice due" notice on the client's Action Required list (the
--     portal's in-app notifications). Paying or cancelling it resolves the notice.
--   * One invoice item per position: line items can never be duplicated by a save.
-- Timestamps all come from the database clock and are stored in UTC (timestamptz).

begin;

alter table public.invoice_events add column if not exists actor_name text;

-- Who did it, by name, at the time. Server events (a verified webhook) have no person.
create or replace function public.fill_invoice_event_actor()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.actor_name is null and new.actor_user_id is not null then
    select nullif(trim(p.full_name), '') into new.actor_name
      from public.profiles p where p.user_id = new.actor_user_id
     order by p.created_at limit 1;
    new.actor_name := coalesce(new.actor_name, (select p.email from public.profiles p where p.user_id = new.actor_user_id limit 1));
  end if;
  if new.actor_name is null and new.actor_user_id is null and new.event_type = 'payment_recorded' then
    new.actor_name := 'Payment gateway';
  end if;
  return new;
end $$;

drop trigger if exists invoice_events_fill_actor on public.invoice_events;
create trigger invoice_events_fill_actor
  before insert on public.invoice_events
  for each row execute function public.fill_invoice_event_actor();

-- Names for events written before this migration.
update public.invoice_events e
   set actor_name = p.full_name
  from public.profiles p
 where e.actor_name is null and p.user_id = e.actor_user_id;

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

  -- Every row has its own id: a repeated one means a row was copied twice by mistake.
  if (select count(*) from jsonb_array_elements(p_document -> 'lines'))
     <> (select count(distinct l.value ->> 'id') from jsonb_array_elements(p_document -> 'lines') l) then
    raise exception 'Two rows are duplicates of each other. Delete one and save again.';
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
    if coalesce(v_line ->> 'id', '') = '' then
      raise exception 'Row % could not be read. Reload the page and try again.', v_index;
    end if;
    -- Same limits as src/lib/invoiceMath.ts: one row always fits on an A4 page.
    if length(coalesce(v_line ->> 'description', '')) > 1500
       or coalesce(array_length(string_to_array(coalesce(v_line ->> 'description', ''), E'\n'), 1), 0) > 30 then
      raise exception 'Row %: the description is too long. Keep it under 1,500 characters and 30 lines.', v_index;
    end if;
    if length(v_period) > 120 then
      raise exception 'Row %: the billing period is too long.', v_index;
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

-- The client's in-app notice when an invoice is issued, due at the end of its due date in IST.
create or replace function public.notify_invoice_issued()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.issued_at is null and new.issued_at is not null then
    insert into public.action_items (client_id, project_id, type, title, ref_type, ref_id, due_at)
    values (new.client_id, new.project_id, 'invoice_due',
            'Invoice ' || new.number || ' is due on ' || to_char(new.due_date, 'FMDD Mon YYYY'),
            'invoice', new.id, (new.due_date + time '23:59:59') at time zone 'Asia/Kolkata');
  end if;
  return null;
end $$;

drop trigger if exists invoices_notify_issued on public.invoices;
create trigger invoices_notify_issued
  after update of issued_at on public.invoices
  for each row execute function public.notify_invoice_issued();

-- Status changes: resolve the client's notice once paid or cancelled, and log every change (issuing
-- has its own 'issued' event).
create or replace function public.log_invoice_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('paid', 'void') and new.status is distinct from old.status then
    update public.action_items
       set resolved_at = clock_timestamp()
     where ref_type = 'invoice' and ref_id = new.id and resolved_at is null;
  end if;
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

-- Generator and quick-form items carry their page position from 1; older rows have 0.
create unique index if not exists invoice_items_one_per_position
  on public.invoice_items (invoice_id, position) where position > 0;

revoke all on function public.fill_invoice_event_actor() from public, anon, authenticated;
revoke all on function public.notify_invoice_issued() from public, anon, authenticated;
revoke all on function public.invoice_check(jsonb, text, date, date, boolean) from public, anon, authenticated;

commit;
