-- Staff can offer their own AM/PM availability without editing manager/leave records.
begin;
create or replace function public.workforce_set_availability(p_date date,p_period text,p_status text)
returns void language plpgsql security definer set search_path=public as $$
declare actor public.staff_profiles; start_time_value time; end_time_value time; start_at timestamptz; end_at timestamptz;
begin
 select * into actor from public.staff_profiles where id=auth.uid() and active=true and role in ('admin','coach','lead_coach') for update;
 if actor.id is null then raise exception 'Active staff access required'; end if;
 if p_date is null or p_date<(now() at time zone 'Asia/Singapore')::date or p_date>(now() at time zone 'Asia/Singapore')::date+90 or p_period is null or p_period not in ('AM','PM') or p_status is null or p_status not in ('preferred','unavailable','clear') then raise exception 'Choose AM or PM and a date within the next 90 days'; end if;
 start_time_value=case when p_period='AM' then time '00:00' else time '12:00' end;
 end_time_value=case when p_period='AM' then time '12:00' else time '24:00' end;
 start_at=(p_date+start_time_value) at time zone 'Asia/Singapore';end_at=(p_date+end_time_value) at time zone 'Asia/Singapore';
 if p_status='unavailable' and exists(select 1 from public.schedule_shifts s join public.schedule_shift_assignments a on a.shift_id=s.id where s.organisation_id=actor.organisation_id and a.organisation_id=actor.organisation_id and a.staff_profile_id=actor.id and a.status in ('assigned','acknowledged') and s.status in ('draft','published') and s.starts_at<end_at and s.ends_at>start_at) then raise exception 'You already have a shift in this period. Ask your manager to arrange cover first'; end if;
 delete from public.staff_availability where organisation_id=actor.organisation_id and staff_profile_id=actor.id and effective_from=p_date and effective_to=p_date and start_time=start_time_value and end_time=end_time_value and notes='rdp-self-availability';
 if p_status<>'clear' then
 insert into public.staff_availability(organisation_id,staff_profile_id,weekday,start_time,end_time,availability_status,effective_from,effective_to,notes)
 values(actor.organisation_id,actor.id,extract(dow from p_date)::integer,start_time_value,end_time_value,p_status,p_date,p_date,'rdp-self-availability');
 end if;
 insert into public.audit_events(organisation_id,actor_staff_id,event_type,entity_type,metadata) values(actor.organisation_id,actor.id,'staff.availability.updated','staff_availability',jsonb_build_object('date',p_date,'period',p_period,'status',p_status));
end $$;
create or replace function public.workforce_my_availability()
returns jsonb language plpgsql security definer set search_path=public as $$
declare org uuid;result jsonb;
begin
 select organisation_id into org from public.staff_profiles where id=auth.uid() and active=true and role in ('admin','coach','lead_coach');
 if org is null then raise exception 'Active staff access required'; end if;
 select coalesce(jsonb_agg(row_to_json(t) order by t.effective_from,t.start_time),'[]'::jsonb) into result from (
 select id,effective_from,start_time,availability_status from public.staff_availability where organisation_id=org and staff_profile_id=auth.uid() and notes='rdp-self-availability' and effective_from>=(now() at time zone 'Asia/Singapore')::date and effective_from<=(now() at time zone 'Asia/Singapore')::date+90
 )t;return result;
end $$;
revoke all on function public.workforce_set_availability(date,text,text) from public;
revoke all on function public.workforce_my_availability() from public;
grant execute on function public.workforce_set_availability(date,text,text) to authenticated;
grant execute on function public.workforce_my_availability() to authenticated;
commit;
