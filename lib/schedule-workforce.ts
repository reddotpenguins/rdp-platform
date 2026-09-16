import { addDaysToIsoDate, getShiftSingaporeDate, type RosterShift } from './scheduling.ts';
export type ScheduleDayStatus='On Shift'|'Not On Shift'|'Sick leave'|'On Leave'|'Available for work';
export type AvailabilityRow={id:string;staff_profile_id:string;weekday:number;start_time:string;end_time:string;availability_status:string;effective_from:string|null;effective_to:string|null;notes:string|null;updated_at:string};
export type UnavailableRow={staff_profile_id:string;starts_at:string;ends_at:string;reason:string|null};
export type SavedBlock={id:string;template_id:string;title:string;day_offset:number;start_time:string;end_time:string;work_location_id:string|null;assigned_staff_profile_id:string|null;department_id:string|null;programme_id:string|null;required_role:string|null;required_qualification_id:string|null;required_manpower:number;colour:string;session_label:string|null;notes:string|null};
export const statusPrefix='rdp-roster-status:';
export const blockMarker='rdp-single-block-v1';
export const dayStatuses:ScheduleDayStatus[]=['On Shift','Not On Shift','Sick leave','On Leave','Available for work'];
export function periodRange(date:string,period:'AM'|'PM') {return {startsAt:`${date}T${period==='AM'?'00:00':'12:00'}:00+08:00`,endsAt:period==='AM'?`${date}T12:00:00+08:00`:`${addDaysToIsoDate(date,1)}T00:00:00+08:00`};}
export function availabilityIntersects(row:AvailabilityRow,start:string,end:string) {
 let date=getShiftSingaporeDate(start);const last=getShiftSingaporeDate(end);
 for(let count=0;date<=last&&count<32;count++,date=addDaysToIsoDate(date,1)){
  if(row.effective_from&&date<row.effective_from||row.effective_to&&date>row.effective_to||new Date(`${date}T12:00:00Z`).getUTCDay()!==row.weekday)continue;
  const a=Date.parse(`${date}T${row.start_time.slice(0,8)}${row.start_time.length===5?':00':''}+08:00`);
  const time=row.end_time.slice(0,8);const b=time.startsWith('24:')?Date.parse(`${addDaysToIsoDate(date,1)}T00:00:00+08:00`):Date.parse(`${date}T${time}${time.length===5?':00':''}+08:00`);
  if(a<Date.parse(end)&&b>Date.parse(start))return true;
 }
 return false;
}
export function rosterDayStatus(staffId:string,date:string,period:'AM'|'PM',shifts:RosterShift[],availability:AvailabilityRow[],unavailable:UnavailableRow[]):ScheduleDayStatus {
 const {startsAt,endsAt}=periodRange(date,period);const overlap=(a:string,b:string)=>Date.parse(a)<Date.parse(endsAt)&&Date.parse(b)>Date.parse(startsAt);
 const away=unavailable.find(r=>r.staff_profile_id===staffId&&overlap(r.starts_at,r.ends_at));if(away)return /sick|medical/i.test(away.reason||'')?'Sick leave':'On Leave';
 const rows=availability.filter(r=>r.staff_profile_id===staffId&&availabilityIntersects(r,startsAt,endsAt)).sort((a,b)=>b.updated_at.localeCompare(a.updated_at));
 const blocked=rows.find(r=>r.availability_status==='unavailable');if(blocked)return blocked.notes===`${statusPrefix}Sick leave`?'Sick leave':'On Leave';
 if(shifts.some(s=>s.status!=='cancelled'&&overlap(s.startsAt,s.endsAt)&&s.assignments.some(a=>a.staffProfileId===staffId&&a.status!=='removed'&&a.status!=='declined')))return 'On Shift';
 if(rows.some(r=>r.availability_status==='available'||r.availability_status==='preferred'))return 'Available for work';
 return 'Not On Shift';
}
export function blockToDraft(block:SavedBlock,week:string):Partial<RosterShift> {return {title:block.title,startsAt:`${addDaysToIsoDate(week,block.day_offset)}T${block.start_time.slice(0,5)}:00+08:00`,endsAt:`${addDaysToIsoDate(week,block.day_offset)}T${block.end_time.slice(0,5)}:00+08:00`,workLocationId:block.work_location_id,departmentId:block.department_id,programmeId:block.programme_id,requiredRole:block.required_role as RosterShift['requiredRole'],requiredQualificationId:block.required_qualification_id,requiredManpower:block.required_manpower,colour:block.colour,sessionLabel:block.session_label,notes:block.notes};}
