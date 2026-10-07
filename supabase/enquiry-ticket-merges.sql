-- Apply after auth-and-roles.sql; enquiry-import-skips.sql may be applied before or after.
begin;
alter table public.customer_enquiries
  add column if not exists merged_into uuid references public.customer_enquiries(id),
  add column if not exists merged_at timestamptz,
  add column if not exists merged_by uuid references public.staff_profiles(id);
create index if not exists customer_enquiries_merged_into_idx on public.customer_enquiries(merged_into);

create table if not exists public.enquiry_ticket_merges (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.customer_enquiries(id),
  target_id uuid not null references public.customer_enquiries(id),
  merged_by uuid not null references public.staff_profiles(id),
  created_at timestamptz not null default now(),
  reason text not null,
  choices jsonb not null,
  source_before jsonb not null,
  target_before jsonb not null,
  target_after jsonb not null,
  check(source_id <> target_id)
);
alter table public.enquiry_ticket_merges enable row level security;
revoke all on public.enquiry_ticket_merges from anon, authenticated, service_role;
grant select on public.enquiry_ticket_merges to authenticated;
drop policy if exists "Admins read ticket merge history" on public.enquiry_ticket_merges;
create policy "Admins read ticket merge history" on public.enquiry_ticket_merges
for select to authenticated using (public.current_staff_role() = 'admin');

-- Include earlier merges when their surviving ticket is later merged again.
create or replace view public.enquiry_ticket_merge_history with (security_invoker = true) as
select m.*, coalesce(e.merged_into, e.id) as current_ticket_id
from public.enquiry_ticket_merges m join public.customer_enquiries e on e.id=m.target_id;
revoke all on public.enquiry_ticket_merge_history from anon, authenticated, service_role;
grant select on public.enquiry_ticket_merge_history to authenticated;

create or replace function public.protect_enquiry_merge_history()
returns trigger language plpgsql set search_path = public as $$
begin raise exception 'Ticket merge history cannot be edited or deleted'; end;
$$;
drop trigger if exists protect_enquiry_merge_history on public.enquiry_ticket_merges;
create trigger protect_enquiry_merge_history before update or delete on public.enquiry_ticket_merges
for each row execute function public.protect_enquiry_merge_history();

-- App users can edit normal fields, but only the reviewed merge function can link tickets.
revoke update on public.customer_enquiries from authenticated;
grant update (parent_name, phone, email, child_name, child_age, centre_name, programme, enquiry_type, status, source, message, enquiry_received_at, first_touch_date, trial_time, trial_details, trial_date, trial_location, trial_coach, registration_date, signed_up_location, signed_up_coach, outcome_notes, assigned_to, notes, closed_at, closed_by, updated_at)
on public.customer_enquiries to authenticated;

create or replace function public.protect_merged_enquiry()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.merged_into is not null or new.merged_at is not null or new.merged_by is not null then
      raise exception 'New tickets cannot be marked as merged';
    end if;
    return new;
  end if;
  if current_user in ('authenticated', 'service_role', 'anon') and
    (new.merged_into is distinct from old.merged_into or new.merged_at is distinct from old.merged_at or new.merged_by is distinct from old.merged_by) then
    raise exception 'Use the reviewed merge action to link tickets';
  end if;
  if old.merged_into is not null and current_user in ('authenticated', 'service_role', 'anon') then
    raise exception 'This ticket has been merged. Resolve its conversation ID to the current ticket before updating.';
  end if;
  return new;
end;
$$;
drop trigger if exists protect_merged_enquiry on public.customer_enquiries;
create trigger protect_merged_enquiry before insert or update on public.customer_enquiries
for each row execute function public.protect_merged_enquiry();

create or replace function public.merge_enquiry_tickets(
  p_target uuid, p_source uuid, p_target_version timestamptz, p_source_version timestamptz,
  p_choices jsonb, p_reason text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  t public.customer_enquiries%rowtype;
  s public.customer_enquiries%rowtype;
  result public.customer_enquiries%rowtype;
  before_t jsonb; before_s jsonb; patch jsonb := '{}'::jsonb;
  field text; choice text; value jsonb;
  allowed text[] := array['parent_name','phone','email','child_name','child_age','centre_name','programme','enquiry_type','status','source','message','enquiry_received_at','first_touch_date','trial_time','trial_details','trial_date','trial_location','trial_coach','registration_date','signed_up_location','signed_up_coach','outcome_notes','assigned_to','notes'];
begin
  if public.current_staff_role() is distinct from 'admin' then
    raise exception 'Active enquiry administrator access is required';
  end if;
  if p_target is null or p_source is null or p_target = p_source then raise exception 'Choose two different tickets'; end if;
  if p_reason is null or length(trim(p_reason)) not between 1 and 4000 then raise exception 'Add merge notes between 1 and 4000 characters'; end if;
  if p_choices is null or jsonb_typeof(p_choices) <> 'object' then raise exception 'Invalid field choices'; end if;
  if (select count(*) from jsonb_object_keys(p_choices)) <> cardinality(allowed)
    or exists(select 1 from jsonb_object_keys(p_choices) k where not k = any(allowed)) then raise exception 'Invalid field choices'; end if;
  -- Serialize human merges to keep alias chains flat; ordinary edits are row-locked below.
  perform pg_advisory_xact_lock(582884, 1);
  perform id from public.customer_enquiries where id in (p_target, p_source) order by id for update;
  select * into t from public.customer_enquiries where id = p_target;
  if not found then raise exception 'Main ticket not found'; end if;
  select * into s from public.customer_enquiries where id = p_source;
  if not found then raise exception 'Other ticket not found'; end if;
  if t.merged_into is not null or s.merged_into is not null then raise exception 'A ticket has already been merged. Refresh before continuing'; end if;
  if t.updated_at is distinct from p_target_version or s.updated_at is distinct from p_source_version then
    raise exception 'A ticket changed while you were reviewing it. Refresh and compare again';
  end if;
  before_t := to_jsonb(t); before_s := to_jsonb(s);
  foreach field in array allowed loop
    choice := p_choices->>field;
    if choice = 'target' then value := before_t->field;
    elsif choice = 'source' then value := before_s->field;
    elsif choice = 'combine' and field = any(array['message','notes','trial_details','outcome_notes']) then
      if nullif(before_t->>field,'') is null then value := before_s->field;
      elsif nullif(before_s->>field,'') is null or before_t->>field = before_s->>field then value := before_t->field;
      else value := to_jsonb(concat('Main ticket ',p_target, E':\n',before_t->>field,E'\n\nMerged ticket ',p_source,E':\n',before_s->>field)); end if;
    else raise exception 'Invalid choice for %', field;
    end if;
    patch := patch || jsonb_build_object(field, value);
  end loop;
  result := jsonb_populate_record(t, patch);
  if result.phone ~ '^\+?[0-9 ().-]+$' and regexp_replace(result.phone, '[^0-9]', '', 'g') ~ '^65[0-9]{8}$' then
    result.phone := '+' || regexp_replace(result.phone, '[^0-9]', '', 'g');
  end if;
  if result.status = 'signed_up' then result.enquiry_type := 'sign_up'; end if;
  if result.status = 'closed' then
    result.closed_at := case when p_choices->>'status' = 'source' then coalesce(s.closed_at, now()) else coalesce(t.closed_at, now()) end;
    result.closed_by := case when p_choices->>'status' = 'source' then coalesce(s.closed_by, auth.uid()) else coalesce(t.closed_by, auth.uid()) end;
  else result.closed_at := null; result.closed_by := null;
  end if;
  update public.customer_enquiries set
    parent_name = result.parent_name,
    phone = result.phone,
    email = result.email,
    child_name = result.child_name,
    child_age = result.child_age,
    centre_name = result.centre_name,
    programme = result.programme,
    enquiry_type = result.enquiry_type,
    status = result.status,
    source = result.source,
    message = result.message,
    enquiry_received_at = result.enquiry_received_at,
    first_touch_date = result.first_touch_date,
    trial_time = result.trial_time,
    trial_details = result.trial_details,
    trial_date = result.trial_date,
    trial_location = result.trial_location,
    trial_coach = result.trial_coach,
    registration_date = result.registration_date,
    signed_up_location = result.signed_up_location,
    signed_up_coach = result.signed_up_coach,
    outcome_notes = result.outcome_notes,
    assigned_to = result.assigned_to,
    notes = result.notes,
    closed_at = result.closed_at, closed_by = result.closed_by, updated_at = clock_timestamp()
  where id = p_target returning * into result;
  -- Retain every original identifier on the archived rows, and flatten earlier merges.
  update public.customer_enquiries set merged_into = p_target, merged_at = now(), merged_by = auth.uid(), updated_at = clock_timestamp()
  where id = p_source or merged_into = p_source;
  update public.student_profiles set source_enquiry_id = p_target where source_enquiry_id = p_source;
  insert into public.enquiry_ticket_merges(source_id,target_id,merged_by,reason,choices,source_before,target_before,target_after)
  values(p_source,p_target,auth.uid(),trim(p_reason),p_choices,before_s,before_t,to_jsonb(result));
  return p_target;
end;
$$;
revoke all on function public.merge_enquiry_tickets(uuid,uuid,timestamptz,timestamptz,jsonb,text) from public, anon, service_role;
grant execute on function public.merge_enquiry_tickets(uuid,uuid,timestamptz,timestamptz,jsonb,text) to authenticated;

-- Use from Make before saving. The result is the surviving ticket's UUID, or null.
create or replace function public.resolve_enquiry_ticket(p_conversation_id text default null, p_external_ticket_id text default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare ids uuid[];
begin
  select array_agg(distinct coalesce(merged_into,id)) into ids from public.customer_enquiries
  where (nullif(trim(p_conversation_id),'') is not null and respondio_conversation_id=p_conversation_id)
     or (nullif(trim(p_external_ticket_id),'') is not null and external_ticket_id=p_external_ticket_id);
  if cardinality(ids) > 1 then raise exception 'Identifiers refer to different tickets; review before saving'; end if;
  return ids[1];
end;
$$;
revoke all on function public.resolve_enquiry_ticket(text,text) from public, anon;
grant execute on function public.resolve_enquiry_ticket(text,text) to authenticated, service_role;

create or replace function public.find_enquiry_merge_candidates(p_target uuid, p_search text default '')
returns table(id uuid,parent_name text,phone text,child_name text,programme text,enquiry_type text,status text)
language sql stable security invoker set search_path = public as $$
  select e.id,e.parent_name,e.phone,e.child_name,e.programme,e.enquiry_type,e.status
  from public.customer_enquiries e
  join public.customer_enquiries t on t.id=p_target
  where public.current_staff_role()='admin' and e.id<>p_target and e.merged_into is null
    and (
      (trim(coalesce(p_search,'')) = '' and nullif(regexp_replace(t.phone,'[^0-9]','','g'),'') is not null
        and regexp_replace(e.phone,'[^0-9]','','g')=regexp_replace(t.phone,'[^0-9]','','g'))
      or (trim(coalesce(p_search,'')) <> '' and (
        strpos(lower(concat_ws(' ',e.parent_name,e.child_name,e.phone,e.respondio_conversation_id,e.id)),lower(trim(p_search)))>0
        or (nullif(regexp_replace(p_search,'[^0-9]','','g'),'') is not null
          and strpos(regexp_replace(e.phone,'[^0-9]','','g'),regexp_replace(p_search,'[^0-9]','','g'))>0)
      ))
    )
  order by e.created_at desc,e.id limit 50
$$;
revoke all on function public.find_enquiry_merge_candidates(uuid,text) from public,anon,service_role;
grant execute on function public.find_enquiry_merge_candidates(uuid,text) to authenticated;
notify pgrst, 'reload schema';
commit;
