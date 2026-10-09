import {calculateCpf,type CpfProfile} from '../modules/workforce-prototype/cpf.ts';
export type PayProfile={staff_profile_id:string;hourly_cents:number;other_ordinary_cents:number;birth_month:string;residency:CpfProfile['residency'];pr_since:string;election:CpfProfile['election']};
export type PayAttendance={id:string;staff_profile_id:string;clock_in:string;clock_out:string|null;status:string;unpaid_break_minutes:number};
export type PaySource={profiles:PayProfile[];attendance:PayAttendance[]};
export function calculateLivePayroll(month:string,source:PaySource){
 if(!/^2026-(0[1-9]|1[0-2])$/.test(month))throw new Error('Select a supported 2026 month.');
 const errors:string[]=[];const profiles=new Map(source.profiles.map(p=>[p.staff_profile_id,p]));
 const ids=new Set([...Array.from(profiles.keys()),...source.attendance.filter(a=>a.status!=='rejected').map(a=>a.staff_profile_id)]);
 const monthEnd=new Date(Date.UTC(2026,Number(month.slice(5)),1)-8*3600000).getTime();const monthStart=Date.parse(month+'-01T00:00:00+08:00');
 const rows=Array.from(ids).sort().map(id=>{
 const p=profiles.get(id);const entries=source.attendance.filter(a=>a.staff_profile_id===id&&a.status!=='rejected');
 if(!p)errors.push(`Pay/CPF profile missing for staff ${id}`);
 if(entries.some(a=>a.status!=='approved'||!a.clock_out))errors.push(`Attendance needs review for staff ${id}`);
 let milliseconds=0;
 for(const a of entries.filter(a=>a.status==='approved'&&a.clock_out)){
 const start=Date.parse(a.clock_in),end=Date.parse(a.clock_out!);
 // Do not guess how unpaid breaks are distributed across calendar months.
 if(start<monthStart||end>monthEnd){errors.push(`Attendance ${a.id} crosses a month boundary; reconcile it before payroll.`);continue;}
 const paid=end-start-a.unpaid_break_minutes*60000;
 if(!Number.isFinite(paid)||paid<0){errors.push(`Invalid paid hours for attendance ${a.id}`);continue;}milliseconds+=paid;
 }
 const hours=milliseconds/3600000;const recordedCents=p?Math.round(milliseconds*p.hourly_cents/3600000):0;
 const cpf=calculateCpf(month,recordedCents+(p?.other_ordinary_cents||0),p?{birthMonth:p.birth_month,residency:p.residency,prSince:p.pr_since,election:p.election}:{birthMonth:'',residency:'citizen',prSince:'',election:'GG'});
 if(cpf.error)errors.push(`${id}: ${cpf.error}`);
 return {id,hours,recordedCents,otherCents:p?.other_ordinary_cents||0,cpf};
 });
 const totals=rows.reduce((v,r)=>({grossCents:v.grossCents+r.cpf.grossCents,employeeCents:v.employeeCents+r.cpf.employeeCents,employerCents:v.employerCents+r.cpf.employerCents}),{grossCents:0,employeeCents:0,employerCents:0});
 return {rows,errors,totals};
}
