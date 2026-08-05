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

create table if not exists public.staff_profile_centres (
  staff_profile_id uuid not null references public.staff_profiles(id) on delete cascade,
  centre_name text not null,
  created_at timestamptz not null default now(),
  primary key (staff_profile_id, centre_name)
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

insert into public.staff_profile_centres (staff_profile_id, centre_name)
select id, trim(centre_name)
from public.staff_profiles
where role = 'lead_coach'
  and centre_name is not null
  and trim(centre_name) <> ''
on conflict do nothing;

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

create or replace function public.current_staff_has_centre(target_centre text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.staff_profile_centres centres
    join public.staff_profiles profile
      on profile.id = centres.staff_profile_id
    where centres.staff_profile_id = auth.uid()
      and profile.active = true
      and profile.role = 'lead_coach'
      and target_centre is not null
      and lower(trim(centres.centre_name)) = lower(trim(target_centre))
  )
$$;

revoke all on function public.current_staff_role() from public;
revoke all on function public.current_staff_coach_name() from public;
revoke all on function public.current_staff_has_centre(text) from public;
grant execute on function public.current_staff_role() to authenticated;
grant execute on function public.current_staff_coach_name() to authenticated;
grant execute on function public.current_staff_has_centre(text) to authenticated;

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

drop policy if exists "Admins can delete staff profiles"
  on public.staff_profiles;

create policy "Admins can delete staff profiles"
  on public.staff_profiles
  for delete
  to authenticated
  using (
    public.current_staff_role() = 'admin'
    and id <> (select auth.uid())
  );

grant select, insert, update, delete on public.staff_profiles to authenticated;

alter table public.staff_profile_centres enable row level security;

drop policy if exists "Users can read their assigned centres"
  on public.staff_profile_centres;

create policy "Users can read their assigned centres"
  on public.staff_profile_centres
  for select
  to authenticated
  using ((select auth.uid()) = staff_profile_id);

drop policy if exists "Admins can read staff centre assignments"
  on public.staff_profile_centres;

create policy "Admins can read staff centre assignments"
  on public.staff_profile_centres
  for select
  to authenticated
  using (public.current_staff_role() = 'admin');

drop policy if exists "Admins can insert staff centre assignments"
  on public.staff_profile_centres;

create policy "Admins can insert staff centre assignments"
  on public.staff_profile_centres
  for insert
  to authenticated
  with check (public.current_staff_role() = 'admin');

drop policy if exists "Admins can update staff centre assignments"
  on public.staff_profile_centres;

create policy "Admins can update staff centre assignments"
  on public.staff_profile_centres
  for update
  to authenticated
  using (public.current_staff_role() = 'admin')
  with check (public.current_staff_role() = 'admin');

drop policy if exists "Admins can delete staff centre assignments"
  on public.staff_profile_centres;

create policy "Admins can delete staff centre assignments"
  on public.staff_profile_centres
  for delete
  to authenticated
  using (public.current_staff_role() = 'admin');

grant select, insert, update, delete on public.staff_profile_centres to authenticated;

create or replace function public.admin_upsert_staff_profile(
  target_email text,
  target_full_name text,
  target_role text default 'coach',
  target_coach_name text default null,
  target_centre_name text default null,
  target_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_id uuid;
begin
  if coalesce(public.current_staff_role(), '') <> 'admin' then
    raise exception 'Only admins can manage staff profiles.';
  end if;

  if target_role not in ('admin', 'lead_coach', 'coach') then
    raise exception 'Invalid staff role.';
  end if;

  select id
  into target_user_id
  from auth.users
  where lower(email) = lower(trim(target_email))
  limit 1;

  if target_user_id is null then
    raise exception 'No Supabase Auth user found for this email.';
  end if;

  if target_user_id = auth.uid() and (target_role <> 'admin' or target_active is false) then
    raise exception 'You cannot remove admin access from your own account.';
  end if;

  insert into public.staff_profiles (
    id,
    email,
    full_name,
    role,
    coach_name,
    centre_name,
    active
  )
  values (
    target_user_id,
    lower(trim(target_email)),
    trim(target_full_name),
    target_role,
    nullif(trim(target_coach_name), ''),
    nullif(trim(target_centre_name), ''),
    target_active
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    role = excluded.role,
    coach_name = excluded.coach_name,
    centre_name = excluded.centre_name,
    active = excluded.active;

  return target_user_id;
end;
$$;

revoke all on function public.admin_upsert_staff_profile(
  text,
  text,
  text,
  text,
  text,
  boolean
) from public;

grant execute on function public.admin_upsert_staff_profile(
  text,
  text,
  text,
  text,
  text,
  boolean
) to authenticated;

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
    public.current_staff_role() = 'admin'
    or (
      public.current_staff_role() = 'lead_coach'
      and public.current_staff_has_centre(centre_name)
    )
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
  with check (
    public.current_staff_role() = 'admin'
    or (
      public.current_staff_role() = 'lead_coach'
      and public.current_staff_has_centre(centre_name)
    )
  );

drop policy if exists "Admins and lead coaches can update assessment rows"
  on public.assessment_import_rows;

create policy "Admins and lead coaches can update assessment rows"
  on public.assessment_import_rows
  for update
  to authenticated
  using (
    public.current_staff_role() = 'admin'
    or (
      public.current_staff_role() = 'lead_coach'
      and public.current_staff_has_centre(centre_name)
    )
  )
  with check (
    public.current_staff_role() = 'admin'
    or (
      public.current_staff_role() = 'lead_coach'
      and public.current_staff_has_centre(centre_name)
    )
  );

drop policy if exists "Admins and lead coaches can delete assessment rows"
  on public.assessment_import_rows;

create policy "Admins and lead coaches can delete assessment rows"
  on public.assessment_import_rows
  for delete
  to authenticated
  using (
    public.current_staff_role() = 'admin'
    or (
      public.current_staff_role() = 'lead_coach'
      and public.current_staff_has_centre(centre_name)
    )
  );

grant select, insert, update, delete on public.assessment_import_rows to authenticated, service_role;

create table if not exists public.customer_enquiries (
  id uuid primary key default gen_random_uuid(),
  parent_name text not null,
  phone text,
  email text,
  child_name text,
  child_age text,
  centre_name text,
  programme text,
  enquiry_type text not null default 'enquiry',
  status text not null default 'new',
  source text default 'respond.io',
  message text,
  enquiry_received_at timestamptz,
  first_touch_date date,
  trial_time text,
  trial_details text,
  trial_date date,
  trial_location text,
  trial_coach text,
  registration_date date,
  signed_up_location text,
  signed_up_coach text,
  outcome_notes text,
  assigned_to text,
  notes text,
  respondio_contact_id text,
  respondio_conversation_id text,
  google_sheet_row_id text,
  closed_at timestamptz,
  closed_by uuid references public.staff_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customer_enquiries
  add column if not exists parent_name text,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists child_name text,
  add column if not exists child_age text,
  add column if not exists centre_name text,
  add column if not exists programme text,
  add column if not exists enquiry_type text default 'enquiry',
  add column if not exists status text default 'new',
  add column if not exists source text default 'respond.io',
  add column if not exists message text,
  add column if not exists enquiry_received_at timestamptz,
  add column if not exists first_touch_date date,
  add column if not exists trial_time text,
  add column if not exists trial_details text,
  add column if not exists trial_date date,
  add column if not exists trial_location text,
  add column if not exists trial_coach text,
  add column if not exists registration_date date,
  add column if not exists signed_up_location text,
  add column if not exists signed_up_coach text,
  add column if not exists outcome_notes text,
  add column if not exists assigned_to text,
  add column if not exists notes text,
  add column if not exists respondio_contact_id text,
  add column if not exists respondio_conversation_id text,
  add column if not exists google_sheet_row_id text,
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by uuid references public.staff_profiles(id) on delete set null,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.customer_enquiries
set enquiry_type = 'enquiry'
where enquiry_type is null
  or enquiry_type not in ('enquiry', 'trial', 'sign_up');

update public.customer_enquiries
set status = 'new'
where status is null
  or status not in ('new', 'contacted', 'trial_booked', 'signed_up', 'closed');

update public.customer_enquiries
set enquiry_received_at = created_at
where enquiry_received_at is null;

alter table public.customer_enquiries
  alter column parent_name set not null,
  alter column enquiry_type set not null,
  alter column status set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

alter table public.customer_enquiries
drop constraint if exists customer_enquiries_enquiry_type_check;

alter table public.customer_enquiries
add constraint customer_enquiries_enquiry_type_check
check (enquiry_type in ('enquiry', 'trial', 'sign_up'));

alter table public.customer_enquiries
drop constraint if exists customer_enquiries_status_check;

alter table public.customer_enquiries
add constraint customer_enquiries_status_check
check (status in ('new', 'contacted', 'trial_booked', 'signed_up', 'closed'));

create unique index if not exists customer_enquiries_google_sheet_row_id_key
  on public.customer_enquiries (google_sheet_row_id);

create unique index if not exists customer_enquiries_respondio_conversation_id_key
  on public.customer_enquiries (respondio_conversation_id);

create index if not exists customer_enquiries_status_idx
  on public.customer_enquiries (status);

create index if not exists customer_enquiries_centre_name_idx
  on public.customer_enquiries (lower(trim(centre_name)));

create index if not exists customer_enquiries_created_at_idx
  on public.customer_enquiries (created_at desc);

create index if not exists customer_enquiries_enquiry_received_at_idx
  on public.customer_enquiries (enquiry_received_at desc);

create index if not exists customer_enquiries_registration_date_idx
  on public.customer_enquiries (registration_date desc);

create or replace function public.set_customer_enquiries_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_customer_enquiries_updated_at
  on public.customer_enquiries;

create trigger set_customer_enquiries_updated_at
before update on public.customer_enquiries
for each row
execute function public.set_customer_enquiries_updated_at();

alter table public.customer_enquiries enable row level security;

drop policy if exists "Staff can read permitted customer enquiries"
  on public.customer_enquiries;
drop policy if exists "Admins can read customer enquiries"
  on public.customer_enquiries;

create policy "Admins can read customer enquiries"
  on public.customer_enquiries
  for select
  to authenticated
  using (public.current_staff_role() = 'admin');

drop policy if exists "Admins and lead coaches can insert customer enquiries"
  on public.customer_enquiries;
drop policy if exists "Admins can insert customer enquiries"
  on public.customer_enquiries;

create policy "Admins can insert customer enquiries"
  on public.customer_enquiries
  for insert
  to authenticated
  with check (public.current_staff_role() = 'admin');

drop policy if exists "Admins and lead coaches can update customer enquiries"
  on public.customer_enquiries;
drop policy if exists "Admins can update customer enquiries"
  on public.customer_enquiries;

create policy "Admins can update customer enquiries"
  on public.customer_enquiries
  for update
  to authenticated
  using (public.current_staff_role() = 'admin')
  with check (public.current_staff_role() = 'admin');

drop policy if exists "Admins can delete customer enquiries"
  on public.customer_enquiries;

create policy "Admins can delete customer enquiries"
  on public.customer_enquiries
  for delete
  to authenticated
  using (public.current_staff_role() = 'admin');

grant select, insert, update, delete on public.customer_enquiries to authenticated, service_role;

create table if not exists public.student_profiles (
  id uuid primary key default gen_random_uuid(),
  student_name text not null,
  parent_name text,
  phone text,
  email text,
  centre_name text,
  coach_name text,
  programme text,
  status text not null default 'active',
  start_date date,
  status_effective_date date not null default current_date,
  reason text,
  notes text,
  source_enquiry_id uuid references public.customer_enquiries(id) on delete set null,
  created_by uuid references public.staff_profiles(id) on delete set null,
  updated_by uuid references public.staff_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.student_profiles
  add column if not exists student_name text,
  add column if not exists parent_name text,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists centre_name text,
  add column if not exists coach_name text,
  add column if not exists programme text,
  add column if not exists status text default 'active',
  add column if not exists start_date date,
  add column if not exists status_effective_date date default current_date,
  add column if not exists reason text,
  add column if not exists notes text,
  add column if not exists source_enquiry_id uuid references public.customer_enquiries(id) on delete set null,
  add column if not exists created_by uuid references public.staff_profiles(id) on delete set null,
  add column if not exists updated_by uuid references public.staff_profiles(id) on delete set null,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.student_profiles
set status = 'active'
where status is null
  or status not in ('active', 'frozen', 'withdrawn');

update public.student_profiles
set status_effective_date = coalesce(start_date, created_at::date, current_date)
where status_effective_date is null;

alter table public.student_profiles
  alter column student_name set not null,
  alter column status set default 'active',
  alter column status set not null,
  alter column status_effective_date set default current_date,
  alter column status_effective_date set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

alter table public.student_profiles
drop constraint if exists student_profiles_status_check;

alter table public.student_profiles
add constraint student_profiles_status_check
check (status in ('active', 'frozen', 'withdrawn'));

create index if not exists student_profiles_status_idx
  on public.student_profiles (status);

create index if not exists student_profiles_centre_name_idx
  on public.student_profiles (lower(trim(centre_name)));

create index if not exists student_profiles_status_effective_date_idx
  on public.student_profiles (status_effective_date desc);

create index if not exists student_profiles_student_name_idx
  on public.student_profiles (lower(trim(student_name)));

create or replace function public.set_student_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_student_profiles_updated_at
  on public.student_profiles;

create trigger set_student_profiles_updated_at
before update on public.student_profiles
for each row
execute function public.set_student_profiles_updated_at();

alter table public.student_profiles enable row level security;

drop policy if exists "Staff can read permitted student profiles"
  on public.student_profiles;

create policy "Staff can read permitted student profiles"
  on public.student_profiles
  for select
  to authenticated
  using (
    public.current_staff_role() = 'admin'
    or (
      public.current_staff_role() = 'lead_coach'
      and public.current_staff_has_centre(centre_name)
    )
    or (
      public.current_staff_role() = 'coach'
      and public.current_staff_coach_name() is not null
      and coach_name is not null
      and lower(trim(coach_name)) = lower(trim(public.current_staff_coach_name()))
    )
  );

drop policy if exists "Admins and lead coaches can insert student profiles"
  on public.student_profiles;
drop policy if exists "Admins can insert student profiles"
  on public.student_profiles;

create policy "Admins can insert student profiles"
  on public.student_profiles
  for insert
  to authenticated
  with check (public.current_staff_role() = 'admin');

drop policy if exists "Admins and lead coaches can update student profiles"
  on public.student_profiles;
drop policy if exists "Admins can update student profiles"
  on public.student_profiles;

create policy "Admins can update student profiles"
  on public.student_profiles
  for update
  to authenticated
  using (public.current_staff_role() = 'admin')
  with check (public.current_staff_role() = 'admin');

drop policy if exists "Admins can delete student profiles"
  on public.student_profiles;

create policy "Admins can delete student profiles"
  on public.student_profiles
  for delete
  to authenticated
  using (public.current_staff_role() = 'admin');

grant select, insert, update, delete on public.student_profiles to authenticated, service_role;
