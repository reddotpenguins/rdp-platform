import {redirect} from 'next/navigation';
import {requireActiveStaffSession} from '@/lib/supabase/staffProfile';
import {createClient} from '@/lib/supabase/server';
import {hasStaffPermission} from '@/lib/staffRoles';
import type {OwnAvailability} from '@/modules/attendance/AvailabilityPanel';
import AttendanceClient from '@/modules/attendance/AttendanceClient';
import type {AttendanceRow,PublishedShift} from '@/modules/attendance/types';
export const dynamic='force-dynamic';
export default async function AttendancePage({searchParams}:{searchParams?:{error?:string;saved?:string}}){
 const {profile}=await requireActiveStaffSession();
 if(!hasStaffPermission(profile,'schedule.viewOwn'))redirect('/dashboard');
 const manager=hasStaffPermission(profile,'schedule.manage');const db=createClient();
 const [shifts,records,availability,ownRecords]=await Promise.all([
  db.rpc('workforce_my_shifts'),
  db.from('workforce_attendance').select('*').or(`clock_in.gte.${new Date(Date.now()-31*86400000).toISOString()},status.eq.open`).order('clock_in',{ascending:false}).limit(1000),
  db.rpc('workforce_my_availability'),
  db.from('workforce_attendance').select('*').eq('staff_profile_id',profile.id).or(`clock_in.gte.${new Date(Date.now()-31*86400000).toISOString()},status.eq.open`).order('clock_in',{ascending:false})
 ]);
 const attendance=Array.from(new Map([...(records.data||[]),...(ownRecords.data||[])].map(r=>[r.id,r])).values()).sort((a,b)=>Date.parse(b.clock_in)-Date.parse(a.clock_in));
 const staffIds=Array.from(new Set(attendance.map(r=>r.staff_profile_id)));
 const names=manager&&staffIds.length?await db.from('staff_profiles').select('id,full_name').in('id',staffIds):{data:[{id:profile.id,full_name:profile.fullName}],error:null};
 const error=!!(shifts.error||records.error||ownRecords.error||names.error);
 return <>{searchParams?.error&&<p role="alert">{searchParams.error}</p>}{searchParams?.saved&&<p role="status">{searchParams.saved}</p>}<AttendanceClient availability={(availability.data||[]) as OwnAvailability[]} availabilityError={!!availability.error} profileId={profile.id} manager={manager} names={Object.fromEntries((names.data||[]).map(p=>[p.id,p.full_name]))} shifts={(shifts.data||[]) as PublishedShift[]} records={attendance as AttendanceRow[]} error={error}/></>;
}
