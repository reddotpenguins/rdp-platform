-- RDP scheduling, attendance, and leave foundation.
-- Run after supabase/auth-and-roles.sql.

create extension if not exists pgcrypto;

create table if not exists public.staff_schedule_shifts (
  id uuid primary key default gen_random_uuid(),
  staff_profile_id uuid not null references public.staff_profiles(id) on delete restrict,
  coach_name text not null,
  centre_name text not null,
  programme text not null,
  session_label text not null,
  shift_date date not null,
  start_time time not null,
  end_time time not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'completed', 'covered', 'cancelled')),
  expected_latitude numeric(10,7),
  expected_longitude numeric(10,7),
  geofence_radius_meters integer not null default 150 check (geofence_radius_meters > 0),
  created_by uuid references public.staff_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attendance_clock_events (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.staff_schedule_shifts(id) on delete cascade,
  staff_profile_id uuid not null references public.staff_profiles(id) on delete restrict,
  direction text not null check (direction in ('in', 'out')),
  clocked_at timestamptz not null default now(),
  latitude numeric(10,7),
  longitude numeric(10,7),
  accuracy_meters numeric(10,2),
  distance_meters integer,
  location_status text not null
    check (location_status in ('inside_geofence', 'outside_geofence', 'location_unavailable')),
  payroll_review_status text not null default 'pending'
    check (payroll_review_status in ('pending', 'approved', 'rejected')),
  payroll_review_note text,
  created_at timestamptz not null default now(),
  unique (shift_id, staff_profile_id, direction)
);

create table if not exists public.staff_leave_requests (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.staff_schedule_shifts(id) on delete cascade,
  staff_profile_id uuid not null references public.staff_profiles(id) on delete restrict,
  reason text not null,
  cover_coach_id uuid references public.staff_profiles(id) on delete set null,
  cover_coach_name text,
  cover_coach_confirmed boolean not null default false,
  lesson_plan_mode text not null default 'text' check (lesson_plan_mode in ('text', 'document')),
  lesson_plan_text text,
  lesson_plan_document_path text,
  lesson_plan_document_name text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewer_staff_id uuid references public.staff_profiles(id) on delete set null,
  reviewer_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists staff_schedule_shifts_staff_date_idx
  on public.staff_schedule_shifts (staff_profile_id, shift_date desc);

create index if not exists staff_schedule_shifts_centre_date_idx
  on public.staff_schedule_shifts (centre_name, shift_date desc);

create index if not exists attendance_clock_events_shift_idx
  on public.attendance_clock_events (shift_id, staff_profile_id);

create index if not exists staff_leave_requests_staff_status_idx
  on public.staff_leave_requests (staff_profile_id, status, created_at desc);

create or replace function public.current_staff_can_manage_schedules()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_staff_role() = 'admin'
$$;

revoke all on function public.current_staff_can_manage_schedules() from public;
grant execute on function public.current_staff_can_manage_schedules() to authenticated;

alter table public.staff_schedule_shifts enable row level security;
alter table public.attendance_clock_events enable row level security;
alter table public.staff_leave_requests enable row level security;

drop policy if exists "Staff read own shifts and admins read all shifts" on public.staff_schedule_shifts;
create policy "Staff read own shifts and admins read all shifts"
on public.staff_schedule_shifts for select to authenticated
using (
  staff_profile_id = auth.uid()
  or public.current_staff_can_manage_schedules()
);

drop policy if exists "Admins manage shifts" on public.staff_schedule_shifts;
create policy "Admins manage shifts"
on public.staff_schedule_shifts for all to authenticated
using (public.current_staff_can_manage_schedules())
with check (public.current_staff_can_manage_schedules());

drop policy if exists "Staff read own clock events and admins read all clock events" on public.attendance_clock_events;
create policy "Staff read own clock events and admins read all clock events"
on public.attendance_clock_events for select to authenticated
using (
  staff_profile_id = auth.uid()
  or public.current_staff_can_manage_schedules()
);

drop policy if exists "Staff clock own shifts" on public.attendance_clock_events;
create policy "Staff clock own shifts"
on public.attendance_clock_events for insert to authenticated
with check (
  staff_profile_id = auth.uid()
  and exists (
    select 1
    from public.staff_schedule_shifts shift
    where shift.id = shift_id
      and shift.staff_profile_id = auth.uid()
      and shift.status in ('scheduled', 'covered')
  )
);

drop policy if exists "Admins update payroll clock review" on public.attendance_clock_events;
create policy "Admins update payroll clock review"
on public.attendance_clock_events for update to authenticated
using (public.current_staff_can_manage_schedules())
with check (public.current_staff_can_manage_schedules());

drop policy if exists "Staff read own leave and admins read all leave" on public.staff_leave_requests;
create policy "Staff read own leave and admins read all leave"
on public.staff_leave_requests for select to authenticated
using (
  staff_profile_id = auth.uid()
  or public.current_staff_can_manage_schedules()
);

drop policy if exists "Staff submit own leave requests" on public.staff_leave_requests;
create policy "Staff submit own leave requests"
on public.staff_leave_requests for insert to authenticated
with check (
  staff_profile_id = auth.uid()
  and exists (
    select 1
    from public.staff_schedule_shifts shift
    where shift.id = shift_id
      and shift.staff_profile_id = auth.uid()
      and shift.status = 'scheduled'
  )
);

drop policy if exists "Admins review leave requests" on public.staff_leave_requests;
create policy "Admins review leave requests"
on public.staff_leave_requests for update to authenticated
using (public.current_staff_can_manage_schedules())
with check (public.current_staff_can_manage_schedules());

grant select, insert, update on public.staff_schedule_shifts to authenticated, service_role;
grant select, insert, update on public.attendance_clock_events to authenticated, service_role;
grant select, insert, update on public.staff_leave_requests to authenticated, service_role;
