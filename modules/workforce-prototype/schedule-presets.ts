import {addDays,minutes,type Shift} from './model.ts';
export type SchedulePreset={id:string;name:string;siteId:string;weekday:number;start:string;end:string;breakMinutes:number;personId:string};
export const presetDays=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
export const defaultPresets:SchedulePreset[]=[
 {id:'orchard-friday',name:'Friday coaching',siteId:'orchard',weekday:4,start:'16:00',end:'18:15',breakMinutes:0,personId:''},
 {id:'siglap-saturday-full',name:'Saturday morning · full session',siteId:'siglap',weekday:5,start:'08:45',end:'12:30',breakMinutes:0,personId:''},
 {id:'siglap-saturday-short',name:'Saturday morning · early finish',siteId:'siglap',weekday:5,start:'08:45',end:'11:45',breakMinutes:0,personId:''}
];
export function presetError(p:SchedulePreset):string|null {
 if(!p.name?.trim()||p.name.length>80||!p.siteId||!Number.isInteger(p.weekday)||p.weekday<0||p.weekday>6)return 'Enter a name, centre and weekday.';
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(p.start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(p.end)||minutes(p.end)<=minutes(p.start))return 'End time must be after start time.';
 if(!Number.isFinite(p.breakMinutes)||p.breakMinutes<0||p.breakMinutes>=minutes(p.end)-minutes(p.start))return 'The break must be shorter than the block.';
 return null;
}
export function presetShift(p:SchedulePreset,week:string,siteName:string,id:string):Shift {return {id,personId:p.personId,date:addDays(week,p.weekday),start:p.start,end:p.end,breakMinutes:p.breakMinutes,location:siteName,title:p.name,team:'Coaching',published:false};}
export function readPresets(raw:string|null):SchedulePreset[]|null {try{const value=JSON.parse(raw||'null');if(!Array.isArray(value)||value.length>100||value.some(p=>!p||typeof p.id!=='string'||typeof p.personId!=='string'||presetError(p))||new Set(value.map(p=>p.id)).size!==value.length)return null;return value;}catch{return null;}}
