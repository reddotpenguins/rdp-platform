-- Prototype policies for the current RDP LTS dashboard.
-- Run this in Supabase SQL Editor after creating the tables.
-- These policies let signed-in users read and upload assessment import rows.
-- Tighten these later by role once admin, lead coach, and coach access is ready.

alter table public.assessment_import_rows enable row level security;

drop policy if exists "Authenticated users can read assessment import rows"
  on public.assessment_import_rows;

create policy "Authenticated users can read assessment import rows"
  on public.assessment_import_rows
  for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can insert assessment import rows"
  on public.assessment_import_rows;

create policy "Authenticated users can insert assessment import rows"
  on public.assessment_import_rows
  for insert
  to authenticated
  with check (true);

grant select, insert on public.assessment_import_rows to authenticated;
