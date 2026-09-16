import {shiftError,type Shift,type Leave} from './model.ts';
export type CoverRequest={id:string;shiftId:string;shiftIds?:string[];originalPersonId:string;personId:string;status:'Pending'|'Approved'|'Declined'};
export function coverError(request:CoverRequest,shifts:Shift[],leaves:Leave[],locations:string[],lockedShiftIds:string[]):string|null {
 const ids=request.shiftIds||[request.shiftId];
 if(!ids.length||new Set(ids).size!==ids.length)return 'Select a valid shift group.';
 const reassigned=shifts.map(s=>ids.includes(s.id)?{...s,personId:request.personId}:s);
 for(const id of ids){
 const shift=shifts.find(s=>s.id===id);
 if(!shift||!shift.published||shift.personId!==request.originalPersonId)return 'This shift group has changed or contains an unpublished shift. Review and publish every session first.';
 if(lockedShiftIds.includes(shift.id))return 'Attendance already exists for this shift. Review the recorded hours instead.';
 if(!request.personId||request.personId===shift.personId)return 'Choose a different staff member for this shift.';
 const issue=shiftError({...shift,personId:request.personId},reassigned,leaves,locations);
 if(issue)return `${shift.date}: ${issue}`;
 }
 return null;
}
