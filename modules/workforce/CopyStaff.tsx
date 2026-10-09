'use client';
import {useState} from 'react';
import {copyToStaff} from '@/app/workforce/actions';
import {Submit} from './RequestForms';
type Person={id:string;fullName:string};
type Shift={id:string;assignments:{staffProfileId:string}[]};
export default function CopyStaff({people,shifts,week,shiftId}:{people:Person[];shifts:Shift[];week:string;shiftId?:string}){
 const [source,setSource]=useState('');const ids=shiftId?[shiftId]:shifts.filter(s=>s.assignments.some(a=>a.staffProfileId===source)).map(s=>s.id);
 return <form action={copyToStaff} className="wf-form wf-copy-staff"><h3>{shiftId?'Copy this shift to staff':'Copy one person’s week to staff'}</h3><input type="hidden" name="weekStartDate" value={week}/>{!shiftId&&<label>Copy from<select value={source} onChange={e=>setSource(e.target.value)} required><option value="">Select staff member</option>{people.map(p=><option key={p.id} value={p.id}>{p.fullName}</option>)}</select></label>}{ids.map(id=><input type="hidden" name="shifts" value={id} key={id}/>)}<fieldset><legend>Copy to</legend>{people.filter(p=>p.id!==source&&!shifts.find(s=>s.id===shiftId)?.assignments.some(a=>a.staffProfileId===p.id)).map(p=><label key={p.id}><input type="checkbox" name="staff" value={p.id}/>{p.fullName}</label>)}</fieldset><p>Copies keep the same dates, times and centre. They are saved as drafts. All selections must pass conflict, leave and qualification checks; otherwise nothing is copied.</p><Submit disabled={!ids.length}>Copy {shiftId?'shift':`${ids.length} shifts`} to selected staff</Submit></form>;
}
