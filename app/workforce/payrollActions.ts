'use server';
import {createHash} from 'node:crypto';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {createClient} from '@/lib/supabase/server';
import {createOptionalSupabaseAdminClient} from '@/lib/supabase/admin';
import {requireActiveStaffSession} from '@/lib/supabase/staffProfile';
import {hasStaffPermission} from '@/lib/staffRoles';
import {calculateLivePayroll,type PaySource} from '@/lib/workforcePayroll';
import {verifyPayrollMapping} from './quickbooksActions';
import {buildPayrollJournal} from '@/modules/workforce-prototype/payroll-journal';
const text=(f:FormData,k:string)=>String(f.get(k)||'').trim();
export async function requirePayroll(){const {profile}=await requireActiveStaffSession();if(!hasStaffPermission(profile,'schedule.payroll'))throw new Error('Payroll manager access required');return profile;}
function finish(month:string,error?:string){revalidatePath('/workforce');redirect(`/workforce?view=payroll&month=${encodeURIComponent(month)}&${error?'error':'saved'}=${encodeURIComponent(error||'Payroll information saved.')}`);}
export async function savePayProfile(f:FormData){await requirePayroll();const month=text(f,'month');const hourly=Number(text(f,'hourly')),other=Number(text(f,'other'));
 if(!Number.isFinite(hourly)||!Number.isFinite(other)||hourly<0||other<0)finish(month,'Enter valid non-negative amounts.');
 const {error}=await createClient().rpc('workforce_pay_profile',{p_staff:text(f,'staff'),p_month:month,p_hourly:Math.round(hourly*100),p_other:Math.round(other*100),p_birth:text(f,'birth'),p_residency:text(f,'residency'),p_pr:text(f,'pr'),p_election:text(f,'election')});finish(month,error?(error.code==='P0001'?error.message:'Profile could not be saved. Check the fields and database setup.'):undefined);
}
export async function finalizePayroll(f:FormData){
 const profile=await requirePayroll();const month=text(f,'month');let issue:string|undefined;
 try{
 if(text(f,'reviewed')!=='yes')throw new Error('Confirm the monthly review first.');
 const admin=createOptionalSupabaseAdminClient();if(!admin)throw new Error('Server payroll storage needs SUPABASE_SERVICE_ROLE_KEY configured in Vercel.');
 const {data,error}=await createClient().rpc('workforce_payroll_source',{p_month:month});if(error)throw new Error('Could not load payroll inputs.');
 if(createHash('sha256').update(JSON.stringify(data)).digest('hex')!==text(f,'fingerprint'))throw new Error('Payroll changed since this page loaded. Refresh and review again.');
 const result=calculateLivePayroll(month,data as PaySource);if(result.errors.length)throw new Error(result.errors.join(' '));
 const journal=buildPayrollJournal(month,result.totals,{wages:text(f,'wages'),employerCpf:text(f,'employerCpf'),cpfPayable:text(f,'cpfPayable'),netPayable:text(f,'netPayable')});
 journal.DocNumber=`RDP-PAY-${month}`;journal.PrivateNote='Reviewed Ordinary Wages and CPF journal. Does not record bank payment, CPF submission, SDL, Additional Wages or other deductions.';
 await verifyPayrollMapping(journal);
 const saved=await admin.rpc('workforce_finalize_payroll',{p_actor:profile.id,p_month:month,p_source:data,p_results:result,p_journal:journal});if(saved.error)throw new Error(saved.error.code==='P0001'?saved.error.message:'This payroll month could not be finalized, or was already finalized.');
 }catch(e){issue=e instanceof Error?e.message:'Could not finalize payroll.';}finish(month,issue);
}
