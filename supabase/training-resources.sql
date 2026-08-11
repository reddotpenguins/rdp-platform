-- Training resources library for coach-facing videos, teaching notes, and assessment criteria.
-- Run this after auth-and-roles.sql. It is safe to run more than once.

create extension if not exists pgcrypto;

create table if not exists public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.organisations (name, slug)
values ('Red Dot Penguins', 'red-dot-penguins')
on conflict (slug) do nothing;

alter table public.staff_profiles
  add column if not exists organisation_id uuid references public.organisations(id) on delete restrict;

update public.staff_profiles
set organisation_id = (
  select id from public.organisations where slug = 'red-dot-penguins' limit 1
)
where organisation_id is null;

create or replace function public.set_default_staff_organisation()
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

drop trigger if exists staff_profiles_default_organisation on public.staff_profiles;
create trigger staff_profiles_default_organisation
before insert on public.staff_profiles
for each row
execute function public.set_default_staff_organisation();

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
    and active is true
  limit 1
$$;

revoke all on function public.current_staff_organisation_id() from public;
grant execute on function public.current_staff_organisation_id() to authenticated;

create table if not exists public.training_resources (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  title text not null,
  category text not null default 'Skill Videos',
  programme text not null check (programme in ('Learn to Swim', 'Race Team', 'Baby Class', 'Social Swim Club')),
  level_label text,
  skill_type text,
  video_url text,
  description text,
  teaching_cues text,
  common_mistakes text,
  assessment_criteria text,
  status text not null default 'published' check (status in ('draft', 'published', 'archived')),
  sort_order integer not null default 100,
  created_by uuid references public.staff_profiles(id) on delete set null,
  updated_by uuid references public.staff_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.training_resources
  add column if not exists category text not null default 'Skill Videos';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'training_resources_category_check'
  ) then
    alter table public.training_resources
      add constraint training_resources_category_check
      check (category in ('Skill Videos', 'Lesson Plans', 'Assessment Criteria', 'Coach Onboarding', 'Safety & SOP', 'Programme Guides'));
  end if;
end;
$$;

create index if not exists training_resources_org_status_idx
  on public.training_resources (organisation_id, status, category, programme, level_label, sort_order);

create index if not exists training_resources_title_idx
  on public.training_resources using gin (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(category, '') || ' ' || coalesce(description, '')));

alter table public.training_resources enable row level security;

drop policy if exists "Active staff read published training resources" on public.training_resources;
create policy "Active staff read published training resources"
  on public.training_resources
  for select
  using (
    organisation_id = public.current_staff_organisation_id()
    and status = 'published'
    and public.current_staff_role() in ('admin', 'lead_coach', 'coach')
  );

drop policy if exists "Admins read all training resources" on public.training_resources;
create policy "Admins read all training resources"
  on public.training_resources
  for select
  using (
    organisation_id = public.current_staff_organisation_id()
    and public.current_staff_role() = 'admin'
  );

drop policy if exists "Admins insert training resources" on public.training_resources;
create policy "Admins insert training resources"
  on public.training_resources
  for insert
  with check (
    organisation_id = public.current_staff_organisation_id()
    and public.current_staff_role() = 'admin'
  );

drop policy if exists "Admins update training resources" on public.training_resources;
create policy "Admins update training resources"
  on public.training_resources
  for update
  using (
    organisation_id = public.current_staff_organisation_id()
    and public.current_staff_role() = 'admin'
  )
  with check (
    organisation_id = public.current_staff_organisation_id()
    and public.current_staff_role() = 'admin'
  );

drop policy if exists "Admins delete training resources" on public.training_resources;
create policy "Admins delete training resources"
  on public.training_resources
  for delete
  using (
    organisation_id = public.current_staff_organisation_id()
    and public.current_staff_role() = 'admin'
  );
