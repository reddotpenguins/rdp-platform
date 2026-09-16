import {minutes,type Shift,type Leave} from './model.ts';
export type CoachStatus='On Shift'|'Not On Shift'|'Sick leave'|'On Leave'|'Available for work';
export type CoachPeriod='Morning'|'Afternoon';
export type CoachDay={personId:string;date:string;morning:Exclude<CoachStatus,'On Shift'>;afternoon:Exclude<CoachStatus,'On Shift'>};
export const coachStatuses:CoachStatus[]=['On Shift','Not On Shift','Sick leave','On Leave','Available for work'];
export function overlapsPeriod(shift:Shift,period:CoachPeriod){return period==='Morning'?minutes(shift.start)<720:minutes(shift.end)>720;}
export function coachStatus(personId:string,date:string,period:CoachPeriod,shifts:Shift[],leaves:Leave[],days:CoachDay[]):CoachStatus {
 const leave=leaves.find(l=>l.personId===personId&&l.status==='Approved'&&l.date<=date&&l.endDate>=date);
 if(leave)return /medical|sick/i.test(leave.type)?'Sick leave':'On Leave';
 if(shifts.some(s=>s.personId===personId&&s.date===date&&overlapsPeriod(s,period)))return 'On Shift';
 const day=days.find(d=>d.personId===personId&&d.date===date);
 return day?.[period==='Morning'?'morning':'afternoon']||'Not On Shift';
}
export function coachAssignmentError(shift:Shift,days:CoachDay[]):string|null {
 const day=days.find(d=>d.personId===shift.personId&&d.date===shift.date);if(!day)return null;
 for(const period of ['Morning','Afternoon'] as const){const status=day[period==='Morning'?'morning':'afternoon'];if(overlapsPeriod(shift,period)&&(status==='Sick leave'||status==='On Leave'))return `This coach is marked ${status.toLowerCase()} for ${period.toLowerCase()} on ${shift.date}. Update their status before assigning this shift.`;}
 return null;
}
export const statusClass=(status:CoachStatus)=>({'On Shift':'on','Not On Shift':'off','Sick leave':'sick','On Leave':'leave','Available for work':'available'}[status]);
