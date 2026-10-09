-- Apply after scheduling-phase-1.sql, workforce-attendance.sql and workforce-availability.sql.
-- No sample data. Automatic closing starts only for clock-ins after activation.
begin;
alter table public.workforce_attendance add column if not exists closure_source text not null default 'staff' check(closure_source in ('staff','automatic'));
alter table public.workforce_attendance add column if not exists automatic_closed_at timestamptz;
alter table public.workforce_attendance add column if not exists inferred_clock_out timestamptz;
create table if not exists public.workforce_clock_policy (
 organisation_id uuid primary key references public.organisations(id),
 enabled_from timestamptz not null default now()
);
alter table public.workforce_clock_policy enable row level security;
revoke all on public.workforce_clock_policy from anon,authenticated;
grant select on public.workforce_clock_policy to authenticated;
drop policy if exists workforce_clock_policy_read on public.workforce_clock_policy;
create policy workforce_clock_policy_read on public.workforce_clock_policy for select to authenticated using(organisation_id=public.current_staff_organisation_id());
insert into public.workforce_clock_policy(organisation_id) select id from public.organisations where active on conflict do nothing;
create or replace function public.workforce_auto_close()
returns integer language plpgsql security definer set search_path=public as $$
declare r public.workforce_attendance; changed integer:=0;
begin
 for r in select a.* from public.workforce_attendance a join public.workforce_clock_policy p using(organisation_id)
 where a.clock_out is null and a.status='open' and a.clock_in>=p.enabled_from
 and a.scheduled_end> a.clock_in and a.scheduled_end<=now()-interval '30 minutes'
 for update of a skip locked loop
  update public.workforce_attendance set clock_out=r.scheduled_end,inferred_clock_out=r.scheduled_end,
   closure_source='automatic',automatic_closed_at=now(),status='pending',out_lat=null,out_lng=null,out_accuracy=null,out_distance=null,out_fence=null
   where id=r.id;
  insert into public.audit_events(organisation_id,event_type,entity_type,entity_id,metadata)
  values(r.organisation_id,'attendance.auto_closed','workforce_attendance',r.id,jsonb_build_object('inferred_end',r.scheduled_end,'processed_at',now()));
  changed:=changed+1;
 end loop;
 return changed;
end $$;
revoke all on function public.workforce_auto_close() from public,anon,authenticated,service_role;
create or replace function public.workforce_correct_auto_end(p_id uuid,p_end timestamptz,p_note text)
returns void language plpgsql security definer set search_path=public as $$
declare r public.workforce_attendance;
begin
 if not coalesce(public.current_staff_can_manage_schedules(),false) then raise exception 'Manager access required'; end if;
 select * into r from public.workforce_attendance where id=p_id and organisation_id=public.current_staff_organisation_id() for update;
 if r.id is null or r.status<>'pending' or r.closure_source<>'automatic' or r.staff_profile_id=auth.uid() then raise exception 'Another manager must correct pending automatic attendance'; end if;
 if p_end is null or p_end<=r.clock_in or p_end>now() or p_end>r.clock_in+interval '24 hours' or length(trim(coalesce(p_note,''))) not between 3 and 500 then raise exception 'Enter a valid end time and correction reason'; end if;
 update public.workforce_attendance set clock_out=p_end where id=r.id;
 insert into public.audit_events(organisation_id,actor_staff_id,event_type,entity_type,entity_id,metadata)
 values(r.organisation_id,auth.uid(),'attendance.auto_end_corrected','workforce_attendance',r.id,jsonb_build_object('previous_end',r.clock_out,'corrected_end',p_end,'reason',trim(p_note)));
end $$;
revoke all on function public.workforce_correct_auto_end(uuid,timestamptz,text) from public;
grant execute on function public.workforce_correct_auto_end(uuid,timestamptz,text) to authenticated;

-- All new copy/cover operations use the same database checks under an organisation lock.
create or replace function public.workforce_check_assignment(p_staff uuid,p_shift uuid)
returns void language plpgsql security definer set search_path=public as $$
declare s public.schedule_shifts; person public.staff_profiles; org uuid:=public.current_staff_organisation_id();
begin
 select * into s from public.schedule_shifts where id=p_shift and organisation_id=org;
 select * into person from public.staff_profiles where id=p_staff and organisation_id=org and active;
 if s.id is null or person.id is null then raise exception 'Choose an active staff member and shift in your organisation'; end if;
 if s.required_role is not null and s.required_role<>person.role then raise exception 'The selected staff member does not meet the shift role'; end if;
 if s.required_qualification_id is not null and not exists(select 1 from public.staff_qualifications q where q.staff_profile_id=p_staff and q.organisation_id=org and q.qualification_id=s.required_qualification_id and (q.awarded_at is null or q.awarded_at<=(s.starts_at at time zone 'Asia/Singapore')::date) and (q.expires_at is null or q.expires_at>=((s.ends_at-interval '1 microsecond') at time zone 'Asia/Singapore')::date)) then raise exception 'Required qualification is missing or expired'; end if;
 if exists(select 1 from public.schedule_shift_assignments a join public.schedule_shifts x on x.id=a.shift_id where a.organisation_id=org and a.staff_profile_id=p_staff and a.status in ('assigned','acknowledged') and x.id<>p_shift and x.status in ('draft','published') and x.starts_at<s.ends_at and x.ends_at>s.starts_at) then raise exception 'A selected staff member already has an overlapping shift'; end if;
 if exists(select 1 from public.staff_unavailable_periods u where u.organisation_id=org and u.staff_profile_id=p_staff and u.status='approved' and u.starts_at<s.ends_at and u.ends_at>s.starts_at) then raise exception 'Approved time off overlaps this shift'; end if;
 if exists(select 1 from public.staff_availability a cross join lateral generate_series((s.starts_at at time zone 'Asia/Singapore')::date-1,(s.ends_at at time zone 'Asia/Singapore')::date,interval '1 day') d
 where a.organisation_id=org and a.staff_profile_id=p_staff and a.availability_status='unavailable' and extract(dow from d)=a.weekday and (a.effective_from is null or d::date>=a.effective_from) and (a.effective_to is null or d::date<=a.effective_to)
 and ((d::date+a.start_time) at time zone 'Asia/Singapore')<s.ends_at and ((d::date+a.end_time+case when a.end_time<=a.start_time then interval '1 day' else interval '0' end) at time zone 'Asia/Singapore')>s.starts_at) then raise exception 'Staff availability conflicts with this shift'; end if;
end $$;
revoke all on function public.workforce_check_assignment(uuid,uuid) from public;

create or replace function public.workforce_copy_to_staff(p_shifts uuid[],p_staff uuid[])
returns integer language plpgsql security definer set search_path=public as $$
declare org uuid:=public.current_staff_organisation_id(); s public.schedule_shifts; target uuid; new_id uuid; count_copied integer:=0; sid uuid;
begin
 if not coalesce(public.current_staff_can_manage_schedules(),false) then raise exception 'Manager access required'; end if;
 if coalesce(cardinality(p_shifts),0) not between 1 and 100 or coalesce(cardinality(p_staff),0) not between 1 and 50 or array_position(p_shifts,null) is not null or array_position(p_staff,null) is not null then raise exception 'Choose shifts and destination staff'; end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text,0));
 for sid in select distinct unnest(p_shifts) loop
  select * into s from public.schedule_shifts where id=sid and organisation_id=org and status in ('draft','published') for update;
  if s.id is null or s.ends_at<=now() or exists(select 1 from public.schedule_weeks where id=s.schedule_week_id and status in ('completed','cancelled')) then raise exception 'Only current editable shifts can be copied'; end if;
  for target in select distinct unnest(p_staff) loop
   perform public.workforce_check_assignment(target,s.id);
   insert into public.schedule_shifts(organisation_id,schedule_week_id,work_location_id,department_id,programme_id,title,session_label,starts_at,ends_at,required_role,required_qualification_id,required_manpower,colour,status,notes,created_by)
   values(org,s.schedule_week_id,s.work_location_id,s.department_id,s.programme_id,s.title,s.session_label,s.starts_at,s.ends_at,s.required_role,s.required_qualification_id,1,s.colour,'draft',s.notes,auth.uid()) returning id into new_id;
   insert into public.schedule_shift_assignments(organisation_id,shift_id,staff_profile_id,created_by) values(org,new_id,target,auth.uid());
   insert into public.audit_events(organisation_id,actor_staff_id,event_type,entity_type,entity_id,metadata) values(org,auth.uid(),'schedule.shift.copied_to_staff','schedule_shift',new_id,jsonb_build_object('source',s.id,'staff',target));
   count_copied:=count_copied+1;
  end loop;
 end loop;
 return count_copied;
end $$;
revoke all on function public.workforce_copy_to_staff(uuid[],uuid[]) from public;
grant execute on function public.workforce_copy_to_staff(uuid[],uuid[]) to authenticated;
-- Requests use separate protected tables; legacy manager roster markers remain intact.
create table if not exists public.workforce_leave_requests (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id),
 staff_profile_id uuid not null references public.staff_profiles(id), starts_at timestamptz not null, ends_at timestamptz not null,
 reason text not null check(length(trim(reason)) between 3 and 1000), lesson_plan text not null check(length(trim(lesson_plan)) between 3 and 10000),
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 reviewer_note text, reviewed_by uuid references public.staff_profiles(id), reviewed_at timestamptz,
 created_at timestamptz not null default now(), check(ends_at>starts_at)
);
create table if not exists public.workforce_cover_requests (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id),
 shift_ids uuid[] not null check(cardinality(shift_ids) between 1 and 28),
 requester_id uuid not null references public.staff_profiles(id), replacement_id uuid not null references public.staff_profiles(id),
 original_staff_id uuid references public.staff_profiles(id), reason text not null check(length(trim(reason)) between 3 and 1000),
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 reviewer_note text, reviewed_by uuid references public.staff_profiles(id), reviewed_at timestamptz,
 created_at timestamptz not null default now()
);
alter table public.workforce_leave_requests enable row level security;
alter table public.workforce_cover_requests enable row level security;
revoke all on public.workforce_leave_requests,public.workforce_cover_requests from anon,authenticated;
grant select on public.workforce_leave_requests,public.workforce_cover_requests to authenticated;
drop policy if exists workforce_leave_read on public.workforce_leave_requests;
create policy workforce_leave_read on public.workforce_leave_requests for select to authenticated using(organisation_id=public.current_staff_organisation_id() and (staff_profile_id=auth.uid() or public.current_staff_can_manage_schedules()));
drop policy if exists workforce_cover_read on public.workforce_cover_requests;
create policy workforce_cover_read on public.workforce_cover_requests for select to authenticated using(organisation_id=public.current_staff_organisation_id() and (requester_id=auth.uid() or replacement_id=auth.uid() or original_staff_id=auth.uid() or public.current_staff_can_manage_schedules()));

create or replace function public.workforce_leave_request(p_start timestamptz,p_end timestamptz,p_reason text,p_plan text)
returns uuid language plpgsql security definer set search_path=public as $$
declare org uuid:=public.current_staff_organisation_id(); result uuid;
begin
 if org is null then raise exception 'Active staff access required'; end if;
 if p_start is null or p_end is null or p_end<=p_start or p_start<date_trunc('day',now()) or p_end>now()+interval '2 years' or length(trim(coalesce(p_reason,''))) not between 3 and 1000 or length(trim(coalesce(p_plan,''))) not between 3 and 10000 then raise exception 'Enter valid leave dates, reason and a lesson handover plan'; end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text,0));
 if exists(select 1 from public.workforce_leave_requests where staff_profile_id=auth.uid() and status in ('pending','approved') and starts_at<p_end and ends_at>p_start) then raise exception 'An overlapping leave request already exists'; end if;
 insert into public.workforce_leave_requests(organisation_id,staff_profile_id,starts_at,ends_at,reason,lesson_plan) values(org,auth.uid(),p_start,p_end,trim(p_reason),trim(p_plan)) returning id into result;
 insert into public.audit_events(organisation_id,actor_staff_id,event_type,entity_type,entity_id) values(org,auth.uid(),'leave.requested','workforce_leave_requests',result);
 return result;
end $$;
create or replace function public.workforce_leave_review(p_id uuid,p_approve boolean,p_note text)
returns void language plpgsql security definer set search_path=public as $$
declare org uuid:=public.current_staff_organisation_id(); r public.workforce_leave_requests;
begin
 if not coalesce(public.current_staff_can_manage_schedules(),false) then raise exception 'Manager access required'; end if;
 if p_approve is null or length(trim(coalesce(p_note,''))) not between 3 and 500 then raise exception 'Enter a review note'; end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text,0));
 select * into r from public.workforce_leave_requests where id=p_id and organisation_id=org and status='pending' for update;
 if r.id is null or r.staff_profile_id=auth.uid() then raise exception 'Another manager must review pending leave'; end if;
 if p_approve and exists(select 1 from public.schedule_shifts s join public.schedule_shift_assignments a on a.shift_id=s.id where s.organisation_id=org and a.staff_profile_id=r.staff_profile_id and a.status in ('assigned','acknowledged') and s.status in ('draft','published') and s.starts_at<r.ends_at and s.ends_at>r.starts_at) then raise exception 'Arrange cover for all overlapping shifts before approving leave'; end if;
 if p_approve then
 insert into public.staff_unavailable_periods(organisation_id,staff_profile_id,starts_at,ends_at,reason,status,created_by,reviewed_by,reviewed_at) values(org,r.staff_profile_id,r.starts_at,r.ends_at,'Approved leave','approved',r.staff_profile_id,auth.uid(),now());
 end if;
 update public.workforce_leave_requests set status=case when p_approve then 'approved' else 'rejected' end,reviewer_note=trim(p_note),reviewed_by=auth.uid(),reviewed_at=now() where id=r.id;
 insert into public.audit_events(organisation_id,actor_staff_id,event_type,entity_type,entity_id,metadata) values(org,auth.uid(),'leave.reviewed','workforce_leave_requests',r.id,jsonb_build_object('approved',p_approve,'note',trim(p_note)));
end $$;

-- Staff see only published shift details needed to request cover or claim an open shift.
create or replace function public.workforce_cover_options()
returns jsonb language plpgsql security definer set search_path=public as $$
declare org uuid:=public.current_staff_organisation_id(); result jsonb;
begin
 if org is null then raise exception 'Active staff access required'; end if;
 select coalesce(jsonb_agg(to_jsonb(t) order by t.starts_at),'[]') into result from (
 select s.id,s.title,s.starts_at,s.ends_at,l.name as location_name,a.staff_profile_id as original_staff_id
 from public.schedule_shifts s left join public.work_locations l on l.id=s.work_location_id
 left join public.schedule_shift_assignments a on a.shift_id=s.id and a.status in ('assigned','acknowledged')
 where s.organisation_id=org and s.status='published' and s.starts_at>now() and s.starts_at<now()+interval '90 days'
 and (a.staff_profile_id=auth.uid() or a.staff_profile_id is null or public.current_staff_can_manage_schedules())
 and not exists(select 1 from public.workforce_attendance w where w.shift_id=s.id)
 )t;return result;
end $$;
create or replace function public.workforce_staff_directory()
returns jsonb language sql security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',full_name) order by full_name),'[]') from public.staff_profiles where active and organisation_id=public.current_staff_organisation_id();
$$;
create or replace function public.workforce_cover_request(p_shifts uuid[],p_replacement uuid,p_original uuid,p_reason text)
returns uuid language plpgsql security definer set search_path=public as $$
declare org uuid:=public.current_staff_organisation_id(); sid uuid; result uuid;
begin
 if org is null or coalesce(cardinality(p_shifts),0) not between 1 and 28 or array_position(p_shifts,null) is not null or p_replacement is null or p_replacement is not distinct from p_original or length(trim(coalesce(p_reason,''))) not between 3 and 1000 then raise exception 'Choose shifts, a replacement and a reason'; end if;
 if not coalesce(public.current_staff_can_manage_schedules(),false) and not ((p_original=auth.uid()) or (p_original is null and p_replacement=auth.uid())) then raise exception 'Request cover for your own shifts or apply for an open shift'; end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text,0));
 for sid in select distinct unnest(p_shifts) loop
 if not exists(select 1 from public.schedule_shifts where id=sid and organisation_id=org and status='published' and starts_at>now()) then raise exception 'Choose future published shifts'; end if;
 if p_original is null then
 if exists(select 1 from public.schedule_shift_assignments where shift_id=sid and status in ('assigned','acknowledged')) then raise exception 'This shift is no longer open'; end if;
 elsif not exists(select 1 from public.schedule_shift_assignments where shift_id=sid and staff_profile_id=p_original and status in ('assigned','acknowledged')) then raise exception 'Assignment has changed'; end if;
 perform public.workforce_check_assignment(p_replacement,sid);
 end loop;
 insert into public.workforce_cover_requests(organisation_id,shift_ids,requester_id,replacement_id,original_staff_id,reason) values(org,p_shifts,auth.uid(),p_replacement,p_original,trim(p_reason)) returning id into result;
 insert into public.audit_events(organisation_id,actor_staff_id,event_type,entity_type,entity_id) values(org,auth.uid(),'cover.requested','workforce_cover_requests',result);
 return result;
end $$;
create or replace function public.workforce_cover_review(p_id uuid,p_approve boolean,p_note text)
returns void language plpgsql security definer set search_path=public as $$
declare org uuid:=public.current_staff_organisation_id(); r public.workforce_cover_requests; sid uuid;
begin
 if not coalesce(public.current_staff_can_manage_schedules(),false) then raise exception 'Manager access required'; end if;
 if p_approve is null or length(trim(coalesce(p_note,''))) not between 3 and 500 then raise exception 'Enter a review note'; end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text,0));
 select * into r from public.workforce_cover_requests where id=p_id and organisation_id=org and status='pending' for update;
 if r.id is null or auth.uid() in (r.requester_id,r.replacement_id,r.original_staff_id) then raise exception 'An uninvolved manager must review this request'; end if;
 if p_approve then
 for sid in select distinct unnest(r.shift_ids) loop
 perform 1 from public.schedule_shifts where id=sid and organisation_id=org and status='published' and starts_at>now() for update;
 if not found then raise exception 'Shift changed or already started'; end if;
 if exists(select 1 from public.workforce_attendance where shift_id=sid) then raise exception 'Attendance already exists for this shift'; end if;
 if r.original_staff_id is null then
 if exists(select 1 from public.schedule_shift_assignments where shift_id=sid and status in ('assigned','acknowledged')) then raise exception 'Shift is no longer open'; end if;
 elsif not exists(select 1 from public.schedule_shift_assignments where shift_id=sid and staff_profile_id=r.original_staff_id and status in ('assigned','acknowledged')) then raise exception 'Original assignment changed'; end if;
 perform public.workforce_check_assignment(r.replacement_id,sid);
 update public.schedule_shift_assignments set status='removed' where shift_id=sid and staff_profile_id=r.original_staff_id;
 insert into public.schedule_shift_assignments(organisation_id,shift_id,staff_profile_id,status,created_by) values(org,sid,r.replacement_id,'assigned',auth.uid()) on conflict(shift_id,staff_profile_id) do update set status='assigned';
 end loop;
 end if;
 update public.workforce_cover_requests set status=case when p_approve then 'approved' else 'rejected' end,reviewer_note=trim(p_note),reviewed_by=auth.uid(),reviewed_at=now() where id=r.id;
 insert into public.audit_events(organisation_id,actor_staff_id,event_type,entity_type,entity_id,metadata) values(org,auth.uid(),'cover.reviewed','workforce_cover_requests',r.id,jsonb_build_object('approved',p_approve,'note',trim(p_note)));
end $$;
revoke all on function public.workforce_leave_request(timestamptz,timestamptz,text,text),public.workforce_leave_review(uuid,boolean,text),public.workforce_cover_options(),public.workforce_staff_directory(),public.workforce_cover_request(uuid[],uuid,uuid,text),public.workforce_cover_review(uuid,boolean,text) from public;
grant execute on function public.workforce_leave_request(timestamptz,timestamptz,text,text),public.workforce_leave_review(uuid,boolean,text),public.workforce_cover_options(),public.workforce_staff_directory(),public.workforce_cover_request(uuid[],uuid,uuid,text),public.workforce_cover_review(uuid,boolean,text) to authenticated;


create or replace function public.workforce_lock_roster_write()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(coalesce(new.organisation_id,old.organisation_id)::text,0));
 if tg_op='DELETE' then return old; end if; return new;
end $$;
drop trigger if exists workforce_roster_lock on public.schedule_shift_assignments;
create trigger workforce_roster_lock before insert or update or delete on public.schedule_shift_assignments for each row execute function public.workforce_lock_roster_write();
drop trigger if exists workforce_roster_lock on public.schedule_shifts;
create trigger workforce_roster_lock before insert or update or delete on public.schedule_shifts for each row execute function public.workforce_lock_roster_write();
drop trigger if exists workforce_roster_lock on public.staff_unavailable_periods;
create trigger workforce_roster_lock before insert or update or delete on public.staff_unavailable_periods for each row execute function public.workforce_lock_roster_write();
create or replace function public.workforce_validate_assignment_write()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.status in ('assigned','acknowledged') and auth.uid() is not null then
 perform public.workforce_check_assignment(new.staff_profile_id,new.shift_id);
 end if;
 return new;
end $$;
drop trigger if exists workforce_assignment_validation on public.schedule_shift_assignments;
create trigger workforce_assignment_validation after insert or update on public.schedule_shift_assignments for each row execute function public.workforce_validate_assignment_write();

notify pgrst,'reload schema';
commit;
