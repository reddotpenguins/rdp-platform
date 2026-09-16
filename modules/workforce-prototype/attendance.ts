import type {Shift,Timesheet} from './model';
export type Site = {id:string;name:string;latitude:number;longitude:number;radius:number;tagCode:string;address?:string;configured?:boolean};
export type Position = {latitude:number;longitude:number;accuracy:number};
export type FenceResult = {status:'Inside'|'Outside'|'Uncertain'|'Unavailable';distance:number|null};
export type ClockPoint = {at:string;position:Position|null;fence:FenceResult;source:'GPS'|'NFC + GPS'|'Demo GPS'|'Demo NFC'|'Tag link + GPS'|'Demo tag link';site:Site};
export type Attendance = {id:string;personId:string;shift:Shift;clockIn:ClockPoint;clockOut:ClockPoint|null;autoEnd:string|null;review:'Open'|'Pending'|'Approved';reviewNote:string;createdFrom:'demo'|'device'};
// Coordinates are illustrative until a manager configures each actual entrance.
export const demoSites:Site[] = ['Orchard','Siglap','Caldecott','Bt Timah'].map((name,i)=>({
 id:['orchard','siglap','caldecott','bt-timah'][i],name,latitude:1.35,longitude:103.82,radius:150,
 tagCode:`RDP-${['ORCHARD','SIGLAP','CALDECOTT','BT-TIMAH'][i]}-01`,address:'',configured:false
}));
export const DEMO_CLOCK = '2026-09-16T11:30';
export const shiftInstant = (date:string,time:string) => `${date}T${time}:00+08:00`;
export function distanceMeters(a:Pick<Position,'latitude'|'longitude'>,b:Pick<Position,'latitude'|'longitude'>) {
 const rad = Math.PI/180, lat=(b.latitude-a.latitude)*rad, lng=(b.longitude-a.longitude)*rad;
 const h=Math.sin(lat/2)**2+Math.cos(a.latitude*rad)*Math.cos(b.latitude*rad)*Math.sin(lng/2)**2;
 return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
}
export function checkFence(site:Site,position:Position|null):FenceResult {
 if (!position || ![position.latitude,position.longitude,position.accuracy,site.latitude,site.longitude,site.radius].every(Number.isFinite) || Math.abs(position.latitude)>90 || Math.abs(position.longitude)>180 || position.accuracy<0 || site.radius<=0) return {status:'Unavailable',distance:null};
 const distance=distanceMeters(site,position);
 // The entire reported accuracy circle must fit inside the fence to accept a check-in.
 return {status:distance+position.accuracy<=site.radius?'Inside':distance-position.accuracy>site.radius?'Outside':'Uncertain',distance};
}
export function deviceFence(site:Site,position:Position|null):FenceResult {return site.configured===false?{status:'Unavailable',distance:null}:checkFence(site,position);}
export function clockInError(shift:Shift|undefined,site:Site,position:Position|null,now:string,records:Attendance[]):string|null {
 if(!shift?.personId) return 'Select an assigned shift.';
 if(!shift.published) return 'Publish this shift before clocking in.';
 if(records.some(r=>r.personId===shift.personId&&r.review==='Open')) return 'This person already has an open attendance record.';
 if(records.some(r=>r.shift.id===shift.id)) return 'This shift already has an attendance record.';
 if(site.name!==shift.location) return 'This checkpoint is not the location assigned to the shift.';
 const at=Date.parse(now), start=Date.parse(shiftInstant(shift.date,shift.start)), end=Date.parse(shiftInstant(shift.date,shift.end));
 if(!Number.isFinite(at)||at<start-30*60*1000||at>=end) return 'Check-in opens 30 minutes before the shift and closes at its end.';
 const fence=checkFence(site,position);
 if(fence.status!=='Inside') return fence.status==='Outside'?'Outside the geofence. Move to the assigned location.':fence.status==='Uncertain'?'Location accuracy crosses the geofence boundary. Try again in an open area.':'Location is required to clock in.';
 return null;
}
export function autoCloseDue(records:Attendance[],now:string):Attendance[] {
 return records.map(r=>{
  const end=shiftInstant(r.shift.date,r.shift.end);
  if(r.review!=='Open'||Date.parse(end)>Date.parse(now)||!Number.isFinite(Date.parse(now))) return r;
  return {...r,autoEnd:end,clockOut:null,review:'Pending',reviewNote:'Scheduled end used automatically; departure location is unknown.'};
 });
}
export function attendanceTimesheet(record:Attendance):Timesheet|null {
 if(record.review!=='Approved') return null;
 const end=record.clockOut?.at||record.autoEnd;
 if(!end)return null;
 const sgTime=(v:string)=>new Date(v).toLocaleTimeString('en-GB',{timeZone:'Asia/Singapore',hour:'2-digit',minute:'2-digit',hour12:false});
 return {id:`attendance-${record.id}`,personId:record.personId,date:record.shift.date,start:sgTime(record.clockIn.at),end:sgTime(end),breakMinutes:record.shift.breakMinutes,approved:true,location:record.shift.location};
}
export function seedAttendance(shifts:Shift[]):Attendance[] {
 return ['p1','p6'].flatMap(personId=>{
  const shift=shifts.find(s=>s.personId===personId&&s.date==='2026-09-16');if(!shift)return [];
  const site=demoSites.find(s=>s.name===shift.location)!;
  const position={latitude:site.latitude+.00015,longitude:site.longitude+.0001,accuracy:12};
  return [{id:`a-${personId}`,personId,shift:{...shift},clockIn:{at:shiftInstant(shift.date,shift.start),position,fence:checkFence(site,position),source:'Demo NFC' as const,site:{...site}},clockOut:null,autoEnd:null,review:'Open' as const,reviewNote:'',createdFrom:'demo' as const}];
 });
}
export function tagSite(code:string,sites:Site[]) {return sites.find(s=>s.tagCode===code.trim())||null;}
// Compare the observed arrival against the schedule snapshot captured at clock-in.
// Zero grace period; round a positive fractional minute up for the displayed label.
export function lateMinutes(record:Attendance):number|null {
 const start=Date.parse(shiftInstant(record.shift.date,record.shift.start)),arrival=Date.parse(record.clockIn.at);
 if(!Number.isFinite(start)||!Number.isFinite(arrival))return null;
 return Math.max(0,Math.ceil((arrival-start)/60000));
}
