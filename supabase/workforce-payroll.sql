-- Apply after workforce-operations.sql. Monthly verified inputs; no sample pay or CPF profiles.
begin;
create table if not exists public.workforce_pay_profiles (
 organisation_id uuid not null references public.organisations(id), staff_profile_id uuid not null references public.staff_profiles(id),
 month text not null check(month ~ '^2026-(0[1-9]|1[0-2])$'), hourly_cents integer not null check(hourly_cents between 0 and 1000000),
 other_ordinary_cents integer not null default 0 check(other_ordinary_cents between 0 and 100000000),
 birth_month text not null, residency text not null check(residency in ('citizen','pr','foreign')), pr_since text not null default '', election text not null check(election in ('GG','FG','FF')),
 verified_by uuid not null references public.staff_profiles(id), verified_at timestamptz not null default now(),
 primary key(organisation_id,staff_profile_id,month)
);
create table if not exists public.workforce_pay_runs (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id),
 month text not null check(month ~ '^2026-(0[1-9]|1[0-2])$'), source jsonb not null, results jsonb not null, journal jsonb not null,
 created_by uuid not null references public.staff_profiles(id), created_at timestamptz not null default now(),
 status text not null default 'finalized' check(status in ('finalized','posting','posted','uncertain')),
 posting_at timestamptz, quickbooks_id text, realm_id text, environment text, posted_at timestamptz,
 unique(organisation_id,month)
);
alter table public.workforce_pay_profiles enable row level security;
alter table public.workforce_pay_runs enable row level security;
revoke all on public.workforce_pay_profiles,public.workforce_pay_runs from anon,authenticated;
grant select on public.workforce_pay_profiles,public.workforce_pay_runs to authenticated;
grant select,insert,update on public.workforce_pay_runs to service_role;
drop policy if exists workforce_pay_profiles_read on public.workforce_pay_profiles;
create policy workforce_pay_profiles_read on public.workforce_pay_profiles for select to authenticated using(organisation_id=public.current_staff_organisation_id() and public.current_staff_can_manage_schedules());
drop policy if exists workforce_pay_runs_read on public.workforce_pay_runs;
create policy workforce_pay_runs_read on public.workforce_pay_runs for select to authenticated using(organisation_id=public.current_staff_organisation_id() and public.current_staff_can_manage_schedules());
create or replace function public.workforce_pay_profile(p_staff uuid,p_month text,p_hourly integer,p_other integer,p_birth text,p_residency text,p_pr text,p_election text)
returns void language plpgsql security definer set search_path=public as $$
declare org uuid:=public.current_staff_organisation_id();
begin
 if not coalesce(public.current_staff_can_manage_schedules(),false) then raise exception 'Payroll manager access required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text,0));
 if not exists(select 1 from public.staff_profiles where id=p_staff and organisation_id=org) then raise exception 'Staff member not found'; end if;
 if exists(select 1 from public.workforce_pay_runs where organisation_id=org and month=p_month) then raise exception 'This month has already been finalized'; end if;
 if p_birth !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or p_birth>=p_month or (p_residency='pr' and (p_pr !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or p_pr>p_month)) then raise exception 'Enter valid verified birth and PR months'; end if;
 insert into public.workforce_pay_profiles values(org,p_staff,p_month,p_hourly,p_other,p_birth,p_residency,coalesce(p_pr,''),p_election,auth.uid(),now())
 on conflict(organisation_id,staff_profile_id,month) do update set hourly_cents=excluded.hourly_cents,other_ordinary_cents=excluded.other_ordinary_cents,birth_month=excluded.birth_month,residency=excluded.residency,pr_since=excluded.pr_since,election=excluded.election,verified_by=auth.uid(),verified_at=now();
 insert into public.audit_events(organisation_id,actor_staff_id,event_type,entity_type,entity_id,metadata) values(org,auth.uid(),'payroll.profile_verified','staff_profile',p_staff,jsonb_build_object('month',p_month));
end $$;
-- Private helper excludes location evidence and includes relevant month-boundary attendance.
create or replace function public.workforce_payroll_data(p_org uuid,p_month text)
returns jsonb language sql security definer set search_path=public as $$
 select jsonb_build_object(
 'profiles',coalesce((select jsonb_agg(to_jsonb(p) order by staff_profile_id) from public.workforce_pay_profiles p where organisation_id=p_org and month=p_month),'[]'),
 'attendance',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'staff_profile_id',a.staff_profile_id,'clock_in',a.clock_in,'clock_out',a.clock_out,'status',a.status,'unpaid_break_minutes',a.unpaid_break_minutes) order by a.id) from public.workforce_attendance a where a.organisation_id=p_org and a.clock_in<((p_month||'-01')::date+interval '1 month') at time zone 'Asia/Singapore' and coalesce(a.clock_out,now())>(p_month||'-01')::date at time zone 'Asia/Singapore'),'[]'));
$$;
create or replace function public.workforce_payroll_source(p_month text)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if not coalesce(public.current_staff_can_manage_schedules(),false) then raise exception 'Payroll manager access required'; end if;
 if p_month !~ '^2026-(0[1-9]|1[0-2])$' then raise exception 'Select a supported 2026 month'; end if;
 return public.workforce_payroll_data(public.current_staff_organisation_id(),p_month);
end $$;
-- Only the trusted server may persist calculated totals; never accept totals through a public RPC.
create or replace function public.workforce_finalize_payroll(p_actor uuid,p_month text,p_source jsonb,p_results jsonb,p_journal jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare org uuid; result uuid;
begin
 select organisation_id into org from public.staff_profiles where id=p_actor and active and role='admin';
 if org is null then raise exception 'Payroll manager access required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text,0));
 lock table public.workforce_attendance in share mode;
 if p_source is distinct from public.workforce_payroll_data(org,p_month) then raise exception 'Payroll data changed. Refresh and review again'; end if;
 if ((p_month||'-01')::date+interval '1 month') at time zone 'Asia/Singapore'>now() then raise exception 'Finalize only after the month ends'; end if;
 insert into public.workforce_pay_runs(organisation_id,month,source,results,journal,created_by) values(org,p_month,p_source,p_results,p_journal,p_actor) returning id into result;
 insert into public.audit_events(organisation_id,actor_staff_id,event_type,entity_type,entity_id,metadata) values(org,p_actor,'payroll.finalized','workforce_pay_runs',result,jsonb_build_object('month',p_month));
 return result;
end $$;
-- Preserve finalized evidence. Correct attendance before finalizing a month.
create or replace function public.workforce_protect_finalized_attendance()
returns trigger language plpgsql set search_path=public as $$
begin
 if exists(select 1 from public.workforce_pay_runs r where r.organisation_id=coalesce(new.organisation_id,old.organisation_id) and (
 (tg_op<>'INSERT' and old.clock_in<((r.month||'-01')::date+interval '1 month') at time zone 'Asia/Singapore' and coalesce(old.clock_out,now())>(r.month||'-01')::date at time zone 'Asia/Singapore') or
 (tg_op<>'DELETE' and new.clock_in<((r.month||'-01')::date+interval '1 month') at time zone 'Asia/Singapore' and coalesce(new.clock_out,now())>(r.month||'-01')::date at time zone 'Asia/Singapore'))) then raise exception 'Attendance belongs to finalized payroll. An audited payroll adjustment is required'; end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
drop trigger if exists workforce_finalized_attendance on public.workforce_attendance;
create trigger workforce_finalized_attendance before insert or update or delete on public.workforce_attendance for each row execute function public.workforce_protect_finalized_attendance();
revoke all on function public.workforce_pay_profile(uuid,text,integer,integer,text,text,text,text),public.workforce_payroll_source(text),public.workforce_payroll_data(uuid,text),public.workforce_finalize_payroll(uuid,text,jsonb,jsonb,jsonb) from public;
grant execute on function public.workforce_pay_profile(uuid,text,integer,integer,text,text,text,text),public.workforce_payroll_source(text) to authenticated;
grant execute on function public.workforce_finalize_payroll(uuid,text,jsonb,jsonb,jsonb) to service_role;
create or replace function public.workforce_protect_pay_run()
returns trigger language plpgsql set search_path=public as $$
begin
 if tg_op='DELETE' or new.id<>old.id or new.organisation_id<>old.organisation_id or new.month<>old.month or new.source is distinct from old.source or new.results is distinct from old.results or new.journal is distinct from old.journal or new.created_by<>old.created_by or new.created_at<>old.created_at then raise exception 'Finalized payroll evidence cannot be changed'; end if;
 return new;
end $$;
drop trigger if exists workforce_immutable_pay_run on public.workforce_pay_runs;
create trigger workforce_immutable_pay_run before update or delete on public.workforce_pay_runs for each row execute function public.workforce_protect_pay_run();
notify pgrst,'reload schema';
commit;
