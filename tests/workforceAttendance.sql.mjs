// Run with RDP_PGLITE_MODULE pointing to an installed @electric-sql/pglite module.
// Ephemeral local PostgreSQL only: never connects to Supabase.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.RDP_PGLITE_MODULE);
const db=new PGlite();
await db.exec(`
create role anon; create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table organisations(id uuid primary key);
create table staff_profiles(id uuid primary key,organisation_id uuid,active boolean,role text);
create table work_locations(id uuid primary key,organisation_id uuid,name text,latitude numeric,longitude numeric,geofence_radius_meters integer,early_clock_in_minutes integer,active boolean);
create table schedule_shifts(id uuid primary key,organisation_id uuid,work_location_id uuid,title text,starts_at timestamptz,ends_at timestamptz,status text,required_qualification_id uuid);
create table staff_qualifications(organisation_id uuid,staff_profile_id uuid,qualification_id uuid,awarded_at date,expires_at date);
create table schedule_shift_assignments(shift_id uuid,staff_profile_id uuid,organisation_id uuid,status text);
create table staff_unavailable_periods(staff_profile_id uuid,organisation_id uuid,status text,starts_at timestamptz,ends_at timestamptz);
create table staff_availability(id uuid primary key default gen_random_uuid(),organisation_id uuid,staff_profile_id uuid,weekday integer,start_time time,end_time time,availability_status text,effective_from date,effective_to date,notes text);
create table audit_events(organisation_id uuid,actor_staff_id uuid,event_type text,entity_type text,entity_id uuid,metadata jsonb);
create function current_staff_organisation_id() returns uuid language sql security definer as $$select organisation_id from staff_profiles where id=auth.uid() and active$$;
create function current_staff_can_manage_schedules() returns boolean language sql security definer as $$select role='admin' from staff_profiles where id=auth.uid() and active$$;
insert into organisations values ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
insert into staff_profiles values
 ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001',true,'coach'),
 ('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000001',true,'admin'),
 ('00000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000002',true,'admin');
insert into work_locations values('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000001','Test pool',1.3,103.8,150,15,true);
insert into schedule_shifts values('00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000021','Test shift',now()-interval '5 minutes',now()+interval '1 hour','published',null);
insert into schedule_shift_assignments values('00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001','assigned');
`);
await db.exec(await readFile(new URL('../supabase/workforce-attendance.sql',import.meta.url),'utf8'));
await db.exec(await readFile(new URL('../supabase/workforce-availability.sql',import.meta.url),'utf8'));
let checks=0;
const actor=async(n)=>{await db.exec(`reset role; select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-${String(n).padStart(12,'0')}',false);set role authenticated;`);};
const clock=(direction='in',lat=1.3,accuracy=5,when='now()')=>db.query(`select workforce_clock('00000000-0000-4000-8000-000000000031',$1,$2,103.8,$3,${when}) as id`,[direction,lat,accuracy]);
async function rejects(fn,pattern){await assert.rejects(fn,pattern);checks++;}
await actor(11);
assert.equal((await db.query('select workforce_my_shifts() as shifts')).rows[0].shifts.length,1);checks++;
await rejects(()=>clock('in',2),/outside or too uncertain/);
await rejects(()=>clock('in',1.3,200),/outside or too uncertain/);
await rejects(()=>clock('in',1.3,5,"now()-interval '2 minutes'"),/fresh/);
await rejects(()=>clock('in',1.3,5,"now()+interval '1 hour'"),/fresh/);
await rejects(()=>clock('in',1.3,-1),/fresh/);
const id=(await clock()).rows[0].id;checks++;
await rejects(()=>clock(),/unique constraint/);
await rejects(()=>db.query("update workforce_attendance set status='approved'"),/permission denied/);
await rejects(()=>db.query('select workforce_review($1,true,0,$2)',[id,'Self approval']),/manager access/);
await rejects(()=>db.query("select workforce_clock('00000000-0000-4000-8000-000000000031','out',1.3,103.8,5,now(),'invalid','',false)"),/valid shift response/);
await db.query("select workforce_clock('00000000-0000-4000-8000-000000000031','out',2,103.8,5,now(),'difficult','Please check in with me',true)");checks++;
const feedback=(await db.query('select shift_mood,shift_feedback,follow_up_requested from workforce_attendance')).rows[0];assert.equal(feedback.shift_mood,'difficult');assert.equal(feedback.follow_up_requested,true);checks++;
assert.equal((await db.query('select out_fence,status from workforce_attendance')).rows[0].out_fence,'outside');checks++;
await actor(13);
assert.equal((await db.query('select * from workforce_attendance')).rows.length,0);checks++;
assert.equal((await db.query('select workforce_my_shifts() as shifts')).rows[0].shifts.length,0);checks++;
await rejects(()=>db.query('select workforce_review($1,true,0,$2)',[id,'Other org']),/not found/);
await actor(12);
await rejects(()=>clock(),/assigned published shift/);
await rejects(()=>db.query('select workforce_review($1,true,999,$2)',[id,'Bad break']),/valid unpaid break/);
await db.query('select workforce_review($1,true,0,$2)',[id,'Confirmed with coach']);checks++;
await rejects(()=>db.query('select workforce_review($1,true,0,$2)',[id,'Duplicate']),/not found/);
await db.exec("reset role; update staff_profiles set active=false where id='00000000-0000-4000-8000-000000000011';");
await actor(11);
assert.equal((await db.query('select * from workforce_attendance')).rows.length,0);checks++;
await rejects(()=>clock(),/Active staff/);
await rejects(()=>db.query('select workforce_my_shifts()'),/Active staff/);
await db.exec("reset role; update staff_profiles set active=true where id='00000000-0000-4000-8000-000000000011';");
await actor(11);
await db.query("select workforce_set_availability((now() at time zone 'Asia/Singapore')::date+1,'AM','preferred')");checks++;
assert.equal((await db.query('select workforce_my_availability() as rows')).rows[0].rows.length,1);checks++;
await db.query("select workforce_set_availability((now() at time zone 'Asia/Singapore')::date+1,'AM','unavailable')");
assert.equal((await db.query('select workforce_my_availability() as rows')).rows[0].rows[0].availability_status,'unavailable');checks++;
await rejects(()=>db.query("select workforce_set_availability((now() at time zone 'Asia/Singapore')::date-1,'AM','preferred')"),/next 90 days/);
await rejects(()=>db.query("select workforce_set_availability((now() at time zone 'Asia/Singapore')::date+91,'AM','preferred')"),/next 90 days/);
await rejects(()=>db.query("select workforce_set_availability((now() at time zone 'Asia/Singapore')::date,case when extract(hour from now() at time zone 'Asia/Singapore')<12 then 'AM' else 'PM' end,'unavailable')"),/already have a shift/);
await actor(13);assert.equal((await db.query('select workforce_my_availability() as rows')).rows[0].rows.length,0);checks++;
await actor(11);await db.query("select workforce_set_availability((now() at time zone 'Asia/Singapore')::date+1,'AM','clear')");assert.equal((await db.query('select workforce_my_availability() as rows')).rows[0].rows.length,0);checks++;
await db.close();console.log(`${checks} PostgreSQL attendance checks passed.`);
