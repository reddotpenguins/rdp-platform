-- RDP compliance log.
-- Run after supabase/auth-and-roles.sql. Safe to run after claims or scheduling SQL.

create extension if not exists pgcrypto;

create table if not exists public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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
for each row execute function public.set_staff_profile_default_organisation();

alter table public.staff_profiles
  alter column organisation_id set not null;

create or replace function public.current_staff_organisation_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organisation_id
  from public.staff_profiles
  where id = auth.uid()
    and active = true
  limit 1
$$;

revoke all on function public.current_staff_organisation_id() from public;
grant execute on function public.current_staff_organisation_id() to authenticated;

create table if not exists public.compliance_log_entries (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  logged_at timestamptz not null default now(),
  category text not null default 'Operations'
    check (category in (
      'Safeguarding',
      'Incident',
      'Data privacy',
      'Operations',
      'Finance claims',
      'Staff access',
      'Training',
      'Customer student',
      'Other'
    )),
  severity text not null default 'Medium'
    check (severity in ('Low', 'Medium', 'High', 'Critical')),
  status text not null default 'Open'
    check (status in ('Open', 'Monitoring', 'Resolved', 'Archived')),
  centre_name text,
  subject text not null,
  details text not null,
  action_taken text,
  follow_up_owner text,
  follow_up_due_date date,
  resolved_at timestamptz,
  created_by uuid references public.staff_profiles(id) on delete set null,
  updated_by uuid references public.staff_profiles(id) on delete set null,
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

create index if not exists compliance_log_org_logged_idx
  on public.compliance_log_entries (organisation_id, logged_at desc);

create index if not exists compliance_log_status_idx
  on public.compliance_log_entries (organisation_id, status, follow_up_due_date);

create index if not exists compliance_log_category_idx
  on public.compliance_log_entries (organisation_id, category, severity);

create index if not exists audit_events_org_idx
  on public.audit_events (organisation_id, created_at desc);

create or replace function public.set_compliance_log_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_compliance_log_entries_updated_at on public.compliance_log_entries;
create trigger set_compliance_log_entries_updated_at
before update on public.compliance_log_entries
for each row execute function public.set_compliance_log_updated_at();

alter table public.organisations enable row level security;
alter table public.compliance_log_entries enable row level security;
alter table public.audit_events enable row level security;

drop policy if exists "Current staff read their organisation" on public.organisations;
create policy "Current staff read their organisation"
on public.organisations for select to authenticated
using (id = public.current_staff_organisation_id());

drop policy if exists "Admins read compliance log entries" on public.compliance_log_entries;
create policy "Admins read compliance log entries"
on public.compliance_log_entries for select to authenticated
using (
  public.current_staff_role() = 'admin'
  and organisation_id = public.current_staff_organisation_id()
);

drop policy if exists "Admins insert compliance log entries" on public.compliance_log_entries;
create policy "Admins insert compliance log entries"
on public.compliance_log_entries for insert to authenticated
with check (
  public.current_staff_role() = 'admin'
  and organisation_id = public.current_staff_organisation_id()
);

drop policy if exists "Admins update compliance log entries" on public.compliance_log_entries;
create policy "Admins update compliance log entries"
on public.compliance_log_entries for update to authenticated
using (
  public.current_staff_role() = 'admin'
  and organisation_id = public.current_staff_organisation_id()
)
with check (
  public.current_staff_role() = 'admin'
  and organisation_id = public.current_staff_organisation_id()
);

drop policy if exists "Admins read compliance audit events" on public.audit_events;
create policy "Admins read compliance audit events"
on public.audit_events for select to authenticated
using (
  public.current_staff_role() = 'admin'
  and organisation_id = public.current_staff_organisation_id()
);

drop policy if exists "Admins insert compliance audit events" on public.audit_events;
create policy "Admins insert compliance audit events"
on public.audit_events for insert to authenticated
with check (
  public.current_staff_role() = 'admin'
  and organisation_id = public.current_staff_organisation_id()
);

grant select on public.organisations to authenticated, service_role;
grant select, insert, update on public.compliance_log_entries to authenticated, service_role;
grant select, insert on public.audit_events to authenticated, service_role;
