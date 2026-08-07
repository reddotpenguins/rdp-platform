-- Azure Document Intelligence receipt extraction support.
-- Run after supabase/auth-and-roles.sql and supabase/claims-foundation.sql.

alter table public.claims
add column if not exists extracted_fields jsonb not null default '{}'::jsonb,
add column if not exists field_confidences jsonb not null default '{}'::jsonb,
add column if not exists manual_review_required boolean not null default true;

alter table public.claim_receipts
add column if not exists receipt_version integer not null default 1,
add column if not exists extraction_provider text,
add column if not exists extraction_attempt_id uuid,
add column if not exists extraction_error text,
add column if not exists extracted_fields jsonb not null default '{}'::jsonb,
add column if not exists field_confidences jsonb not null default '{}'::jsonb,
add column if not exists manual_review_required boolean not null default true;

create unique index if not exists claim_receipts_claim_version_key
  on public.claim_receipts (claim_id, receipt_version);

create index if not exists claim_receipts_attempt_idx
  on public.claim_receipts (extraction_attempt_id)
  where extraction_attempt_id is not null;

grant delete on public.claims to service_role;
grant delete on public.claim_receipts to service_role;

update storage.buckets
set
  public = false,
  file_size_limit = 4194304,
  allowed_mime_types = array['image/jpeg', 'image/png', 'application/pdf']
where id = 'claim-receipts';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'claim-receipts',
  'claim-receipts',
  false,
  4194304,
  array['image/jpeg', 'image/png', 'application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Optional maintenance query for abandoned receipt drafts.
-- Review rows before deleting; service-role automation can run this after a retention period.
--
-- select claim.id, claim.claim_reference, claim.created_at
-- from public.claims claim
-- where claim.status = 'Draft'
--   and claim.created_at < now() - interval '30 days'
--   and not exists (
--     select 1
--     from public.claim_receipts receipt
--     where receipt.claim_id = claim.id
--       and receipt.deleted_at is null
--   );
