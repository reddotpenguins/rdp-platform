-- RDP staff scheduling Phase 1.
-- Run after supabase/auth-and-roles.sql. This replaces the browser-only schedule prototype
-- with organisation-scoped scheduling tables, admin-only RLS, weekly publishing, templates,
-- availability, and conflict-ready shift assignments.

create extension if not exists pgcrypto;

create table if not exists public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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

insert into public.organisations (name, slug)
values ('Red Dot Penguins', 'red-dot-penguins')
on conflict (slug) do nothing;

alter table public.staff_profiles
  add column if not exists organisation_id uuid references public.organisations(id) on delete restrict;

with default_org as (
  select id from public.organisations where slug = 'red-dot-penguins' limit 1
)
update public.staff_profiles
set organisation_id = default_org.id
from default_org
where organisation_id is null;

create or replace function public.set_staff_profile_default_organisation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.organisation_id is null then
    select id
    into new.organisation_id
    from public.organisations
    where slug = 'red-dot-penguins'
    limit 1;
  end if;

  return new;
end;
$$;

drop trigger if exists set_staff_profile_default_organisation on public.staff_profiles;
create trigger set_staff_profile_default_organisation
before insert or update of organisation_id on public.staff_profiles
for each row
execute function public.set_staff_profile_default_organisation();

alter table public.staff_profiles
  alter column organisation_id set not null;

create or replace function public.current_staff_organisation_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select organisation_id
  from public.staff_profiles
  where id = auth.uid()
    and active = true
  limit 1
$$;

create or replace function public.current_staff_can_manage_schedules()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_staff_role() = 'admin'
$$;

revoke all on function public.current_staff_organisation_id() from public;
revoke all on function public.current_staff_can_manage_schedules() from public;
grant execute on function public.current_staff_organisation_id() to authenticated;
grant execute on function public.current_staff_can_manage_schedules() to authenticated;

create table if not exists public.schedule_departments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.schedule_programmes (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.work_locations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  short_name text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  geofence_radius_meters integer not null default 150 check (geofence_radius_meters > 0),
  early_clock_in_minutes integer not null default 15 check (early_clock_in_minutes >= 0),
  late_clock_in_minutes integer not null default 15 check (late_clock_in_minutes >= 0),
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.qualifications (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  description text,
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.staff_qualifications (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  staff_profile_id uuid not null references public.staff_profiles(id) on delete cascade,
  qualification_id uuid not null references public.qualifications(id) on delete cascade,
  awarded_at date,
  expires_at date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_profile_id, qualification_id)
);

create table if not exists public.staff_availability (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  staff_profile_id uuid not null references public.staff_profiles(id) on delete cascade,
  weekday integer not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  availability_status text not null default 'available'
    check (availability_status in ('available', 'preferred', 'unavailable')),
  effective_from date,
  effective_to date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time)
);

create table if not exists public.staff_unavailable_periods (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  staff_profile_id uuid not null references public.staff_profiles(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  status text not null default 'approved'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  created_by uuid references public.staff_profiles(id) on delete set null,
  reviewed_by uuid references public.staff_profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.schedule_weeks (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  week_start_date date not null,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'completed', 'cancelled')),
  notes text,
  version integer not null default 1 check (version > 0),
  published_by uuid references public.staff_profiles(id) on delete set null,
  published_at timestamptz,
  created_by uuid references public.staff_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, week_start_date)
);

create table if not exists public.schedule_templates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  description text,
  active boolean not null default true,
  created_by uuid references public.staff_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.schedule_template_shifts (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.schedule_templates(id) on delete cascade,
  day_offset integer not null check (day_offset between 0 and 6),
  work_location_id uuid references public.work_locations(id) on delete set null,
  department_id uuid references public.schedule_departments(id) on delete set null,
  programme_id uuid references public.schedule_programmes(id) on delete set null,
  assigned_staff_profile_id uuid references public.staff_profiles(id) on delete set null,
  title text not null,
  session_label text,
  start_time time not null,
  end_time time not null,
  required_role text check (required_role in ('admin', 'lead_coach', 'coach')),
  required_qualification_id uuid references public.qualifications(id) on delete set null,
  required_manpower integer not null default 1 check (required_manpower > 0),
  colour text not null default '#f26a2e',
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.schedule_shifts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  schedule_week_id uuid not null references public.schedule_weeks(id) on delete cascade,
  work_location_id uuid references public.work_locations(id) on delete set null,
  department_id uuid references public.schedule_departments(id) on delete set null,
  programme_id uuid references public.schedule_programmes(id) on delete set null,
  title text not null,
  session_label text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  required_role text check (required_role in ('admin', 'lead_coach', 'coach')),
  required_qualification_id uuid references public.qualifications(id) on delete set null,
  required_manpower integer not null default 1 check (required_manpower > 0),
  colour text not null default '#f26a2e',
  status text not null default 'draft'
    check (status in ('draft', 'published', 'completed', 'cancelled')),
  notes text,
  version integer not null default 1 check (version > 0),
  created_by uuid references public.staff_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.schedule_shift_assignments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  shift_id uuid not null references public.schedule_shifts(id) on delete cascade,
  staff_profile_id uuid not null references public.staff_profiles(id) on delete restrict,
  status text not null default 'assigned'
    check (status in ('assigned', 'acknowledged', 'declined', 'removed')),
  acknowledged_at timestamptz,
  created_by uuid references public.staff_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shift_id, staff_profile_id)
);

create table if not exists public.schedule_change_requests (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  shift_id uuid not null references public.schedule_shifts(id) on delete cascade,
  requester_staff_id uuid not null references public.staff_profiles(id) on delete restrict,
  request_type text not null check (request_type in ('change', 'give_up', 'exchange', 'claim_open_shift')),
  target_staff_id uuid references public.staff_profiles(id) on delete set null,
  reason text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by uuid references public.staff_profiles(id) on delete set null,
  reviewer_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists schedule_departments_org_sort_idx
  on public.schedule_departments (organisation_id, sort_order, lower(name));

create index if not exists schedule_programmes_org_sort_idx
  on public.schedule_programmes (organisation_id, sort_order, lower(name));

create index if not exists work_locations_org_sort_idx
  on public.work_locations (organisation_id, sort_order, lower(name));

create index if not exists schedule_weeks_org_week_idx
  on public.schedule_weeks (organisation_id, week_start_date desc);

create index if not exists schedule_shifts_week_starts_idx
  on public.schedule_shifts (schedule_week_id, starts_at);

create index if not exists schedule_shifts_org_status_idx
  on public.schedule_shifts (organisation_id, status, starts_at);

create index if not exists schedule_shift_assignments_staff_idx
  on public.schedule_shift_assignments (staff_profile_id, created_at desc);

create index if not exists staff_unavailable_periods_staff_period_idx
  on public.staff_unavailable_periods (staff_profile_id, starts_at, ends_at);

create unique index if not exists schedule_departments_org_lower_name_key
  on public.schedule_departments (organisation_id, lower(name));

create unique index if not exists schedule_programmes_org_lower_name_key
  on public.schedule_programmes (organisation_id, lower(name));

create unique index if not exists work_locations_org_lower_name_key
  on public.work_locations (organisation_id, lower(name));

create unique index if not exists qualifications_org_lower_name_key
  on public.qualifications (organisation_id, lower(name));

create unique index if not exists schedule_templates_org_lower_name_key
  on public.schedule_templates (organisation_id, lower(name))
  where active = true;

create or replace function public.set_scheduling_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_schedule_departments_updated_at on public.schedule_departments;
create trigger set_schedule_departments_updated_at
before update on public.schedule_departments
for each row execute function public.set_scheduling_updated_at();

drop trigger if exists set_schedule_programmes_updated_at on public.schedule_programmes;
create trigger set_schedule_programmes_updated_at
before update on public.schedule_programmes
for each row execute function public.set_scheduling_updated_at();

drop trigger if exists set_work_locations_updated_at on public.work_locations;
create trigger set_work_locations_updated_at
before update on public.work_locations
for each row execute function public.set_scheduling_updated_at();

drop trigger if exists set_qualifications_updated_at on public.qualifications;
create trigger set_qualifications_updated_at
before update on public.qualifications
for each row execute function public.set_scheduling_updated_at();

drop trigger if exists set_staff_qualifications_updated_at on public.staff_qualifications;
create trigger set_staff_qualifications_updated_at
before update on public.staff_qualifications
for each row execute function public.set_scheduling_updated_at();

drop trigger if exists set_staff_availability_updated_at on public.staff_availability;
create trigger set_staff_availability_updated_at
before update on public.staff_availability
for each row execute function public.set_scheduling_updated_at();

drop trigger if exists set_staff_unavailable_periods_updated_at on public.staff_unavailable_periods;
create trigger set_staff_unavailable_periods_updated_at
before update on public.staff_unavailable_periods
for each row execute function public.set_scheduling_updated_at();

drop trigger if exists set_schedule_weeks_updated_at on public.schedule_weeks;
create trigger set_schedule_weeks_updated_at
before update on public.schedule_weeks
for each row execute function public.set_scheduling_updated_at();

drop trigger if exists set_schedule_templates_updated_at on public.schedule_templates;
create trigger set_schedule_templates_updated_at
before update on public.schedule_templates
for each row execute function public.set_scheduling_updated_at();

drop trigger if exists set_schedule_shifts_updated_at on public.schedule_shifts;
create trigger set_schedule_shifts_updated_at
before update on public.schedule_shifts
for each row execute function public.set_scheduling_updated_at();

drop trigger if exists set_schedule_shift_assignments_updated_at on public.schedule_shift_assignments;
create trigger set_schedule_shift_assignments_updated_at
before update on public.schedule_shift_assignments
for each row execute function public.set_scheduling_updated_at();

drop trigger if exists set_schedule_change_requests_updated_at on public.schedule_change_requests;
create trigger set_schedule_change_requests_updated_at
before update on public.schedule_change_requests
for each row execute function public.set_scheduling_updated_at();

with org as (
  select id from public.organisations where slug = 'red-dot-penguins' limit 1
)
insert into public.schedule_departments (organisation_id, name, sort_order)
select org.id, seed.name, seed.sort_order
from org
cross join (
  values
    ('Learn to Swim', 10),
    ('Race Team', 20),
    ('Training', 30),
    ('Operations', 40)
) as seed(name, sort_order)
on conflict do nothing;

with org as (
  select id from public.organisations where slug = 'red-dot-penguins' limit 1
)
insert into public.schedule_programmes (organisation_id, name, sort_order)
select org.id, seed.name, seed.sort_order
from org
cross join (
  values
    ('Learn to Swim', 10),
    ('Race Team', 20),
    ('Baby Class', 30),
    ('Social Swim Club', 40)
) as seed(name, sort_order)
on conflict do nothing;

with org as (
  select id from public.organisations where slug = 'red-dot-penguins' limit 1
)
insert into public.work_locations (
  organisation_id,
  name,
  short_name,
  geofence_radius_meters,
  sort_order
)
select org.id, seed.name, seed.short_name, 150, seed.sort_order
from org
cross join (
  values
    ('Dhoby Ghaut', 'Dhoby Ghaut', 10),
    ('Caldecott', 'Caldecott', 20),
    ('Siglap', 'Siglap', 30),
    ('Bt Timah', 'Bt Timah', 40)
) as seed(name, short_name, sort_order)
on conflict do nothing;

alter table public.schedule_departments enable row level security;
alter table public.schedule_programmes enable row level security;
alter table public.work_locations enable row level security;
alter table public.qualifications enable row level security;
alter table public.staff_qualifications enable row level security;
alter table public.staff_availability enable row level security;
alter table public.staff_unavailable_periods enable row level security;
alter table public.schedule_weeks enable row level security;
alter table public.schedule_templates enable row level security;
alter table public.schedule_template_shifts enable row level security;
alter table public.schedule_shifts enable row level security;
alter table public.schedule_shift_assignments enable row level security;
alter table public.schedule_change_requests enable row level security;
alter table public.organisations enable row level security;
alter table public.audit_events enable row level security;

drop policy if exists "Active staff read scheduling organisations" on public.organisations;
create policy "Active staff read scheduling organisations"
on public.organisations for select to authenticated
using (
  active = true
  and id = public.current_staff_organisation_id()
);

drop policy if exists "Admins manage schedule departments" on public.schedule_departments;
create policy "Admins manage schedule departments"
on public.schedule_departments for all to authenticated
using (
  public.current_staff_can_manage_schedules()
  and organisation_id = public.current_staff_organisation_id()
)
with check (
  public.current_staff_can_manage_schedules()
  and organisation_id = public.current_staff_organisation_id()
);

drop policy if exists "Admins manage schedule programmes" on public.schedule_programmes;
create policy "Admins manage schedule programmes"
on public.schedule_programmes for all to authenticated
using (
  public.current_staff_can_manage_schedules()
  and organisation_id = public.current_staff_organisation_id()
)
with check (
  public.current_staff_can_manage_schedules()
  and organisation_id = public.current_staff_organisation_id()
);

drop policy if exists "Admins manage work locations" on public.work_locations;
create policy "Admins manage work locations"
on public.work_locations for all to authenticated
using (
  public.current_staff_can_manage_schedules()
  and organisation_id = public.current_staff_organisation_id()
)
with check (
  public.current_staff_can_manage_schedules()
  and organisation_id = public.current_staff_organisation_id()
);

drop policy if exists "Admins manage qualifications" on public.qualifications;
create policy "Admins manage qualifications"
on public.qualifications for all to authenticated
using (
  public.current_staff_can_manage_schedules()
  and organisation_id = public.current_staff_organisation_id()
)
with check (
  public.current_staff_can_manage_schedules()
  and organisation_id = public.current_staff_organisation_id()
);

drop policy if exists "Admins manage staff qualifications" on public.staff_qualifications;
create policy "Admins manage staff qualifications"
on public.staff_qualifications for all to authenticated
using (
  public.current_staff_can_manage_schedules()
  and organisation_id = public.current_staff_organisation_id()
)
with check (
  public.current_staff_can_manage_schedules()
  and organisation_id = public.current_staff_organisation_id()
);

drop policy if exists "Admins manage staff availability" on public.staff_availability;
create policy "Admins manage staff availability"
on public.staff_availability for all to authenticated
using (
  public.current_staff_can_manage_schedules()
  and organisation_id = public.current_staff_organisation_id()
)
with check (
  public.current_staff_can_manage_schedules()
  and organisation_id = public.current_staff_organisation_id()
);

drop policy if exists "Admins manage staff unavailable periods" on public.staff_unavailable_periods;
create policy "Admins manage staff unavailable periods"
on public.staff_unavailable_periods for all to authenticated
using (
  public.current_staff_can_manage_schedules()
  and organisation_id = public.current_staff_organisation_id()
)
with check (
  public.current_staff_can_manage_schedules()
  and organisation_id = public.current_staff_organisation_id()
);

drop policy if exists "Admins manage schedule weeks" on public.schedule_weeks;
create policy "Admins manage schedule weeks"
on public.schedule_weeks for all to authenticated
using (
  public.current_staff_can_manage_schedules()
  and organisation_id = public.current_staff_organisation_id()
)
with check (
  public.current_staff_can_manage_schedules()
  and organisation_id = public.current_staff_organisation_id()
);

drop policy if exists "Admins manage schedule templates" on public.schedule_templates;
create policy "Admins manage schedule templates"
on public.schedule_templates for all to authenticated
using (
  public.current_staff_can_manage_schedules()
  and organisation_id = public.current_staff_organisation_id()
)
with check (
  public.current_staff_can_manage_schedules()
  and organisation_id = public.current_staff_organisation_id()
);

drop policy if exists "Admins manage schedule template shifts" on public.schedule_template_shifts;
create policy "Admins manage schedule template shifts"
on public.schedule_template_shifts for all to authenticated
using (
  public.current_staff_can_manage_schedules()
  and exists (
    select 1
    from public.schedule_templates template
    where template.id = template_id
      and template.organisation_id = public.current_staff_organisation_id()
  )
)
with check (
  public.current_staff_can_manage_schedules()
  and exists (
    select 1
    from public.schedule_templates template
    where template.id = template_id
      and template.organisation_id = public.current_staff_organisation_id()
  )
);

drop policy if exists "Admins manage schedule shifts" on public.schedule_shifts;
create policy "Admins manage schedule shifts"
on public.schedule_shifts for all to authenticated
using (
  public.current_staff_can_manage_schedules()
  and organisation_id = public.current_staff_organisation_id()
)
with check (
  public.current_staff_can_manage_schedules()
  and organisation_id = public.current_staff_organisation_id()
);

drop policy if exists "Admins manage schedule shift assignments" on public.schedule_shift_assignments;
create policy "Admins manage schedule shift assignments"
on public.schedule_shift_assignments for all to authenticated
using (
  public.current_staff_can_manage_schedules()
  and organisation_id = public.current_staff_organisation_id()
)
with check (
  public.current_staff_can_manage_schedules()
  and organisation_id = public.current_staff_organisation_id()
);

drop policy if exists "Admins manage schedule change requests" on public.schedule_change_requests;
create policy "Admins manage schedule change requests"
on public.schedule_change_requests for all to authenticated
using (
  public.current_staff_can_manage_schedules()
  and organisation_id = public.current_staff_organisation_id()
)
with check (
  public.current_staff_can_manage_schedules()
  and organisation_id = public.current_staff_organisation_id()
);

drop policy if exists "Admins read scheduling audit events" on public.audit_events;
create policy "Admins read scheduling audit events"
on public.audit_events for select to authenticated
using (
  public.current_staff_can_manage_schedules()
  and organisation_id = public.current_staff_organisation_id()
);

drop policy if exists "Admins insert scheduling audit events" on public.audit_events;
create policy "Admins insert scheduling audit events"
on public.audit_events for insert to authenticated
with check (
  public.current_staff_can_manage_schedules()
  and organisation_id = public.current_staff_organisation_id()
);

grant select on public.organisations to authenticated, service_role;
grant select, insert, update, delete on public.schedule_departments to authenticated, service_role;
grant select, insert, update, delete on public.schedule_programmes to authenticated, service_role;
grant select, insert, update, delete on public.work_locations to authenticated, service_role;
grant select, insert, update, delete on public.qualifications to authenticated, service_role;
grant select, insert, update, delete on public.staff_qualifications to authenticated, service_role;
grant select, insert, update, delete on public.staff_availability to authenticated, service_role;
grant select, insert, update, delete on public.staff_unavailable_periods to authenticated, service_role;
grant select, insert, update, delete on public.schedule_weeks to authenticated, service_role;
grant select, insert, update, delete on public.schedule_templates to authenticated, service_role;
grant select, insert, update, delete on public.schedule_template_shifts to authenticated, service_role;
grant select, insert, update, delete on public.schedule_shifts to authenticated, service_role;
grant select, insert, update, delete on public.schedule_shift_assignments to authenticated, service_role;
grant select, insert, update, delete on public.schedule_change_requests to authenticated, service_role;
grant select, insert on public.audit_events to authenticated, service_role;
