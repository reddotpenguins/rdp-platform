-- RDP staff authentication and role policies.
-- Run this after Supabase Auth users exist, then insert staff profile rows by email.

create table if not exists public.staff_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  role text not null default 'coach',
  coach_name text,
  centre_name text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- If an earlier draft used rba, move those users to admin before tightening the check.
update public.staff_profiles
set role = 'admin'
where role = 'rba';

alter table public.staff_profiles
drop constraint if exists staff_profiles_role_check;

alter table public.staff_profiles
add constraint staff_profiles_role_check
check (role in ('admin', 'lead_coach', 'coach'));

alter table public.staff_profiles enable row level security;

create or replace function public.current_staff_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role
  from public.staff_profiles
  where id = auth.uid()
    and active = true
  limit 1
$$;

create or replace function public.current_staff_coach_name()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select coach_name
  from public.staff_profiles
  where id = auth.uid()
    and active = true
  limit 1
$$;

revoke all on function public.current_staff_role() from public;
revoke all on function public.current_staff_coach_name() from public;
grant execute on function public.current_staff_role() to authenticated;
grant execute on function public.current_staff_coach_name() to authenticated;

drop policy if exists "Users can read their own staff profile"
  on public.staff_profiles;

create policy "Users can read their own staff profile"
  on public.staff_profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "Admins can read staff profiles"
  on public.staff_profiles;

create policy "Admins can read staff profiles"
  on public.staff_profiles
  for select
  to authenticated
  using (public.current_staff_role() = 'admin');

drop policy if exists "Admins can insert staff profiles"
  on public.staff_profiles;

create policy "Admins can insert staff profiles"
  on public.staff_profiles
  for insert
  to authenticated
  with check (public.current_staff_role() = 'admin');

drop policy if exists "Admins can update staff profiles"
  on public.staff_profiles;

create policy "Admins can update staff profiles"
  on public.staff_profiles
  for update
  to authenticated
  using (public.current_staff_role() = 'admin')
  with check (public.current_staff_role() = 'admin');

grant select, insert, update on public.staff_profiles to authenticated;

create extension if not exists pgcrypto;

create table if not exists public.assessment_import_rows (
  id uuid primary key default gen_random_uuid(),
  student_code text,
  student_name text,
  year integer,
  quarter text,
  coach_name text,
  coach_email text,
  centre_name text,
  level text,
  session_label text,
  session_start text,
  session_end text,
  result text,
  notes text,
  imported_at timestamptz not null default now()
);

alter table public.assessment_import_rows
  add column if not exists student_code text,
  add column if not exists student_name text,
  add column if not exists year integer,
  add column if not exists quarter text,
  add column if not exists coach_name text,
  add column if not exists coach_email text,
  add column if not exists centre_name text,
  add column if not exists level text,
  add column if not exists session_label text,
  add column if not exists session_start text,
  add column if not exists session_end text,
  add column if not exists result text,
  add column if not exists notes text,
  add column if not exists imported_at timestamptz default now();

alter table public.assessment_import_rows enable row level security;

drop policy if exists "Authenticated users can read assessment import rows"
  on public.assessment_import_rows;

drop policy if exists "Authenticated users can insert assessment import rows"
  on public.assessment_import_rows;

drop policy if exists "Staff can read permitted assessment rows"
  on public.assessment_import_rows;

create policy "Staff can read permitted assessment rows"
  on public.assessment_import_rows
  for select
  to authenticated
  using (
    public.current_staff_role() in ('admin', 'lead_coach')
    or (
      public.current_staff_role() = 'coach'
      and (
        (
          coach_email is not null
          and lower(coach_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
        or (
          coach_email is null
          and coach_name is not null
          and public.current_staff_coach_name() is not null
          and lower(coach_name) = lower(public.current_staff_coach_name())
        )
      )
    )
  );

drop policy if exists "Admins and lead coaches can insert assessment rows"
  on public.assessment_import_rows;

create policy "Admins and lead coaches can insert assessment rows"
  on public.assessment_import_rows
  for insert
  to authenticated
  with check (public.current_staff_role() in ('admin', 'lead_coach'));

drop policy if exists "Admins and lead coaches can update assessment rows"
  on public.assessment_import_rows;

create policy "Admins and lead coaches can update assessment rows"
  on public.assessment_import_rows
  for update
  to authenticated
  using (public.current_staff_role() in ('admin', 'lead_coach'))
  with check (public.current_staff_role() in ('admin', 'lead_coach'));

drop policy if exists "Admins and lead coaches can delete assessment rows"
  on public.assessment_import_rows;

create policy "Admins and lead coaches can delete assessment rows"
  on public.assessment_import_rows
  for delete
  to authenticated
  using (public.current_staff_role() in ('admin', 'lead_coach'));

grant select, insert, update, delete on public.assessment_import_rows to authenticated;
