import {redirect} from 'next/navigation';
import {requireActiveStaffSession} from '@/lib/supabase/staffProfile';
import {createClient} from '@/lib/supabase/server';
import {hasStaffPermission} from '@/lib/staffRoles';
import type {OwnAvailability} from '@/modules/attendance/AvailabilityPanel';
import AttendanceClient from '@/modules/attendance/AttendanceClient';
import type {AttendanceRow,PublishedShift} from '@/modules/attendance/types';
export const dynamic='force-dynamic';
export default async function AttendancePage(){
 const {profile}=await requireActiveStaffSession();
 if(!hasStaffPermission(profile,'schedule.viewOwn'))redirect('/dashboard');
 const manager=hasStaffPermission(profile,'schedule.manage');const db=createClient();
 const [shifts,records,availability]=await Promise.all([
  db.rpc('workforce_my_shifts'),
  db.from('workforce_attendance').select('*').or(`clock_in.gte.${new Date(Date.now()-31*86400000).toISOString()},status.eq.open`).order('clock_in',{ascending:false}).limit(1000),
  db.rpc('workforce_my_availability')
 ]);
 const staffIds=Array.from(new Set((records.data||[]).map(r=>r.staff_profile_id)));
 const names=manager&&staffIds.length?await db.from('staff_profiles').select('id,full_name').in('id',staffIds):{data:[{id:profile.id,full_name:profile.fullName}],error:null};
 const error=!!(shifts.error||records.error||names.error);
 return <AttendanceClient availability={(availability.data||[]) as OwnAvailability[]} availabilityError={!!availability.error} profileId={profile.id} manager={manager} names={Object.fromEntries((names.data||[]).map(p=>[p.id,p.full_name]))} shifts={(shifts.data||[]) as PublishedShift[]} records={(records.data||[]) as AttendanceRow[]} error={error}/>;
}
