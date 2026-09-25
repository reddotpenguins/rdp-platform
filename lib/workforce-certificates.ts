export type StaffCertificate={id:string;staff_profile_id:string;qualification_id:string;awarded_at:string|null;expires_at:string|null;notes:string|null};
export function singaporeToday(now=new Date()){return now.toLocaleDateString('en-CA',{timeZone:'Asia/Singapore'});}
export function validDate(value:string){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;}
export function certificateStatus(record:Pick<StaffCertificate,'awarded_at'|'expires_at'>|undefined,today:string){
 if(!record)return {label:'Missing',tone:'missing',days:null};
 if(record.awarded_at&&record.awarded_at>today)return {label:'Not yet valid',tone:'missing',days:null};
 if(!record.expires_at)return {label:'Expiry not recorded',tone:'unknown',days:null};
 const days=Math.round((Date.parse(record.expires_at)-Date.parse(today))/86400000);
 if(!Number.isFinite(days))return {label:'Check expiry date',tone:'unknown',days:null};
 if(days<0)return {label:`Expired ${-days}d ago`,tone:'expired',days};
 if(days===0)return {label:'Expires today',tone:'urgent',days};
 return {label:`${days} days left`,tone:days<=7?'urgent':days<=30?'soon':'valid',days};
}
export function qualificationCoversShift(record:Pick<StaffCertificate,'awarded_at'|'expires_at'>,startsAt:string,endsAt:string){
 const start=singaporeToday(new Date(startsAt));const last=singaporeToday(new Date(Date.parse(endsAt)-1));
 return (!record.awarded_at||record.awarded_at<=start)&&(!record.expires_at||record.expires_at>=last);
}
