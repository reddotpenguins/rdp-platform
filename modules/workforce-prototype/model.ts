export type Team = 'Coaching' | 'Hospitality';
export type Person = { id: string; name: string; role: string; team: Team; initials: string; color: string; rate: number };
export type Shift = { seriesId?: string; id: string; personId: string; date: string; start: string; end: string; breakMinutes: number; location: string; title: string; team: Team; published: boolean };
export type Leave = { lessonPlanName?:string; lessonPlanUrl?:string; id: string; personId: string; date: string; endDate: string; type: string; reason: string; status: 'Pending' | 'Approved' | 'Declined' };
export type Timesheet = { id: string; personId: string; date: string; start: string; end: string; breakMinutes: number; approved: boolean; location: string };
export const people: Person[] = [
 {id:'p1',name:'Alicia Tan',role:'Senior swim coach',team:'Coaching',initials:'AT',color:'rose',rate:32},
 {id:'p2',name:'Marcus Lim',role:'Swim coach',team:'Coaching',initials:'ML',color:'blue',rate:28},
 {id:'p3',name:'Sarah Lee',role:'Swim coach',team:'Coaching',initials:'SL',color:'purple',rate:28},
 {id:'p4',name:'Daniel Wong',role:'Swim coach',team:'Coaching',initials:'DW',color:'orange',rate:28},
 {id:'p5',name:'Nur Aisyah',role:'Senior swim coach',team:'Coaching',initials:'NA',color:'teal',rate:32},
 {id:'p6',name:'Ryan Teo',role:'Hospitality lead',team:'Hospitality',initials:'RT',color:'blue',rate:22},
 {id:'p7',name:'Chloe Ng',role:'Hospitality associate',team:'Hospitality',initials:'CN',color:'rose',rate:18},
 {id:'p8',name:'Siti Rahman',role:'Hospitality associate',team:'Hospitality',initials:'SR',color:'purple',rate:18},
];
export const locations = ['Orchard', 'Siglap', 'Caldecott', 'Bt Timah'];
export const BASE_WEEK = '2026-09-14';
export function addDays(date: string, days: number) { const d = new Date(date+'T12:00:00'); d.setDate(d.getDate()+days); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
export function minutes(time: string) { const [h,m]=time.split(':').map(Number); return h*60+m; }
export function paidHours(item: {start:string;end:string;breakMinutes:number}) { return Math.max(0, (minutes(item.end)-minutes(item.start)-item.breakMinutes)/60); }
export function onLeave(personId:string,date:string,leave:Leave[]) { return leave.some(l=>l.personId===personId&&l.status==='Approved'&&l.date<=date&&l.endDate>=date); }
export function shiftError(shift:Shift, shifts:Shift[], leaves:Leave[], allowedLocations:string[]=locations):string|null {
 if (!shift.title.trim() || !allowedLocations.includes(shift.location) || !/^\d{4}-\d{2}-\d{2}$/.test(shift.date)) return 'Enter a shift name, valid date and location.';
 if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(shift.start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(shift.end) || minutes(shift.end)<=minutes(shift.start)) return 'End time must be after start time. Split overnight shifts across two dates.';
 if (!Number.isFinite(shift.breakMinutes)||shift.breakMinutes<0||shift.breakMinutes>=minutes(shift.end)-minutes(shift.start)) return 'The unpaid break must be shorter than the shift.';
 if (!shift.personId) return null;
 const person=people.find(p=>p.id===shift.personId);
 if (!person || person.team!==shift.team) return 'Choose someone from the correct team.';
 if(onLeave(shift.personId,shift.date,leaves)) return `${person.name} is on approved leave that day.`;
 if(shifts.some(s=>s.id!==shift.id&&s.personId===shift.personId&&s.date===shift.date&&minutes(s.start)<minutes(shift.end)&&minutes(s.end)>minutes(shift.start))) return `${person.name} already has an overlapping shift.`;
 return null;
}
export function seedShifts():Shift[] {
 const shifts:Shift[]=[];
 people.forEach((p,i)=>{ [0,1,2,3,4,5,6].filter(d=> !([1,3,5,0,2,1,4,3][i]===d || (i===2&&d===4) || (i===4&&d===3) || (i===7&&d===6))).forEach(d=>{
 const morning=(i+d)%3!==0; const hospitality=p.team==='Hospitality';
 shifts.push({id:`s-${i}-${d}`,personId:p.id,date:addDays(BASE_WEEK,d),start:hospitality?'09:00':morning?'08:00':'14:00',end:hospitality?'17:00':morning?'12:00':'18:00',breakMinutes:hospitality?60:0,location:locations[(i+Math.floor(d/3))%locations.length],title:hospitality?'Front desk':morning?'Learn to Swim':'Squad training',team:p.team,published:d<3});
 });});
 [1,4,6].forEach((d,i)=>shifts.push({id:`open-${d}`,personId:'',date:addDays(BASE_WEEK,d),start:'14:00',end:'18:00',breakMinutes:0,location:locations[i],title:i===1?'Front desk':'Learn to Swim',team:i===1?'Hospitality':'Coaching',published:false}));
 // Meeting example: separate morning and afternoon sessions; the travel gap is unpaid.
 const morning=shifts.find(s=>s.id==='s-3-2')!;
 Object.assign(morning,{start:'09:00',end:'12:00',location:'Orchard'});
 shifts.push({...morning,id:'s-3-2-afternoon',start:'15:00',end:'18:00',location:'Siglap',title:'Afternoon coaching'});
 return shifts;
}
export const seedLeave:Leave[]=[
 {id:'l1',personId:'p3',date:'2026-09-18',endDate:'2026-09-18',type:'Annual leave',reason:'Family commitment',status:'Approved'},
 {id:'l2',personId:'p5',date:'2026-09-17',endDate:'2026-09-17',type:'Annual leave',reason:'Personal appointment',status:'Pending'},
 {id:'l3',personId:'p7',date:'2026-09-21',endDate:'2026-09-22',type:'Annual leave',reason:'Short family break',status:'Pending'},
];
export function seedTimesheets():Timesheet[]{return seedShifts().filter(s=>s.personId&&s.date<='2026-09-16').map((s,i)=>({id:`t-${s.id}`,personId:s.personId,date:s.date,start:s.start,end:s.end,breakMinutes:s.breakMinutes,location:s.location,approved:i%4!==0}));}
export function payrollRows(timesheets:Timesheet[]) {return people.map(p=>{const rows=timesheets.filter(t=>t.personId===p.id);const hours=rows.filter(t=>t.approved).reduce((n,t)=>n+paidHours(t),0);return {...p,hours,pending:rows.filter(t=>!t.approved).length,gross:Math.round(hours*p.rate*100)/100};});}
export function leaveApprovalError(leave:Leave,shifts:Shift[]):string|null {
 if(people.find(p=>p.id===leave.personId)?.team==='Coaching'&&!leave.lessonPlanUrl)return 'Attach the coaching lesson plan before approving leave.';
 if(shifts.some(s=>s.personId===leave.personId&&s.date>=leave.date&&s.date<=leave.endDate))return 'Reassign this person’s shifts before approving their leave.';
 return null;
}
