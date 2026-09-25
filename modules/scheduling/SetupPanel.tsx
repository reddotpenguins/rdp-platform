'use client';
import Link from 'next/link';
import {CheckCircle2,ArrowRight,Users,MapPin,CalendarDays,ClipboardCheck} from 'lucide-react';
import type {SchedulingDashboardData} from '@/lib/supabase/scheduling';

export default function SetupPanel({data,onTab,onCreate}:{data:SchedulingDashboardData;onTab:(tab:string)=>void;onCreate:()=>void}){
 const staff=data.staff.filter(p=>p.active);const centres=data.locations.filter(l=>l.active);
 const assigned=data.shifts.filter(s=>s.status!=='cancelled'&&s.assignments.length>0);
 const published=assigned.filter(s=>s.status==='published');
 const steps=[
  {title:'Check your team',detail:`${staff.length} active staff profiles. Start with a small group of testers using their own accounts.`,done:staff.length>0,icon:Users,action:()=>onTab('Team'),label:'View team'},
  {title:'Set up your centres',detail:`${centres.length} active centres. Confirm the location for each shift; entrance coordinates are needed for GPS clock-in.`,done:centres.length>0,icon:MapPin,action:()=>onTab('Sites & centres'),label:'Manage centres'},
  {title:'Create the first shifts',detail:`${assigned.length} assigned shifts in the selected week. Use an exact-time preset or create a shift and choose a coach.`,done:assigned.length>0,icon:CalendarDays,action:onCreate,label:'Create shift'},
  {title:'Review and publish',detail:`${published.length} published, assigned shifts this week. Staff see published shifts in their own time clock.`,done:published.length>0,icon:ClipboardCheck,action:()=>onTab('Schedule'),label:'Review roster'}
 ];
 return <><section className="wf-setup-intro"><div><span className="wf-eyebrow">START WITH ONE CENTRE</span><h2>Get your team ready for a pilot</h2><p>Follow these steps, then test one full shift from clock-in to manager review.</p></div><Link className="wf-button" href="/prototypes/workforce">Practise with sample data<ArrowRight size={16}/></Link></section><div className="wf-setup-grid">{steps.map((step,i)=><section className="wf-panel wf-setup-step" key={step.title}><div className="wf-setup-step-top"><step.icon size={22}/><span>{step.done?<><CheckCircle2 size={15}/>Records present</>:`Step ${i+1}`}</span></div><h2>{step.title}</h2><p>{step.detail}</p><button className="wf-button" disabled={!!data.error} onClick={step.action}>{step.label}<ArrowRight size={15}/></button></section>)}</div><section className="wf-panel wf-setup-check"><h2>Before inviting testers</h2><p>These counts confirm saved records exist, not that the full system is ready. Check the following together with a staff member.</p><ol><li>Verify they can sign in and see their own published shift.</li><li>Confirm the centre entrance coordinates and allowed radius.</li><li>Open Time clock & timesheets and check that attendance loads without a setup error.</li><li>At the centre, clock in and out using the staff account; have another manager review the hours.</li></ol><div className="wf-info">Google street maps can be configured later. GPS boundary checks use saved coordinates and do not depend on the map API key. NFC, automatic clock-out and payroll are separate rollout steps.</div><Link className="wf-button primary" href="/attendance">Open time clock & timesheets</Link></section></>;
}
