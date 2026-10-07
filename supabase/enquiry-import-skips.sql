-- Run after auth-and-roles.sql. Does not modify customer_enquiries.
begin;

create table if not exists public.enquiry_import_skips (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  respondio_conversation_id text not null check (length(trim(respondio_conversation_id)) between 1 and 200),
  respondio_contact_id text,
  parent_name text,
  event_type text,
  event_id text,
  source_event_at timestamptz,
  error_message text not null check (length(error_message) between 1 and 10000),
  incoming_data jsonb not null check (jsonb_typeof(incoming_data) = 'object' and octet_length(incoming_data::text) <= 262144)
);

create index if not exists enquiry_import_skips_created_idx on public.enquiry_import_skips(created_at desc, id);
create index if not exists enquiry_import_skips_conversation_idx on public.enquiry_import_skips(respondio_conversation_id);

create table if not exists public.enquiry_import_skip_reviews (
  id bigint generated always as identity primary key,
  skip_id uuid not null references public.enquiry_import_skips(id),
  decision text not null check (decision in ('needs_review', 'existing_record', 'add_to_database', 'not_needed')),
  notes text not null check (length(trim(notes)) between 1 and 4000),
  reviewed_by uuid not null default auth.uid() references public.staff_profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists enquiry_import_skip_reviews_latest_idx on public.enquiry_import_skip_reviews(skip_id, id desc);

-- Evidence and review history are append-only, including for the ingestion role.
create or replace function public.reject_enquiry_skip_changes()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'Skipped import evidence and review history cannot be changed or deleted';
end;
$$;
drop trigger if exists immutable_enquiry_import_skips on public.enquiry_import_skips;
create trigger immutable_enquiry_import_skips before update or delete on public.enquiry_import_skips
for each row execute function public.reject_enquiry_skip_changes();
drop trigger if exists immutable_enquiry_import_skip_reviews on public.enquiry_import_skip_reviews;
create trigger immutable_enquiry_import_skip_reviews before update or delete on public.enquiry_import_skip_reviews
for each row execute function public.reject_enquiry_skip_changes();

alter table public.enquiry_import_skips enable row level security;
alter table public.enquiry_import_skip_reviews enable row level security;
revoke all on public.enquiry_import_skips, public.enquiry_import_skip_reviews from anon, authenticated, service_role;
grant select on public.enquiry_import_skips, public.enquiry_import_skip_reviews to authenticated;
grant insert (skip_id, decision, notes) on public.enquiry_import_skip_reviews to authenticated;
grant usage on sequence public.enquiry_import_skip_reviews_id_seq to authenticated;
grant select, insert on public.enquiry_import_skips to service_role;

drop policy if exists "Admins read skipped imports" on public.enquiry_import_skips;
create policy "Admins read skipped imports" on public.enquiry_import_skips for select to authenticated
using (public.current_staff_role() = 'admin');
drop policy if exists "Admins read skip reviews" on public.enquiry_import_skip_reviews;
create policy "Admins read skip reviews" on public.enquiry_import_skip_reviews for select to authenticated
using (public.current_staff_role() = 'admin');
drop policy if exists "Admins append skip reviews" on public.enquiry_import_skip_reviews;
create policy "Admins append skip reviews" on public.enquiry_import_skip_reviews for insert to authenticated
with check (public.current_staff_role() = 'admin' and reviewed_by = auth.uid());

create or replace view public.enquiry_import_skip_queue with (security_invoker = true) as
select s.*,
  coalesce(r.decision, 'needs_review') as decision,
  r.notes as review_notes, r.created_at as reviewed_at, r.reviewed_by,
  e.id as existing_enquiry_id,
  concat_ws(' ', s.respondio_conversation_id, s.respondio_contact_id, s.parent_name) as search_text
from public.enquiry_import_skips s
left join lateral (
  select decision, notes, created_at, reviewed_by
  from public.enquiry_import_skip_reviews where skip_id = s.id order by id desc limit 1
) r on true
left join lateral (
  select id from public.customer_enquiries
  where respondio_conversation_id = s.respondio_conversation_id
  order by created_at desc, id limit 1
) e on true;
revoke all on public.enquiry_import_skip_queue from anon, authenticated;
grant select on public.enquiry_import_skip_queue to authenticated;
notify pgrst, 'reload schema';
commit;
