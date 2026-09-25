-- Additive attendance pilot for scheduling-phase-1.sql. No seeded or demo records.
begin;
create table if not exists public.workforce_attendance (
 id uuid primary key default gen_random_uuid(),
 organisation_id uuid not null references public.organisations(id),
 staff_profile_id uuid not null references public.staff_profiles(id),
 shift_id uuid not null references public.schedule_shifts(id) on delete restrict,
 location_id uuid not null references public.work_locations(id) on delete restrict,
 shift_title text not null, location_name text not null,
 scheduled_start timestamptz not null, scheduled_end timestamptz not null,
 centre_lat double precision not null, centre_lng double precision not null, radius integer not null,
 clock_in timestamptz not null default now(), clock_out timestamptz,
 in_lat double precision not null, in_lng double precision not null, in_accuracy double precision not null,
 out_lat double precision, out_lng double precision, out_accuracy double precision,
 in_distance double precision not null, out_distance double precision,
 out_fence text check(out_fence in ('inside','outside','uncertain')),
 status text not null default 'open' check(status in ('open','pending','approved','rejected')),
 unpaid_break_minutes integer not null default 0 check(unpaid_break_minutes>=0),
 review_note text, reviewed_by uuid references public.staff_profiles(id), reviewed_at timestamptz,
 unique(staff_profile_id,shift_id),
 check(clock_out is null or clock_out>clock_in),
 check((status='open' and clock_out is null) or (status<>'open' and clock_out is not null))
);
alter table public.workforce_attendance add column if not exists shift_mood text check(shift_mood in ('good','okay','difficult','prefer-not-to-say'));
alter table public.workforce_attendance add column if not exists shift_feedback text check(length(shift_feedback)<=1000);
alter table public.workforce_attendance add column if not exists follow_up_requested boolean not null default false;
create unique index if not exists workforce_one_open_clock on public.workforce_attendance(staff_profile_id) where clock_out is null;
create index if not exists workforce_attendance_org_time on public.workforce_attendance(organisation_id,clock_in desc);
alter table public.workforce_attendance enable row level security;
revoke all on public.workforce_attendance from anon,authenticated;
grant select on public.workforce_attendance to authenticated;
drop policy if exists workforce_attendance_read on public.workforce_attendance;
create policy workforce_attendance_read on public.workforce_attendance for select to authenticated using (
 organisation_id=public.current_staff_organisation_id() and
 (staff_profile_id=auth.uid() or public.current_staff_can_manage_schedules())
);

create or replace function public.workforce_distance(lat1 double precision,lng1 double precision,lat2 double precision,lng2 double precision)
returns double precision language sql immutable set search_path=public as $$
 select 6371000*2*asin(sqrt(least(1.0,power(sin(radians(lat2-lat1)/2),2)+cos(radians(lat1))*cos(radians(lat2))*power(sin(radians(lng2-lng1)/2),2))));
$$;

drop function if exists public.workforce_clock(uuid,text,double precision,double precision,double precision,timestamptz);
create or replace function public.workforce_clock(p_shift uuid,p_direction text,p_lat double precision,p_lng double precision,p_accuracy double precision,p_captured_at timestamptz,p_mood text default null,p_feedback text default null,p_follow_up boolean default false)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor public.staff_profiles; s public.schedule_shifts; loc public.work_locations; r public.workforce_attendance; metres double precision; result uuid;
begin
 select * into actor from public.staff_profiles where id=auth.uid() and active=true and role in ('admin','coach','lead_coach') for update;
 if actor.id is null then raise exception 'Active staff access required'; end if;
 if p_direction is null or p_direction not in ('in','out') or p_lat is null or p_lng is null or p_accuracy is null or
 not(p_lat between -90 and 90) or not(p_lng between -180 and 180) or not(p_accuracy between 0 and 1000) or
 p_captured_at is null or p_captured_at < now()-interval '60 seconds' or p_captured_at > now()+interval '10 seconds' then
 raise exception 'A fresh, valid device location is required'; end if;
 if (p_mood is not null and p_mood not in ('good','okay','difficult','prefer-not-to-say')) or length(coalesce(p_feedback,''))>1000 then raise exception 'Choose a valid shift response and keep notes within 1000 characters'; end if;
 if p_direction='in' then
  select * into s from public.schedule_shifts where id=p_shift and organisation_id=actor.organisation_id and status='published' for share;
  if s.id is null or not exists(select 1 from public.schedule_shift_assignments where shift_id=s.id and staff_profile_id=actor.id and organisation_id=actor.organisation_id and status in ('assigned','acknowledged')) then raise exception 'Select your assigned published shift'; end if;
  if s.required_qualification_id is not null and not exists(select 1 from public.staff_qualifications q where q.organisation_id=actor.organisation_id and q.staff_profile_id=actor.id and q.qualification_id=s.required_qualification_id and (q.awarded_at is null or q.awarded_at<=(s.starts_at at time zone 'Asia/Singapore')::date) and (q.expires_at is null or q.expires_at>=((s.ends_at-interval '1 microsecond') at time zone 'Asia/Singapore')::date)) then raise exception 'The required qualification is missing or expired for this shift'; end if;
  select * into loc from public.work_locations where id=s.work_location_id and organisation_id=actor.organisation_id and active=true;
  if loc.id is null or loc.latitude is null or loc.longitude is null then raise exception 'Your manager must configure the centre entrance coordinates'; end if;
  if now()<s.starts_at-make_interval(mins=>loc.early_clock_in_minutes) or now()>=s.ends_at then raise exception 'Clock-in is outside the allowed shift window'; end if;
  if exists(select 1 from public.staff_unavailable_periods where staff_profile_id=actor.id and organisation_id=actor.organisation_id and status='approved' and starts_at<s.ends_at and ends_at>s.starts_at) then raise exception 'Approved leave overlaps this shift'; end if;
  metres=public.workforce_distance(loc.latitude::double precision,loc.longitude::double precision,p_lat,p_lng);
  if metres+p_accuracy>loc.geofence_radius_meters then raise exception 'Location is outside or too uncertain. Move to the centre entrance and retry'; end if;
  insert into public.workforce_attendance(organisation_id,staff_profile_id,shift_id,location_id,shift_title,location_name,scheduled_start,scheduled_end,centre_lat,centre_lng,radius,in_lat,in_lng,in_accuracy,in_distance)
  values(actor.organisation_id,actor.id,s.id,loc.id,s.title,loc.name,s.starts_at,s.ends_at,loc.latitude,loc.longitude,loc.geofence_radius_meters,p_lat,p_lng,p_accuracy,metres) returning id into result;
 else
  select * into r from public.workforce_attendance where staff_profile_id=actor.id and organisation_id=actor.organisation_id and shift_id=p_shift and clock_out is null for update;
  if r.id is null then raise exception 'No open clock-in for this shift'; end if;
  metres=public.workforce_distance(r.centre_lat,r.centre_lng,p_lat,p_lng);
  update public.workforce_attendance set clock_out=now(),out_lat=p_lat,out_lng=p_lng,out_accuracy=p_accuracy,out_distance=metres,
   shift_mood=p_mood,shift_feedback=nullif(trim(p_feedback),''),follow_up_requested=coalesce(p_follow_up,false),
   out_fence=case when metres+p_accuracy<=r.radius then 'inside' when metres-p_accuracy>r.radius then 'outside' else 'uncertain' end,status='pending' where id=r.id;
  result=r.id;
 end if;
 insert into public.audit_events(organisation_id,actor_staff_id,event_type,entity_type,entity_id) values(actor.organisation_id,actor.id,'attendance.clock_'||p_direction,'workforce_attendance',result);
 return result;
end $$;

create or replace function public.workforce_review(p_id uuid,p_approve boolean,p_break integer,p_note text)
returns void language plpgsql security definer set search_path=public as $$
declare actor public.staff_profiles; r public.workforce_attendance;
begin
 select * into actor from public.staff_profiles where id=auth.uid() and active=true;
 if actor.id is null or not public.current_staff_can_manage_schedules() then raise exception 'Scheduling manager access required'; end if;
 select * into r from public.workforce_attendance where id=p_id and organisation_id=actor.organisation_id and status='pending' for update;
 if r.id is null then raise exception 'Pending attendance not found'; end if;
 if r.staff_profile_id=actor.id then raise exception 'Another manager must review your attendance'; end if;
 if p_approve is null or p_break is null or p_break<0 or p_break*60>=extract(epoch from r.clock_out-r.clock_in) or length(trim(coalesce(p_note,''))) not between 3 and 500 then raise exception 'Enter a review note and a valid unpaid break'; end if;
 update public.workforce_attendance set status=case when p_approve then 'approved' else 'rejected' end,unpaid_break_minutes=p_break,review_note=trim(p_note),reviewed_by=actor.id,reviewed_at=now() where id=r.id;
 insert into public.audit_events(organisation_id,actor_staff_id,event_type,entity_type,entity_id,metadata) values(actor.organisation_id,actor.id,'attendance.review','workforce_attendance',r.id,jsonb_build_object('approved',p_approve,'unpaid_break_minutes',p_break));
end $$;

-- Narrow RPC avoids granting staff visibility of the complete manager roster.
create or replace function public.workforce_my_shifts()
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor public.staff_profiles; result jsonb;
begin
 select * into actor from public.staff_profiles where id=auth.uid() and active=true and role in ('admin','coach','lead_coach');
 if actor.id is null then raise exception 'Active staff access required'; end if;
 select coalesce(jsonb_agg(row_to_json(t) order by t.starts_at),'[]'::jsonb) into result from (
  select s.id,s.title,s.starts_at,s.ends_at,l.name as location_name,l.latitude,l.longitude,l.geofence_radius_meters as radius
  from public.schedule_shifts s join public.schedule_shift_assignments a on a.shift_id=s.id and a.organisation_id=actor.organisation_id
  left join public.work_locations l on l.id=s.work_location_id and l.organisation_id=actor.organisation_id
  where s.organisation_id=actor.organisation_id and a.staff_profile_id=actor.id and a.status in ('assigned','acknowledged') and s.status='published'
  and s.ends_at>now()-interval '1 day' and s.starts_at<now()+interval '14 days'
 )t;
 return result;
end $$;
revoke all on function public.workforce_clock(uuid,text,double precision,double precision,double precision,timestamptz,text,text,boolean) from public;
revoke all on function public.workforce_review(uuid,boolean,integer,text) from public;
revoke all on function public.workforce_my_shifts() from public;
revoke all on function public.workforce_distance(double precision,double precision,double precision,double precision) from public;
grant execute on function public.workforce_clock(uuid,text,double precision,double precision,double precision,timestamptz,text,text,boolean) to authenticated;
grant execute on function public.workforce_review(uuid,boolean,integer,text) to authenticated;
grant execute on function public.workforce_my_shifts() to authenticated;
commit;
