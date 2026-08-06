-- RDP claims management foundation.
-- Run after supabase/auth-and-roles.sql so staff_profiles and role helpers exist.

create extension if not exists pgcrypto;

do $$
begin
  create type public.claim_status as enum (
    'Draft',
    'Submitted',
    'Under Review',
    'Returned for Correction',
    'Approved',
    'Rejected',
    'Paid',
    'Cancelled'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organisational_groups (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  sort_order integer not null default 100,
  normally_gst_claimable boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.application_settings (
  organisation_id uuid primary key references public.organisations(id) on delete cascade,
  gst_tracking_enabled boolean not null default true,
  default_gst_rate numeric(5,4) not null default 0.09 check (default_gst_rate >= 0),
  organisation_gst_registered boolean not null default false,
  manual_finance_review_required boolean not null default true,
  max_receipt_size_bytes integer not null default 15728640 check (max_receipt_size_bytes > 0),
  allow_approved_amount_override boolean not null default false,
  retention_settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.claims (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  claim_reference text not null,
  claimant_staff_id uuid not null references public.staff_profiles(id) on delete restrict,
  claimant_name text not null,
  group_id uuid not null references public.organisational_groups(id) on delete restrict,
  expense_category_id uuid not null references public.expense_categories(id) on delete restrict,
  merchant_name text,
  receipt_number text,
  transaction_date date,
  transaction_time time,
  currency char(3) not null default 'SGD',
  subtotal_amount numeric(12,2) not null default 0 check (subtotal_amount >= 0),
  gst_shown_amount numeric(12,2) not null default 0 check (gst_shown_amount >= 0),
  total_spent_amount numeric(12,2) not null default 0 check (total_spent_amount >= 0),
  amount_requested numeric(12,2) not null default 0 check (amount_requested >= 0),
  gst_claimable_amount numeric(12,2) not null default 0 check (gst_claimable_amount >= 0),
  non_claimable_amount numeric(12,2) not null default 0 check (non_claimable_amount >= 0),
  business_purpose text,
  payment_method text,
  notes text,
  extraction_status text not null default 'not_started',
  extraction_review_status text not null default 'review_required',
  extraction_confidence numeric(5,4),
  status public.claim_status not null default 'Draft',
  submitted_at timestamptz,
  approver_staff_id uuid references public.staff_profiles(id) on delete set null,
  approval_comment text,
  approved_amount numeric(12,2) check (approved_amount >= 0),
  paid_at timestamptz,
  possible_duplicate boolean not null default false,
  validation_warnings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, claim_reference),
  check (gst_claimable_amount <= gst_shown_amount),
  check (amount_requested <= total_spent_amount),
  check (approved_amount is null or approved_amount <= amount_requested)
);

create table if not exists public.claim_receipts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  claim_id uuid not null references public.claims(id) on delete cascade,
  storage_bucket text not null default 'claim-receipts',
  storage_object_path text not null,
  original_filename text not null,
  safe_display_filename text not null,
  mime_type text not null,
  file_size_bytes integer not null check (file_size_bytes > 0),
  sha256_checksum text,
  uploaded_by uuid not null references public.staff_profiles(id) on delete restrict,
  uploaded_at timestamptz not null default now(),
  is_original boolean not null default true,
  extraction_status text not null default 'not_started',
  extraction_started_at timestamptz,
  extraction_completed_at timestamptz,
  extraction_model text,
  deleted_at timestamptz,
  unique (storage_bucket, storage_object_path)
);

create table if not exists public.claim_line_items (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims(id) on delete cascade,
  description text,
  quantity numeric(12,2),
  unit_amount numeric(12,2),
  line_total_amount numeric(12,2) check (line_total_amount >= 0),
  extracted boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.claim_approvals (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims(id) on delete cascade,
  approver_staff_id uuid not null references public.staff_profiles(id) on delete restrict,
  decision text not null check (decision in ('approved', 'rejected', 'returned')),
  comment text,
  approved_amount numeric(12,2) check (approved_amount >= 0),
  override_reason text,
  decided_at timestamptz not null default now()
);

create table if not exists public.claim_status_history (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims(id) on delete cascade,
  from_status public.claim_status,
  to_status public.claim_status not null,
  changed_by uuid not null references public.staff_profiles(id) on delete restrict,
  comment text,
  changed_at timestamptz not null default now()
);

create table if not exists public.claim_field_changes (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims(id) on delete cascade,
  field_name text not null,
  extracted_value text,
  previous_value text,
  new_value text,
  changed_by uuid not null references public.staff_profiles(id) on delete restrict,
  changed_at timestamptz not null default now()
);

create table if not exists public.claim_comments (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims(id) on delete cascade,
  staff_profile_id uuid not null references public.staff_profiles(id) on delete restrict,
  comment text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  actor_staff_id uuid references public.staff_profiles(id) on delete set null,
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists claims_claimant_idx on public.claims (claimant_staff_id, created_at desc);
create index if not exists claims_status_idx on public.claims (organisation_id, status, created_at desc);
create index if not exists claims_group_idx on public.claims (organisation_id, group_id);
create index if not exists claims_category_idx on public.claims (organisation_id, expense_category_id);
create index if not exists claims_transaction_idx on public.claims (organisation_id, transaction_date desc);
create index if not exists claim_receipts_claim_idx on public.claim_receipts (claim_id);
create index if not exists audit_events_org_idx on public.audit_events (organisation_id, created_at desc);
create unique index if not exists organisational_groups_org_lower_name_key
  on public.organisational_groups (organisation_id, lower(name));
create unique index if not exists expense_categories_org_lower_name_key
  on public.expense_categories (organisation_id, lower(name));

insert into public.organisations (name, slug)
values ('Red Dot Penguins', 'red-dot-penguins')
on conflict (slug) do nothing;

with org as (
  select id from public.organisations where slug = 'red-dot-penguins'
)
insert into public.application_settings (organisation_id)
select id from org
on conflict (organisation_id) do nothing;

with org as (
  select id from public.organisations where slug = 'red-dot-penguins'
)
insert into public.organisational_groups (organisation_id, name, sort_order)
select org.id, seed.name, seed.sort_order
from org
cross join (
  values
    ('Learn to Swim', 10),
    ('Race Team', 20),
    ('Learn to Coach', 30),
    ('HQ', 40),
    ('Baby Class', 50)
) as seed(name, sort_order)
on conflict do nothing;

with org as (
  select id from public.organisations where slug = 'red-dot-penguins'
)
insert into public.expense_categories (
  organisation_id,
  name,
  sort_order,
  normally_gst_claimable
)
select org.id, seed.name, seed.sort_order, seed.normally_gst_claimable
from org
cross join (
  values
    ('Equipment', 10, true),
    ('Transport', 20, false),
    ('Meals and Refreshments', 30, false),
    ('Training', 40, true),
    ('Competition', 50, true),
    ('Venue', 60, true),
    ('Office Supplies', 70, true),
    ('Marketing', 80, true),
    ('Professional Services', 90, true),
    ('Other', 100, false)
) as seed(name, sort_order, normally_gst_claimable)
on conflict do nothing;

create or replace function public.current_staff_is_active()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.staff_profiles profile
    where profile.id = auth.uid()
      and profile.active = true
  )
$$;

create or replace function public.current_staff_can_review_claims()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_staff_role() in ('admin', 'lead_coach')
$$;

create or replace function public.current_staff_can_manage_claims()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_staff_role() = 'admin'
$$;

create or replace function public.can_read_claim(target_claim_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.claims claim
    where claim.id = target_claim_id
      and (
        claim.claimant_staff_id = auth.uid()
        or public.current_staff_can_review_claims()
      )
  )
$$;

revoke all on function public.current_staff_is_active() from public;
revoke all on function public.current_staff_can_review_claims() from public;
revoke all on function public.current_staff_can_manage_claims() from public;
revoke all on function public.can_read_claim(uuid) from public;
grant execute on function public.current_staff_is_active() to authenticated;
grant execute on function public.current_staff_can_review_claims() to authenticated;
grant execute on function public.current_staff_can_manage_claims() to authenticated;
grant execute on function public.can_read_claim(uuid) to authenticated;

alter table public.organisations enable row level security;
alter table public.organisational_groups enable row level security;
alter table public.expense_categories enable row level security;
alter table public.application_settings enable row level security;
alter table public.claims enable row level security;
alter table public.claim_receipts enable row level security;
alter table public.claim_line_items enable row level security;
alter table public.claim_approvals enable row level security;
alter table public.claim_status_history enable row level security;
alter table public.claim_field_changes enable row level security;
alter table public.claim_comments enable row level security;
alter table public.audit_events enable row level security;

drop policy if exists "Active staff read organisations" on public.organisations;
create policy "Active staff read organisations"
on public.organisations for select to authenticated
using (active = true and public.current_staff_is_active());

drop policy if exists "Active staff read claim groups" on public.organisational_groups;
create policy "Active staff read claim groups"
on public.organisational_groups for select to authenticated
using ((active = true and public.current_staff_is_active()) or public.current_staff_can_manage_claims());

drop policy if exists "Admins manage claim groups" on public.organisational_groups;
create policy "Admins manage claim groups"
on public.organisational_groups for all to authenticated
using (public.current_staff_can_manage_claims())
with check (public.current_staff_can_manage_claims());

drop policy if exists "Active staff read expense categories" on public.expense_categories;
create policy "Active staff read expense categories"
on public.expense_categories for select to authenticated
using ((active = true and public.current_staff_is_active()) or public.current_staff_can_manage_claims());

drop policy if exists "Admins manage expense categories" on public.expense_categories;
create policy "Admins manage expense categories"
on public.expense_categories for all to authenticated
using (public.current_staff_can_manage_claims())
with check (public.current_staff_can_manage_claims());

drop policy if exists "Admins read claim settings" on public.application_settings;
create policy "Admins read claim settings"
on public.application_settings for select to authenticated
using (public.current_staff_can_manage_claims());

drop policy if exists "Admins update claim settings" on public.application_settings;
create policy "Admins update claim settings"
on public.application_settings for update to authenticated
using (public.current_staff_can_manage_claims())
with check (public.current_staff_can_manage_claims());

drop policy if exists "Claimants and reviewers read claims" on public.claims;
create policy "Claimants and reviewers read claims"
on public.claims for select to authenticated
using (
  claimant_staff_id = auth.uid()
  or public.current_staff_can_review_claims()
);

drop policy if exists "Active staff insert own claims" on public.claims;
create policy "Active staff insert own claims"
on public.claims for insert to authenticated
with check (
  claimant_staff_id = auth.uid()
  and public.current_staff_is_active()
);

drop policy if exists "Claimants update own editable claims" on public.claims;
create policy "Claimants update own editable claims"
on public.claims for update to authenticated
using (
  claimant_staff_id = auth.uid()
  and status in ('Draft', 'Returned for Correction')
)
with check (
  claimant_staff_id = auth.uid()
  and status in ('Draft', 'Submitted', 'Cancelled')
);

drop policy if exists "Reviewers update review claims" on public.claims;
create policy "Reviewers update review claims"
on public.claims for update to authenticated
using (
  public.current_staff_can_review_claims()
  and claimant_staff_id <> auth.uid()
)
with check (
  public.current_staff_can_review_claims()
  and claimant_staff_id <> auth.uid()
);

drop policy if exists "Read receipts for readable claims" on public.claim_receipts;
create policy "Read receipts for readable claims"
on public.claim_receipts for select to authenticated
using (public.can_read_claim(claim_id));

drop policy if exists "Claimants attach receipts to editable claims" on public.claim_receipts;
create policy "Claimants attach receipts to editable claims"
on public.claim_receipts for insert to authenticated
with check (
  uploaded_by = auth.uid()
  and exists (
    select 1
    from public.claims claim
    where claim.id = claim_id
      and claim.claimant_staff_id = auth.uid()
      and claim.status in ('Draft', 'Returned for Correction')
  )
);

drop policy if exists "Users read scoped claim line items" on public.claim_line_items;
create policy "Users read scoped claim line items"
on public.claim_line_items for select to authenticated
using (public.can_read_claim(claim_id));

drop policy if exists "Users read scoped approvals" on public.claim_approvals;
create policy "Users read scoped approvals"
on public.claim_approvals for select to authenticated
using (public.can_read_claim(claim_id));

drop policy if exists "Reviewers write approvals" on public.claim_approvals;
create policy "Reviewers write approvals"
on public.claim_approvals for insert to authenticated
with check (
  approver_staff_id = auth.uid()
  and public.current_staff_can_review_claims()
  and exists (
    select 1
    from public.claims claim
    where claim.id = claim_id
      and claim.claimant_staff_id <> auth.uid()
  )
);

drop policy if exists "Users read scoped claim status history" on public.claim_status_history;
create policy "Users read scoped claim status history"
on public.claim_status_history for select to authenticated
using (public.can_read_claim(claim_id));

drop policy if exists "Users read scoped claim field changes" on public.claim_field_changes;
create policy "Users read scoped claim field changes"
on public.claim_field_changes for select to authenticated
using (public.can_read_claim(claim_id));

drop policy if exists "Users read scoped claim comments" on public.claim_comments;
create policy "Users read scoped claim comments"
on public.claim_comments for select to authenticated
using (public.can_read_claim(claim_id));

drop policy if exists "Users add scoped claim comments" on public.claim_comments;
create policy "Users add scoped claim comments"
on public.claim_comments for insert to authenticated
with check (staff_profile_id = auth.uid() and public.can_read_claim(claim_id));

drop policy if exists "Admins read audit events" on public.audit_events;
create policy "Admins read audit events"
on public.audit_events for select to authenticated
using (public.current_staff_can_manage_claims());

grant select, insert, update on public.organisations to authenticated, service_role;
grant select, insert, update on public.organisational_groups to authenticated, service_role;
grant select, insert, update on public.expense_categories to authenticated, service_role;
grant select, update on public.application_settings to authenticated, service_role;
grant select, insert, update on public.claims to authenticated, service_role;
grant select, insert, update on public.claim_receipts to authenticated, service_role;
grant select, insert on public.claim_line_items to authenticated, service_role;
grant select, insert on public.claim_approvals to authenticated, service_role;
grant select, insert on public.claim_status_history to authenticated, service_role;
grant select, insert on public.claim_field_changes to authenticated, service_role;
grant select, insert on public.claim_comments to authenticated, service_role;
grant select, insert on public.audit_events to authenticated, service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'claim-receipts',
  'claim-receipts',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Read claim receipt objects for readable claims" on storage.objects;
create policy "Read claim receipt objects for readable claims"
on storage.objects for select to authenticated
using (
  bucket_id = 'claim-receipts'
  and exists (
    select 1
    from public.claim_receipts receipt
    where receipt.storage_bucket = bucket_id
      and receipt.storage_object_path = name
      and receipt.deleted_at is null
      and public.can_read_claim(receipt.claim_id)
  )
);

drop policy if exists "Claimants upload receipt objects to own claim path" on storage.objects;
create policy "Claimants upload receipt objects to own claim path"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'claim-receipts'
  and exists (
    select 1
    from public.claims claim
    where claim.id::text = split_part(name, '/', 3)
      and claim.organisation_id::text = split_part(name, '/', 1)
      and claim.claimant_staff_id::text = split_part(name, '/', 2)
      and claim.claimant_staff_id = auth.uid()
      and claim.status in ('Draft', 'Returned for Correction')
  )
);
