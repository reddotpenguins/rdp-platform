-- Optional private lesson-plan attachments. Apply after workforce-operations.sql.
begin;
alter table public.workforce_leave_requests add column if not exists lesson_plan_path text;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('workforce-lesson-plans','workforce-lesson-plans',false,10485760,array['application/pdf','image/jpeg','image/png']) on conflict(id) do nothing;
drop policy if exists workforce_plan_upload on storage.objects;
create policy workforce_plan_upload on storage.objects for insert to authenticated with check(bucket_id='workforce-lesson-plans' and (storage.foldername(name))[1]=public.current_staff_organisation_id()::text and (storage.foldername(name))[2]=auth.uid()::text);
drop policy if exists workforce_plan_read on storage.objects;
create policy workforce_plan_read on storage.objects for select to authenticated using(bucket_id='workforce-lesson-plans' and (storage.foldername(name))[1]=public.current_staff_organisation_id()::text and ((storage.foldername(name))[2]=auth.uid()::text or public.current_staff_can_manage_schedules()));
create or replace function public.workforce_attach_plan(p_id uuid,p_path text)
returns void language plpgsql security definer set search_path=public as $$
begin
 if p_path is null or p_path not like public.current_staff_organisation_id()::text||'/'||auth.uid()::text||'/%' or not exists(select 1 from storage.objects where bucket_id='workforce-lesson-plans' and name=p_path) then raise exception 'Upload your own lesson plan first'; end if;
 update public.workforce_leave_requests set lesson_plan_path=p_path where id=p_id and staff_profile_id=auth.uid() and organisation_id=public.current_staff_organisation_id() and status='pending' and lesson_plan_path is null;
 if not found then raise exception 'Pending request not found or attachment already saved'; end if;
end $$;
revoke all on function public.workforce_attach_plan(uuid,text) from public;
grant execute on function public.workforce_attach_plan(uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
