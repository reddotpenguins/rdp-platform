-- Apply after workforce-payroll.sql. New clock-ins only; historical pay is unchanged.
begin;
alter table public.workforce_attendance add column if not exists paid_start_at timestamptz;
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
  if now()<s.starts_at-interval '30 minutes' or now()>=s.ends_at then raise exception 'Clock-in opens 30 minutes before the shift starts and closes at shift end'; end if;
  if exists(select 1 from public.staff_unavailable_periods where staff_profile_id=actor.id and organisation_id=actor.organisation_id and status='approved' and starts_at<s.ends_at and ends_at>s.starts_at) then raise exception 'Approved leave overlaps this shift'; end if;
  metres=public.workforce_distance(loc.latitude::double precision,loc.longitude::double precision,p_lat,p_lng);
  if metres+p_accuracy>loc.geofence_radius_meters then raise exception 'Location is outside or too uncertain. Move to the centre entrance and retry'; end if;
  insert into public.workforce_attendance(organisation_id,staff_profile_id,shift_id,location_id,shift_title,location_name,scheduled_start,scheduled_end,centre_lat,centre_lng,radius,in_lat,in_lng,in_accuracy,in_distance,paid_start_at)
  values(actor.organisation_id,actor.id,s.id,loc.id,s.title,loc.name,s.starts_at,s.ends_at,loc.latitude,loc.longitude,loc.geofence_radius_meters,p_lat,p_lng,p_accuracy,metres,greatest(now(),s.starts_at)) returning id into result;
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
 if p_approve is null or p_break is null or p_break<0 or p_break*60>greatest(0,extract(epoch from r.clock_out-coalesce(r.paid_start_at,r.clock_in))) or length(trim(coalesce(p_note,''))) not between 3 and 500 then raise exception 'Enter a review note and a valid unpaid break'; end if;
 update public.workforce_attendance set status=case when p_approve then 'approved' else 'rejected' end,unpaid_break_minutes=p_break,review_note=trim(p_note),reviewed_by=actor.id,reviewed_at=now() where id=r.id;
 insert into public.audit_events(organisation_id,actor_staff_id,event_type,entity_type,entity_id,metadata) values(actor.organisation_id,actor.id,'attendance.review','workforce_attendance',r.id,jsonb_build_object('approved',p_approve,'unpaid_break_minutes',p_break));
end $$;
create or replace function public.workforce_payroll_data(p_org uuid,p_month text)
returns jsonb language sql security definer set search_path=public as $$
 select jsonb_build_object(
 'profiles',coalesce((select jsonb_agg(to_jsonb(p) order by staff_profile_id) from public.workforce_pay_profiles p where organisation_id=p_org and month=p_month),'[]'),
 'attendance',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'staff_profile_id',a.staff_profile_id,'clock_in',a.clock_in,'paid_start_at',a.paid_start_at,'clock_out',a.clock_out,'status',a.status,'unpaid_break_minutes',a.unpaid_break_minutes) order by a.id) from public.workforce_attendance a where a.organisation_id=p_org and coalesce(a.paid_start_at,a.clock_in)<((p_month||'-01')::date+interval '1 month') at time zone 'Asia/Singapore' and coalesce(a.clock_out,now())>(p_month||'-01')::date at time zone 'Asia/Singapore'),'[]'));
$$;
notify pgrst,'reload schema';
commit;
