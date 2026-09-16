import {people,paidHours,type Timesheet} from './model.ts';
import {calculateCpf,type CpfProfile} from './cpf.ts';
export function monthlyPayroll(month:string,timesheets:Timesheet[],profiles:Record<string,CpfProfile>,extraOrdinaryCents:Record<string,number>) {
 return people.map(person=>{
  const entries=timesheets.filter(t=>t.personId===person.id&&t.date.slice(0,7)===month);
  const approved=entries.filter(t=>t.approved);
  const hours=approved.reduce((sum,t)=>sum+paidHours(t),0);
  const recordedCents=Math.round(hours*person.rate*100);
  const extraCents=extraOrdinaryCents[`${month}:${person.id}`]||0;
  const profile=profiles[person.id];
  const cpf=calculateCpf(month,recordedCents+extraCents,profile);
  return {...person,hours,recordedCents,extraCents,pending:entries.filter(t=>!t.approved).length,cpf,profile};
 });
}
export type MonthlyRow=ReturnType<typeof monthlyPayroll>[number];
export const centsMoney=(n:number)=>new Intl.NumberFormat('en-SG',{style:'currency',currency:'SGD'}).format(n/100);
export function downloadFile(content:string,name:string,type='text/csv;charset=utf-8;') {
 const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function csv(rows:(string|number)[][]){return rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(',')).join('\r\n');}

// Fictional Ordinary Wages from earlier in the demo month; editable in Payroll.
export const demoOtherWages:Record<string,number> = Object.fromEntries(people.map((p,i)=>[`2026-09:${p.id}`, [280000,240000,240000,200000,300000,180000,140000,140000][i]]));
