-- =============================================================================
-- EVOLAIRE Invoice Management System — initial schema
-- Run this whole file once in the Supabase SQL editor (or via the Supabase CLI).
-- =============================================================================

begin;

create extension if not exists pg_trgm;
create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Shared helpers
-- -----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Settings — exactly one row per user
-- -----------------------------------------------------------------------------

create table public.settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  business_name text not null default 'EVOLAIRE',
  logo_path text,
  email text,
  phone text,
  address text,
  bank_account_name text,
  bank_account_number text,
  bank_name text,
  bank_branch text,
  default_payment_terms text not null default 'A 40% advance payment is required to confirm the booking and commence work. The remaining 60% is payable upon completion of the agreed services or according to the agreed billing schedule.',
  currency text not null default 'LKR',
  invoice_prefix text not null default 'EVO',
  invoice_format text not null default '{prefix}-{year}-{seq}',
  next_invoice_seq integer not null default 1 check (next_invoice_seq > 0),
  default_due_days integer not null default 7 check (default_due_days >= 0),
  advance_percent numeric(5, 2) not null default 40 check (advance_percent between 0 and 100),
  tax_enabled boolean not null default false,
  discount_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint settings_user_id_key unique (user_id),
  constraint settings_currency_check check (length(trim(currency)) between 1 and 8),
  constraint settings_invoice_format_check check (invoice_format <> '')
);

comment on table public.settings is 'Business profile and invoice defaults. One row per owner.';

-- -----------------------------------------------------------------------------
-- Customers
-- -----------------------------------------------------------------------------

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  phone text,
  email text,
  address text,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_id_user_id_key unique (id, user_id)
);

create index customers_user_id_name_idx on public.customers (user_id, name);
create index customers_name_trgm_idx on public.customers using gin (name gin_trgm_ops);

-- -----------------------------------------------------------------------------
-- Invoices
-- -----------------------------------------------------------------------------

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  invoice_number text not null check (length(trim(invoice_number)) between 1 and 60),
  customer_id uuid,
  customer_name text not null default '',
  project_name text,
  invoice_date date not null default current_date,
  due_date date not null default current_date,
  status text not null default 'draft' check (status in ('draft', 'final')),
  notes text,
  payment_terms text,
  business_snapshot jsonb not null default '{}'::jsonb,
  discount_amount numeric(12, 2) not null default 0 check (discount_amount >= 0),
  tax_rate numeric(5, 2) not null default 0 check (tax_rate between 0 and 100),
  subtotal numeric(12, 2) not null default 0 check (subtotal >= 0),
  total numeric(12, 2) not null default 0 check (total >= 0),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_user_id_invoice_number_key unique (user_id, invoice_number),
  constraint invoices_id_user_id_key unique (id, user_id),
  constraint invoices_customer_fk foreign key (customer_id, user_id)
    references public.customers (id, user_id) on delete set null (customer_id),
  constraint invoices_due_date_check check (due_date >= invoice_date)
);

create index invoices_user_id_invoice_date_idx on public.invoices (user_id, invoice_date desc);
create index invoices_customer_id_idx on public.invoices (customer_id);
create index invoices_user_id_status_idx on public.invoices (user_id, status);
create index invoices_invoice_number_trgm_idx on public.invoices using gin (invoice_number gin_trgm_ops);
create index invoices_customer_name_trgm_idx on public.invoices using gin (customer_name gin_trgm_ops);

comment on column public.invoices.customer_name is 'Snapshot of the customer name at the time the invoice was created. Renaming a customer never changes existing invoices.';

-- -----------------------------------------------------------------------------
-- Invoice line items (max 14, totalled by the database)
-- -----------------------------------------------------------------------------

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  invoice_id uuid not null,
  position smallint not null check (position between 1 and 14),
  description text not null default '',
  unit numeric(12, 2) not null default 1 check (unit > 0),
  price numeric(12, 2) not null default 0 check (price >= 0),
  line_total numeric(12, 2) generated always as (unit * price) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoice_items_invoice_fk foreign key (invoice_id, user_id)
    references public.invoices (id, user_id) on delete cascade,
  constraint invoice_items_position_key unique (invoice_id, position)
);

create index invoice_items_invoice_id_idx on public.invoice_items (invoice_id);

-- -----------------------------------------------------------------------------
-- Payments
-- -----------------------------------------------------------------------------

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  invoice_id uuid not null,
  amount numeric(12, 2) not null check (amount > 0),
  paid_on date not null default current_date,
  method text not null default 'bank transfer' check (method in ('cash', 'bank transfer', 'card', 'other')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_invoice_fk foreign key (invoice_id, user_id)
    references public.invoices (id, user_id) on delete cascade
);

create index payments_invoice_id_idx on public.payments (invoice_id);
create index payments_user_id_paid_on_idx on public.payments (user_id, paid_on desc);

-- -----------------------------------------------------------------------------
-- updated_at triggers
-- -----------------------------------------------------------------------------

create trigger settings_set_updated_at
  before update on public.settings
  for each row execute function public.set_updated_at();

create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

create trigger invoice_items_set_updated_at
  before update on public.invoice_items
  for each row execute function public.set_updated_at();

create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Invoice number generation
-- The sequence is consumed atomically. Concurrent tabs can never receive the
-- same number, because the UPDATE takes a row lock before reading the value.
-- -----------------------------------------------------------------------------

create or replace function public.format_invoice_number(
  p_prefix text,
  p_format text,
  p_seq integer,
  p_year integer
)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select replace(
    replace(
      replace(
        coalesce(nullif(trim(p_format), ''), '{prefix}-{year}-{seq}'),
        '{prefix}', coalesce(nullif(trim(p_prefix), ''), 'EVO')
      ),
      '{year}', p_year::text
    ),
    '{seq}', lpad(p_seq::text, greatest(3, length(p_seq::text)), '0')
  );
$$;

create or replace function public.generate_invoice_number()
returns text
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_settings public.settings%rowtype;
  v_seq integer;
begin
  if v_uid is null then
    raise exception 'You must be signed in to generate an invoice number.' using errcode = '42501';
  end if;

  -- Make sure settings exist even if the new-user trigger did not run.
  insert into public.settings (user_id) values (v_uid)
  on conflict (user_id) do nothing;

  update public.settings
     set next_invoice_seq = next_invoice_seq + 1,
         updated_at = now()
   where user_id = v_uid
  returning * into v_settings;

  v_seq := v_settings.next_invoice_seq - 1;

  return public.format_invoice_number(
    v_settings.invoice_prefix,
    v_settings.invoice_format,
    v_seq,
    extract(year from current_date)::integer
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Server-side totals. The client never sends subtotal or total.
-- -----------------------------------------------------------------------------

create or replace function public.recalc_invoice_totals(p_invoice_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_subtotal numeric(12, 2);
  v_discount numeric(12, 2);
  v_tax_rate numeric(5, 2);
  v_tax_enabled boolean := false;
  v_discount_enabled boolean := false;
  v_total numeric(12, 2);
  v_paid numeric(12, 2);
begin
  -- Lock the parent so payment writes and total changes serialize.
  select i.discount_amount, i.tax_rate
    into v_discount, v_tax_rate
    from public.invoices i
   where i.id = p_invoice_id
   for update;

  -- The invoice may already have been removed.
  if not found then
    return;
  end if;

  select coalesce(sum(line_total), 0)
    into v_subtotal
    from public.invoice_items
   where invoice_id = p_invoice_id;

  select s.tax_enabled, s.discount_enabled
    into v_tax_enabled, v_discount_enabled
    from public.settings s
    join public.invoices i on i.user_id = s.user_id
   where i.id = p_invoice_id;

  v_tax_enabled := coalesce(v_tax_enabled, false);
  v_discount_enabled := coalesce(v_discount_enabled, false);

  if not v_discount_enabled then
    v_discount := 0;
  end if;

  -- A discount can never make an invoice negative.
  v_discount := least(greatest(coalesce(v_discount, 0), 0), v_subtotal);

  v_total := v_subtotal - v_discount;

  if v_tax_enabled then
    v_total := v_total + round(v_total * coalesce(v_tax_rate, 0) / 100, 2);
  end if;

  v_total := round(greatest(v_total, 0), 2);

  select coalesce(sum(amount), 0)
    into v_paid
    from public.payments
   where invoice_id = p_invoice_id;

  if v_paid > v_total then
    raise exception 'The invoice total cannot be lower than its recorded payments. Remove or adjust payments first.'
      using errcode = '23514';
  end if;

  update public.invoices
     set subtotal = round(v_subtotal, 2),
         total = v_total
   where id = p_invoice_id;
end;
$$;

create or replace function public.on_invoice_item_change()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and old.invoice_id is distinct from new.invoice_id then
    perform public.recalc_invoice_totals(old.invoice_id);
  end if;

  perform public.recalc_invoice_totals(coalesce(new.invoice_id, old.invoice_id));
  return null;
end;
$$;

create trigger invoice_items_recalculate_totals
  after insert or update or delete on public.invoice_items
  for each row execute function public.on_invoice_item_change();

create or replace function public.on_invoice_financial_change()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  perform public.recalc_invoice_totals(new.id);
  return null;
end;
$$;

create trigger invoices_recalculate_totals
  after update of discount_amount, tax_rate on public.invoices
  for each row execute function public.on_invoice_financial_change();

-- -----------------------------------------------------------------------------
-- No overpayments — enforced for inserts AND updates.
-- -----------------------------------------------------------------------------

create or replace function public.enforce_payment_total()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_total numeric(12, 2);
  v_paid numeric(12, 2);
  v_deleted_at timestamptz;
  v_remaining numeric(12, 2);
begin
  select total, deleted_at
    into v_total, v_deleted_at
    from public.invoices
   where id = new.invoice_id
     and user_id = auth.uid()
   for update;

  if not found then
    raise exception 'Invoice not found.' using errcode = 'P0002';
  end if;

  if v_deleted_at is not null then
    raise exception 'You cannot record a payment against an invoice in the trash.' using errcode = '23514';
  end if;

  select coalesce(sum(amount), 0)
    into v_paid
    from public.payments
   where invoice_id = new.invoice_id
     and id is distinct from new.id;

  v_remaining := round(v_total - v_paid, 2);

  if new.amount > v_remaining + 0.005 then
    raise exception 'Payment would exceed the outstanding balance. Outstanding balance: %.', to_char(v_remaining, 'FM999,999,999,990.00')
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger payments_prevent_overpayment
  before insert or update on public.payments
  for each row execute function public.enforce_payment_total();

-- -----------------------------------------------------------------------------
-- Business snapshot (contact + bank details as they were when issued)
-- -----------------------------------------------------------------------------

create or replace function public.current_business_snapshot()
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'business_name', coalesce(s.business_name, 'EVOLAIRE'),
        'email', coalesce(s.email, ''),
        'phone', coalesce(s.phone, ''),
        'address', coalesce(s.address, ''),
        'bank_account_name', coalesce(s.bank_account_name, ''),
        'bank_account_number', coalesce(s.bank_account_number, ''),
        'bank_name', coalesce(s.bank_name, ''),
        'bank_branch', coalesce(s.bank_branch, ''),
        'logo_path', s.logo_path
      )
      from public.settings s
      where s.user_id = auth.uid()
    ),
    '{}'::jsonb
  );
$$;

-- -----------------------------------------------------------------------------
-- Save an invoice and all of its line items in one transaction.
-- The client sends no totals; triggers calculate them.
-- -----------------------------------------------------------------------------

create or replace function public.save_invoice(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_prev_id uuid;
  v_number text;
  v_customer_id uuid;
  v_customer_name text;
  v_db_customer_name text;
  v_prev_customer_name text;
  v_project_name text;
  v_prev_project_name text;
  v_invoice_date date;
  v_due_date date;
  v_prev_invoice_date date;
  v_prev_due_date date;
  v_status text;
  v_prev_status text;
  v_notes text;
  v_prev_notes text;
  v_payment_terms text;
  v_prev_payment_terms text;
  v_default_terms text;
  v_snapshot jsonb;
  v_prev_snapshot jsonb;
  v_discount numeric(12, 2);
  v_prev_discount numeric(12, 2);
  v_tax_rate numeric(5, 2);
  v_prev_tax_rate numeric(5, 2);
  v_item jsonb;
  v_position smallint := 0;
  v_item_count integer;
  v_constraint text;
begin
  if v_uid is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  if jsonb_typeof(payload) is distinct from 'object' then
    raise exception 'Invalid invoice payload.' using errcode = '22023';
  end if;

  v_id := nullif(payload ->> 'id', '')::uuid;
  v_prev_id := v_id;

  select s.default_payment_terms
    into v_default_terms
    from public.settings s
   where s.user_id = v_uid;

  v_default_terms := coalesce(
    v_default_terms,
    'A 40% advance payment is required to confirm the booking and commence work. The remaining 60% is payable upon completion of the agreed services or according to the agreed billing schedule.'
  );

  if v_id is not null then
    select i.invoice_number,
           i.customer_name,
           i.project_name,
           i.invoice_date,
           i.due_date,
           i.status,
           i.notes,
           i.payment_terms,
           i.business_snapshot,
           i.discount_amount,
           i.tax_rate,
           i.customer_id
      into v_number,
           v_prev_customer_name,
           v_prev_project_name,
           v_prev_invoice_date,
           v_prev_due_date,
           v_prev_status,
           v_prev_notes,
           v_prev_payment_terms,
           v_prev_snapshot,
           v_prev_discount,
           v_prev_tax_rate,
           v_customer_id
      from public.invoices i
     where i.id = v_id
       and i.user_id = v_uid
       and i.deleted_at is null;

    if not found then
      raise exception 'Invoice not found, or it is in the trash.' using errcode = 'P0002';
    end if;
  end if;

  -- Invoice number ----------------------------------------------------------
  if payload ? 'invoice_number' then
    v_number := nullif(trim(payload ->> 'invoice_number'), '');
  end if;

  if v_number is null then
    v_number := public.generate_invoice_number();
  end if;

  -- Customer ----------------------------------------------------------------
  if payload ? 'customer_id' then
    v_customer_id := nullif(payload ->> 'customer_id', '')::uuid;
  end if;

  v_customer_name := nullif(trim(coalesce(payload ->> 'customer_name', '')), '');

  if v_customer_id is not null then
    select c.name into v_db_customer_name
      from public.customers c
     where c.id = v_customer_id
       and c.user_id = v_uid;

    if v_db_customer_name is null then
      raise exception 'The selected customer could not be found.' using errcode = 'P0002';
    end if;

    -- Keep the snapshot from the form if one was provided; otherwise use the
    -- customer's current name (new invoices) or the previous snapshot (updates).
    v_customer_name := coalesce(v_customer_name, v_prev_customer_name, v_db_customer_name);
  else
    v_customer_name := coalesce(v_customer_name, v_prev_customer_name, '');
  end if;

  -- Dates, status, text fields ---------------------------------------------
  v_invoice_date := coalesce(
    nullif(payload ->> 'invoice_date', '')::date,
    v_prev_invoice_date,
    current_date
  );
  v_due_date := coalesce(
    nullif(payload ->> 'due_date', '')::date,
    v_prev_due_date,
    v_invoice_date + 7
  );

  if v_due_date < v_invoice_date then
    raise exception 'The due date cannot be before the invoice date.' using errcode = '23514';
  end if;

  if payload ? 'status' then
    v_status := nullif(trim(payload ->> 'status'), '');
  else
    v_status := v_prev_status;
  end if;
  v_status := coalesce(v_status, 'draft');

  if v_status not in ('draft', 'final') then
    raise exception 'Invalid invoice status.' using errcode = '22023';
  end if;

  if v_status = 'final' and coalesce(v_customer_name, '') = '' then
    raise exception 'Please choose a customer before saving a final invoice.' using errcode = '23514';
  end if;

  if payload ? 'project_name' then
    v_project_name := nullif(trim(payload ->> 'project_name'), '');
  else
    v_project_name := v_prev_project_name;
  end if;

  if payload ? 'notes' then
    v_notes := nullif(trim(payload ->> 'notes'), '');
  else
    v_notes := v_prev_notes;
  end if;

  if payload ? 'payment_terms' then
    v_payment_terms := nullif(trim(payload ->> 'payment_terms'), '');
  else
    v_payment_terms := v_prev_payment_terms;
  end if;
  v_payment_terms := coalesce(v_payment_terms, v_default_terms);

  if payload ? 'business_snapshot'
     and jsonb_typeof(payload -> 'business_snapshot') = 'object'
     and payload -> 'business_snapshot' <> '{}'::jsonb then
    v_snapshot := payload -> 'business_snapshot';
  else
    v_snapshot := coalesce(v_prev_snapshot, public.current_business_snapshot());
  end if;

  if payload ? 'discount_amount' then
    v_discount := coalesce(nullif(payload ->> 'discount_amount', '')::numeric, 0);
  else
    v_discount := coalesce(v_prev_discount, 0);
  end if;

  if payload ? 'tax_rate' then
    v_tax_rate := coalesce(nullif(payload ->> 'tax_rate', '')::numeric, 0);
  else
    v_tax_rate := coalesce(v_prev_tax_rate, 0);
  end if;

  if v_discount < 0 then
    raise exception 'The discount cannot be negative.' using errcode = '23514';
  end if;
  if v_tax_rate < 0 or v_tax_rate > 100 then
    raise exception 'The tax rate must be between 0 and 100.' using errcode = '23514';
  end if;

  -- Write the invoice -------------------------------------------------------
  if v_prev_id is null then
    insert into public.invoices (
      user_id,
      invoice_number,
      customer_id,
      customer_name,
      project_name,
      invoice_date,
      due_date,
      status,
      notes,
      payment_terms,
      business_snapshot,
      discount_amount,
      tax_rate
    ) values (
      v_uid,
      v_number,
      v_customer_id,
      coalesce(v_customer_name, ''),
      v_project_name,
      v_invoice_date,
      v_due_date,
      v_status,
      v_notes,
      v_payment_terms,
      v_snapshot,
      v_discount,
      v_tax_rate
    )
    returning id into v_id;
  else
    update public.invoices
       set invoice_number = v_number,
           customer_id = v_customer_id,
           customer_name = coalesce(v_customer_name, ''),
           project_name = v_project_name,
           invoice_date = v_invoice_date,
           due_date = v_due_date,
           status = v_status,
           notes = v_notes,
           payment_terms = v_payment_terms,
           business_snapshot = v_snapshot,
           discount_amount = v_discount,
           tax_rate = v_tax_rate
     where id = v_id
       and user_id = v_uid
       and deleted_at is null;

    if not found then
      raise exception 'Invoice not found, or it is in the trash.' using errcode = 'P0002';
    end if;
  end if;

  -- Replace the line items atomically --------------------------------------
  if payload ? 'items' then
    if jsonb_typeof(payload -> 'items') <> 'array' then
      raise exception 'Line items must be an array.' using errcode = '22023';
    end if;

    v_item_count := jsonb_array_length(payload -> 'items');
    if v_item_count > 14 then
      raise exception 'An invoice can have at most 14 line items.' using errcode = '23514';
    end if;

    delete from public.invoice_items where invoice_id = v_id;

    for v_item in select value from jsonb_array_elements(payload -> 'items')
    loop
      -- Blank rows are only used by the UI to draw the 14-row table. They are
      -- not stored. Positions are compacted so the unique constraint holds.
      if coalesce(trim(v_item ->> 'description'), '') <> ''
         or coalesce(nullif(v_item ->> 'price', '')::numeric, 0) <> 0 then
        v_position := v_position + 1;
        insert into public.invoice_items (
          user_id, invoice_id, position, description, unit, price
        ) values (
          v_uid,
          v_id,
          v_position,
          coalesce(v_item ->> 'description', ''),
          coalesce(nullif(v_item ->> 'unit', '')::numeric, 1),
          coalesce(nullif(v_item ->> 'price', '')::numeric, 0)
        );
      end if;
    end loop;
  end if;

  -- Final authoritative recalculation.
  perform public.recalc_invoice_totals(v_id);

  return v_id;

exception
  when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'invoices_user_id_invoice_number_key' then
      raise exception 'Invoice number already exists. Please choose a different number.'
        using errcode = '23505';
    end if;
    raise;
end;
$$;

-- -----------------------------------------------------------------------------
-- Summary view — derived payment status is never stored.
-- security_invoker keeps RLS of the underlying tables in force.
-- -----------------------------------------------------------------------------

create or replace view public.invoice_summary
with (security_invoker = true)
as
select
  i.id,
  i.user_id,
  i.invoice_number,
  i.customer_id,
  i.customer_name,
  i.project_name,
  i.invoice_date,
  i.due_date,
  i.status,
  i.notes,
  i.payment_terms,
  i.business_snapshot,
  i.discount_amount,
  i.tax_rate,
  i.subtotal,
  i.total,
  i.deleted_at,
  i.created_at,
  i.updated_at,
  coalesce(p.paid, 0)::numeric(12, 2) as paid,
  (i.total - coalesce(p.paid, 0))::numeric(12, 2) as balance,
  case
    when i.status = 'draft' then 'Draft'
    when coalesce(p.paid, 0) >= i.total and i.total > 0 then 'Paid'
    when i.due_date < current_date and (i.total - coalesce(p.paid, 0)) > 0 then 'Overdue'
    when coalesce(p.paid, 0) > 0 then 'Partially Paid'
    else 'Unpaid'
  end as payment_status
from public.invoices i
left join (
  select invoice_id, sum(amount) as paid
    from public.payments
   group by invoice_id
) p on p.invoice_id = i.id;

comment on view public.invoice_summary is 'Invoices with paid / balance / derived payment status. Filter deleted_at for active rows.';

-- -----------------------------------------------------------------------------
-- Dashboard aggregates (SQL, not browser-side)
-- -----------------------------------------------------------------------------

create or replace function public.dashboard_metrics()
returns table (
  billed_this_month numeric,
  received_this_month numeric,
  total_outstanding numeric,
  overdue_count bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with final_invoices as (
    select i.id, i.total, i.invoice_date, i.due_date
      from public.invoices i
     where i.user_id = auth.uid()
       and i.status = 'final'
       and i.deleted_at is null
  ),
  paid as (
    select p.invoice_id, sum(p.amount) as amount
      from public.payments p
      join final_invoices fi on fi.id = p.invoice_id
     group by p.invoice_id
  ),
  month_start as (
    select date_trunc('month', current_date)::date as d
  )
  select
    coalesce((
      select sum(fi.total)
        from final_invoices fi, month_start ms
       where fi.invoice_date >= ms.d
         and fi.invoice_date < (ms.d + interval '1 month')::date
    ), 0)::numeric(12, 2) as billed_this_month,
    coalesce((
      select sum(p.amount)
        from public.payments p
        join final_invoices fi on fi.id = p.invoice_id
        cross join month_start ms
       where p.paid_on >= ms.d
         and p.paid_on < (ms.d + interval '1 month')::date
    ), 0)::numeric(12, 2) as received_this_month,
    coalesce((
      select sum(fi.total - coalesce(pd.amount, 0))
        from final_invoices fi
        left join paid pd on pd.invoice_id = fi.id
    ), 0)::numeric(12, 2) as total_outstanding,
    (
      select count(*)
        from final_invoices fi
        left join paid pd on pd.invoice_id = fi.id
       where fi.due_date < current_date
         and fi.total - coalesce(pd.amount, 0) > 0
    ) as overdue_count;
$$;

create or replace function public.monthly_revenue()
returns table (
  month date,
  billed numeric,
  received numeric
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with months as (
    select generate_series(
      date_trunc('month', current_date) - interval '11 months',
      date_trunc('month', current_date),
      interval '1 month'
    )::date as month
  ),
  billed as (
    select date_trunc('month', i.invoice_date)::date as month, sum(i.total) as amount
      from public.invoices i
     where i.user_id = auth.uid()
       and i.status = 'final'
       and i.deleted_at is null
     group by 1
  ),
  received as (
    select date_trunc('month', p.paid_on)::date as month, sum(p.amount) as amount
      from public.payments p
      join public.invoices i on i.id = p.invoice_id
     where i.user_id = auth.uid()
       and i.status = 'final'
       and i.deleted_at is null
     group by 1
  )
  select m.month,
         coalesce(b.amount, 0)::numeric(12, 2) as billed,
         coalesce(r.amount, 0)::numeric(12, 2) as received
    from months m
    left join billed b on b.month = m.month
    left join received r on r.month = m.month
   order by m.month;
$$;

create or replace function public.customer_stats(p_customer_id uuid)
returns table (
  invoice_count bigint,
  billed numeric,
  paid numeric,
  outstanding numeric
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with paid as (
    select p.invoice_id, sum(p.amount) as amount
      from public.payments p
     group by p.invoice_id
  )
  select
    count(i.id) as invoice_count,
    coalesce(sum(i.total), 0)::numeric(12, 2) as billed,
    coalesce(sum(coalesce(p.amount, 0)), 0)::numeric(12, 2) as paid,
    coalesce(sum(i.total - coalesce(p.amount, 0)), 0)::numeric(12, 2) as outstanding
  from public.invoices i
  left join paid p on p.invoice_id = i.id
  where i.user_id = auth.uid()
    and i.customer_id = p_customer_id
    and i.deleted_at is null
    and i.status = 'final';
$$;

-- -----------------------------------------------------------------------------
-- Sample data (the attached invoice, reproduced)
-- -----------------------------------------------------------------------------

create or replace function public.load_sample_data()
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_settings public.settings%rowtype;
  v_customer_id uuid;
  v_invoice_id uuid;
  v_snapshot jsonb;
begin
  if v_uid is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  if exists (select 1 from public.invoices where user_id = v_uid) then
    raise exception 'Sample data can only be loaded when there are no invoices.' using errcode = '23514';
  end if;

  insert into public.settings (user_id) values (v_uid)
  on conflict (user_id) do nothing;

  select * into v_settings from public.settings where user_id = v_uid;

  update public.settings
     set next_invoice_seq = greatest(next_invoice_seq, 114)
   where user_id = v_uid;

  v_snapshot := public.current_business_snapshot();

  insert into public.customers (user_id, name)
  values (v_uid, 'Maneesha Vithanage')
  returning id into v_customer_id;

  insert into public.invoices (
    user_id,
    invoice_number,
    customer_id,
    customer_name,
    project_name,
    invoice_date,
    due_date,
    status,
    payment_terms,
    business_snapshot
  ) values (
    v_uid,
    'EVO-2026-113',
    v_customer_id,
    'Maneesha Vithanage',
    'Soul of seafood',
    '2026-10-31',
    '2026-11-07',
    'final',
    v_settings.default_payment_terms,
    v_snapshot
  )
  returning id into v_invoice_id;

  insert into public.invoice_items (
    user_id, invoice_id, position, description, unit, price
  ) values (
    v_uid,
    v_invoice_id,
    1,
    'Social Media Handling - Monthly',
    1,
    35000
  );

  insert into public.payments (
    user_id, invoice_id, amount, paid_on, method, note
  ) values (
    v_uid,
    v_invoice_id,
    10000,
    '2026-10-31',
    'bank transfer',
    'Initial payment'
  );

  return v_invoice_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Full backup restore (merge). Intended for recovery into a fresh project.
-- Existing rows are never overwritten.
-- -----------------------------------------------------------------------------

create or replace function public.restore_backup(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_tables jsonb;
  v_settings jsonb;
  v_customers_count bigint;
  v_invoices_count bigint;
  v_items_count bigint;
  v_payments_count bigint;
begin
  if v_uid is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  v_tables := payload -> 'tables';
  if jsonb_typeof(v_tables) is distinct from 'object' then
    raise exception 'This does not look like an EVOLAIRE backup file.' using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(v_tables -> 'customers', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(v_tables -> 'invoices', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(v_tables -> 'invoice_items', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(v_tables -> 'payments', '[]'::jsonb)) <> 'array' then
    raise exception 'The backup file is malformed.' using errcode = '22023';
  end if;

  -- Settings (one row per user) ---------------------------------------------
  v_settings := case
    when jsonb_typeof(v_tables -> 'settings') = 'array'
      then v_tables -> 'settings' -> 0
    when jsonb_typeof(v_tables -> 'settings') = 'object'
      then v_tables -> 'settings'
    else null
  end;

  if v_settings is not null then
    insert into public.settings (
      user_id, business_name, logo_path, email, phone, address,
      bank_account_name, bank_account_number, bank_name, bank_branch,
      default_payment_terms, currency, invoice_prefix, invoice_format,
      next_invoice_seq, default_due_days, advance_percent,
      tax_enabled, discount_enabled
    ) values (
      v_uid,
      coalesce(nullif(v_settings ->> 'business_name', ''), 'EVOLAIRE'),
      nullif(v_settings ->> 'logo_path', ''),
      nullif(v_settings ->> 'email', ''),
      nullif(v_settings ->> 'phone', ''),
      nullif(v_settings ->> 'address', ''),
      nullif(v_settings ->> 'bank_account_name', ''),
      nullif(v_settings ->> 'bank_account_number', ''),
      nullif(v_settings ->> 'bank_name', ''),
      nullif(v_settings ->> 'bank_branch', ''),
      coalesce(nullif(v_settings ->> 'default_payment_terms', ''),
        'A 40% advance payment is required to confirm the booking and commence work. The remaining 60% is payable upon completion of the agreed services or according to the agreed billing schedule.'),
      coalesce(nullif(v_settings ->> 'currency', ''), 'LKR'),
      coalesce(nullif(v_settings ->> 'invoice_prefix', ''), 'EVO'),
      coalesce(nullif(v_settings ->> 'invoice_format', ''), '{prefix}-{year}-{seq}'),
      greatest(coalesce((v_settings ->> 'next_invoice_seq')::integer, 1), 1),
      greatest(coalesce((v_settings ->> 'default_due_days')::integer, 7), 0),
      least(greatest(coalesce((v_settings ->> 'advance_percent')::numeric, 40), 0), 100),
      coalesce((v_settings ->> 'tax_enabled')::boolean, false),
      coalesce((v_settings ->> 'discount_enabled')::boolean, false)
    )
    on conflict (user_id) do update set
      business_name = excluded.business_name,
      logo_path = excluded.logo_path,
      email = excluded.email,
      phone = excluded.phone,
      address = excluded.address,
      bank_account_name = excluded.bank_account_name,
      bank_account_number = excluded.bank_account_number,
      bank_name = excluded.bank_name,
      bank_branch = excluded.bank_branch,
      default_payment_terms = excluded.default_payment_terms,
      currency = excluded.currency,
      invoice_prefix = excluded.invoice_prefix,
      invoice_format = excluded.invoice_format,
      next_invoice_seq = excluded.next_invoice_seq,
      default_due_days = excluded.default_due_days,
      advance_percent = excluded.advance_percent,
      tax_enabled = excluded.tax_enabled,
      discount_enabled = excluded.discount_enabled;
  end if;

  -- Customers ---------------------------------------------------------------
  insert into public.customers (
    id, user_id, name, phone, email, address, notes, deleted_at, created_at, updated_at
  )
  select
    coalesce(nullif(c ->> 'id', '')::uuid, gen_random_uuid()),
    v_uid,
    coalesce(nullif(trim(c ->> 'name'), ''), 'Unnamed customer'),
    nullif(c ->> 'phone', ''),
    nullif(c ->> 'email', ''),
    nullif(c ->> 'address', ''),
    nullif(c ->> 'notes', ''),
    nullif(c ->> 'deleted_at', '')::timestamptz,
    coalesce(nullif(c ->> 'created_at', '')::timestamptz, now()),
    coalesce(nullif(c ->> 'updated_at', '')::timestamptz, now())
  from jsonb_array_elements(coalesce(v_tables -> 'customers', '[]'::jsonb)) c
  on conflict do nothing;

  -- Invoices ----------------------------------------------------------------
  insert into public.invoices (
    id, user_id, invoice_number, customer_id, customer_name, project_name,
    invoice_date, due_date, status, notes, payment_terms, business_snapshot,
    discount_amount, tax_rate, subtotal, total, deleted_at, created_at, updated_at
  )
  select
    coalesce(nullif(i ->> 'id', '')::uuid, gen_random_uuid()),
    v_uid,
    coalesce(nullif(trim(i ->> 'invoice_number'), ''), 'RESTORED-' || left(gen_random_uuid()::text, 8)),
    case
      when i ->> 'customer_id' is null then null
      when exists (
        select 1 from public.customers c
        where c.id = (i ->> 'customer_id')::uuid and c.user_id = v_uid
      ) then (i ->> 'customer_id')::uuid
      else null
    end,
    coalesce(i ->> 'customer_name', ''),
    nullif(i ->> 'project_name', ''),
    coalesce(nullif(i ->> 'invoice_date', '')::date, current_date),
    coalesce(nullif(i ->> 'due_date', '')::date, current_date),
    case when i ->> 'status' = 'final' then 'final' else 'draft' end,
    nullif(i ->> 'notes', ''),
    nullif(i ->> 'payment_terms', ''),
    coalesce(i -> 'business_snapshot', '{}'::jsonb),
    greatest(coalesce(nullif(i ->> 'discount_amount', '')::numeric, 0), 0),
    least(greatest(coalesce(nullif(i ->> 'tax_rate', '')::numeric, 0), 0), 100),
    greatest(coalesce(nullif(i ->> 'subtotal', '')::numeric, 0), 0),
    greatest(coalesce(nullif(i ->> 'total', '')::numeric, 0), 0),
    nullif(i ->> 'deleted_at', '')::timestamptz,
    coalesce(nullif(i ->> 'created_at', '')::timestamptz, now()),
    coalesce(nullif(i ->> 'updated_at', '')::timestamptz, now())
  from jsonb_array_elements(coalesce(v_tables -> 'invoices', '[]'::jsonb)) i
  on conflict do nothing;

  -- Items (only for invoices this user owns) --------------------------------
  insert into public.invoice_items (
    id, user_id, invoice_id, position, description, unit, price, created_at, updated_at
  )
  select
    coalesce(nullif(it ->> 'id', '')::uuid, gen_random_uuid()),
    v_uid,
    inv.id,
    (it ->> 'position')::smallint,
    coalesce(it ->> 'description', ''),
    coalesce(nullif(it ->> 'unit', '')::numeric, 1),
    coalesce(nullif(it ->> 'price', '')::numeric, 0),
    coalesce(nullif(it ->> 'created_at', '')::timestamptz, now()),
    coalesce(nullif(it ->> 'updated_at', '')::timestamptz, now())
  from jsonb_array_elements(coalesce(v_tables -> 'invoice_items', '[]'::jsonb)) it
  join public.invoices inv
    on inv.id = (it ->> 'invoice_id')::uuid
   and inv.user_id = v_uid
  where (it ->> 'position')::integer between 1 and 14
    and coalesce(nullif(it ->> 'unit', '')::numeric, 1) > 0
    and coalesce(nullif(it ->> 'price', '')::numeric, 0) >= 0
  on conflict do nothing;

  -- Payments ----------------------------------------------------------------
  begin
    insert into public.payments (
      id, user_id, invoice_id, amount, paid_on, method, note, created_at, updated_at
    )
    select
      coalesce(nullif(p ->> 'id', '')::uuid, gen_random_uuid()),
      v_uid,
      inv.id,
      (p ->> 'amount')::numeric,
      coalesce(nullif(p ->> 'paid_on', '')::date, current_date),
      case
        when p ->> 'method' in ('cash', 'bank transfer', 'card', 'other') then p ->> 'method'
        else 'other'
      end,
      nullif(p ->> 'note', ''),
      coalesce(nullif(p ->> 'created_at', '')::timestamptz, now()),
      coalesce(nullif(p ->> 'updated_at', '')::timestamptz, now())
    from jsonb_array_elements(coalesce(v_tables -> 'payments', '[]'::jsonb)) p
    join public.invoices inv
      on inv.id = (p ->> 'invoice_id')::uuid
     and inv.user_id = v_uid
    where coalesce(nullif(p ->> 'amount', '')::numeric, 0) > 0
    on conflict do nothing;
  exception
    when others then
      -- A partial merge can make a historic payment exceed a changed balance.
      -- Keep the rest of the restore rather than failing the whole import.
      raise warning 'Some payments could not be restored: %', sqlerrm;
  end;

  select count(*) into v_customers_count from public.customers where user_id = v_uid;
  select count(*) into v_invoices_count from public.invoices where user_id = v_uid;
  select count(*) into v_items_count from public.invoice_items where user_id = v_uid;
  select count(*) into v_payments_count from public.payments where user_id = v_uid;

  return jsonb_build_object(
    'customers', v_customers_count,
    'invoices', v_invoices_count,
    'invoice_items', v_items_count,
    'payments', v_payments_count
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Create default settings when a new auth user is created
-- -----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Row Level Security — every table is owner-only
-- -----------------------------------------------------------------------------

alter table public.settings enable row level security;
alter table public.customers enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments enable row level security;

create policy "settings_select_own" on public.settings
  for select to authenticated using (user_id = auth.uid());
create policy "settings_insert_own" on public.settings
  for insert to authenticated with check (user_id = auth.uid());
create policy "settings_update_own" on public.settings
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "settings_delete_own" on public.settings
  for delete to authenticated using (user_id = auth.uid());

create policy "customers_select_own" on public.customers
  for select to authenticated using (user_id = auth.uid());
create policy "customers_insert_own" on public.customers
  for insert to authenticated with check (user_id = auth.uid());
create policy "customers_update_own" on public.customers
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "customers_delete_own" on public.customers
  for delete to authenticated using (user_id = auth.uid());

create policy "invoices_select_own" on public.invoices
  for select to authenticated using (user_id = auth.uid());
create policy "invoices_insert_own" on public.invoices
  for insert to authenticated with check (user_id = auth.uid());
create policy "invoices_update_own" on public.invoices
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "invoices_delete_own" on public.invoices
  for delete to authenticated using (user_id = auth.uid());

create policy "invoice_items_select_own" on public.invoice_items
  for select to authenticated using (user_id = auth.uid());
create policy "invoice_items_insert_own" on public.invoice_items
  for insert to authenticated with check (user_id = auth.uid());
create policy "invoice_items_update_own" on public.invoice_items
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "invoice_items_delete_own" on public.invoice_items
  for delete to authenticated using (user_id = auth.uid());

create policy "payments_select_own" on public.payments
  for select to authenticated using (user_id = auth.uid());
create policy "payments_insert_own" on public.payments
  for insert to authenticated with check (user_id = auth.uid());
create policy "payments_update_own" on public.payments
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "payments_delete_own" on public.payments
  for delete to authenticated using (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- Storage: private "logos" bucket, one folder per user
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'logos',
  'logos',
  false,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Supabase already enables RLS on storage.objects; policies are scoped to the
-- owner's folder so users can only read/write their own logo.
drop policy if exists "logos_select_own" on storage.objects;
create policy "logos_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "logos_insert_own" on storage.objects;
create policy "logos_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "logos_update_own" on storage.objects;
create policy "logos_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "logos_delete_own" on storage.objects;
create policy "logos_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------

grant usage on schema public to authenticated;

grant select, insert, update, delete on public.settings to authenticated;
grant select, insert, update, delete on public.customers to authenticated;
grant select, insert, update, delete on public.invoices to authenticated;
grant select, insert, update, delete on public.invoice_items to authenticated;
grant select, insert, update, delete on public.payments to authenticated;
grant select on public.invoice_summary to authenticated;

-- RPC functions callable from the app
revoke all on function public.generate_invoice_number() from public, anon;
revoke all on function public.save_invoice(jsonb) from public, anon;
revoke all on function public.dashboard_metrics() from public, anon;
revoke all on function public.monthly_revenue() from public, anon;
revoke all on function public.customer_stats(uuid) from public, anon;
revoke all on function public.load_sample_data() from public, anon;
revoke all on function public.restore_backup(jsonb) from public, anon;

grant execute on function public.generate_invoice_number() to authenticated;
grant execute on function public.save_invoice(jsonb) to authenticated;
grant execute on function public.dashboard_metrics() to authenticated;
grant execute on function public.monthly_revenue() to authenticated;
grant execute on function public.customer_stats(uuid) to authenticated;
grant execute on function public.load_sample_data() to authenticated;
grant execute on function public.restore_backup(jsonb) to authenticated;

-- Needed by save_invoice (which runs as the signed-in user)
grant execute on function public.recalc_invoice_totals(uuid) to authenticated;
grant execute on function public.current_business_snapshot() to authenticated;
grant execute on function public.format_invoice_number(text, text, integer, integer) to authenticated;

-- Trigger functions are not directly callable through the API.
revoke all on function public.handle_new_user() from public, anon, authenticated;

commit;
