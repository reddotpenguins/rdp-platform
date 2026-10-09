'use server';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {requirePayroll} from './payrollActions';
import {createClient} from '@/lib/supabase/server';
import {createOptionalSupabaseAdminClient} from '@/lib/supabase/admin';
import {getQuickBooksConfig,getQuickBooksCompanyBaseUrl,refreshQuickBooksAccessToken,getQuickBooksTokenExpiryDate} from '@/lib/quickbooks';
const text=(f:FormData,k:string)=>String(f.get(k)||'').trim();
function finish(month:string,error?:string){revalidatePath('/workforce');redirect(`/workforce?view=quickbooks&month=${encodeURIComponent(month)}&${error?'error':'saved'}=${encodeURIComponent(error||'QuickBooks journal confirmed.')}`);}
async function context(id:string|null){
 const profile=await requirePayroll();const db=createClient();const lookup=id?await db.from('workforce_pay_runs').select('*').eq('id',id).single():{data:{organisation_id:(await db.rpc('current_staff_organisation_id')).data},error:null};const run=lookup.data;if(lookup.error||!run?.organisation_id)throw new Error('Payroll run not found.');
 const admin=createOptionalSupabaseAdminClient(),config=getQuickBooksConfig();if(!admin||!config)throw new Error('Configure the server Supabase key and QuickBooks connection in Vercel first.');
 const {data:connection}=await admin.from('quickbooks_connections').select('*').eq('organisation_id',run.organisation_id).eq('environment',config.environment).eq('active',true).single();if(!connection)throw new Error('Connect QuickBooks from Claims setup first.');
 if(run.realm_id&&(run.realm_id!==connection.realm_id||run.environment!==config.environment))throw new Error('This run is bound to a different QuickBooks company or environment. Reconnect that company to reconcile.');
 if(Date.parse(connection.access_token_expires_at)<Date.now()+120000){
 const tokens=await refreshQuickBooksAccessToken(config,connection.refresh_token);
 const updates={access_token:tokens.access_token,refresh_token:tokens.refresh_token,access_token_expires_at:getQuickBooksTokenExpiryDate(tokens.expires_in),refresh_token_expires_at:getQuickBooksTokenExpiryDate(tokens.x_refresh_token_expires_in),updated_at:new Date().toISOString()};
 const saved=await admin.from('quickbooks_connections').update(updates).eq('id',connection.id);if(saved.error)throw new Error('Could not save refreshed QuickBooks connection. Reconnect before posting.');Object.assign(connection,updates);
 }
 const base=getQuickBooksCompanyBaseUrl(config.environment,connection.realm_id);
 async function request(path:string,body?:unknown){const response=await fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${connection.access_token}`,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:AbortSignal.timeout(20000)});const data=await response.json();if(!response.ok||data.Fault)throw new Error('QuickBooks could not confirm the request. Check the company connection and account mapping.');return data;}
 return {profile,run,admin,config,connection,request};
}
export async function verifyPayrollMapping(journal:{Line:{JournalEntryLineDetail:{PostingType:string;AccountRef:{value:string}}}[]}){
 const {request}=await context(null);const prefs=await request('/preferences');if(prefs.Preferences?.CurrencyPrefs?.HomeCurrency?.value!=='SGD')throw new Error('The connected QuickBooks company must use SGD.');
 for(const line of journal.Line){const accountId=line.JournalEntryLineDetail.AccountRef.value;if(!/^\d+$/.test(accountId))throw new Error('Account IDs must be numeric.');const a=(await request('/account/'+accountId)).Account;const debit=line.JournalEntryLineDetail.PostingType==='Debit';if(!a?.Active||!(debit?['Expense','Other Expense']:['Other Current Liability','Long Term Liability']).includes(a.AccountType))throw new Error('An account is inactive or has the wrong expense/liability type.');}
 return true;
}
export async function postPayroll(f:FormData){let issue:string|undefined;const month=text(f,'month');
 try{
 if(text(f,'confirm')!=='yes')throw new Error('Confirm posting the reviewed journal.');
 const {profile,run,admin,config,connection,request}=await context(text(f,'id'));
 if(run.status==='posted')throw new Error('This journal is already posted.');if(run.status!=='finalized')throw new Error('A previous attempt needs reconciliation. Do not post again.');
 const prefs=await request('/preferences');if(prefs.Preferences?.CurrencyPrefs?.HomeCurrency?.value!=='SGD')throw new Error('Verify that the connected QuickBooks company uses SGD before posting.');
 for(const line of run.journal.Line){const accountId=line.JournalEntryLineDetail.AccountRef.value;if(!/^\d+$/.test(accountId))throw new Error('Account IDs must be numeric.');const a=(await request('/account/'+accountId)).Account;const debit=line.JournalEntryLineDetail.PostingType==='Debit';if(!a?.Active||!(debit?['Expense','Other Expense']:['Other Current Liability','Long Term Liability']).includes(a.AccountType))throw new Error('An account is inactive or has the wrong expense/liability type.');}
 const locked=await admin.from('workforce_pay_runs').update({status:'posting',posting_at:new Date().toISOString(),realm_id:connection.realm_id,environment:config.environment}).eq('id',run.id).eq('status','finalized').select('id').maybeSingle();if(locked.error||!locked.data)throw new Error('Another posting attempt has started. Refresh to check its status.');
 try{
 const result=await request('/journalentry?requestid='+encodeURIComponent('rdp-pay-'+run.id),run.journal);const journal=result.JournalEntry;if(!journal?.Id)throw new Error('Journal confirmation was missing.');
 const saved=await admin.from('workforce_pay_runs').update({status:'posted',quickbooks_id:String(journal.Id),posted_at:new Date().toISOString()}).eq('id',run.id).eq('status','posting');if(saved.error)throw new Error('Journal may have posted. Reconcile before retrying.');
 await admin.from('audit_events').insert({organisation_id:run.organisation_id,actor_staff_id:profile.id,event_type:'payroll.quickbooks_posted',entity_type:'workforce_pay_runs',entity_id:run.id,metadata:{journal_id:String(journal.Id)}});
 }catch{await admin.from('workforce_pay_runs').update({status:'uncertain'}).eq('id',run.id).eq('status','posting');throw new Error('Posting could not be confirmed. Use Check existing journal; do not create another journal manually.');}
 }catch(e){issue=e instanceof Error?e.message:'Posting failed.';}finish(month,issue);
}
export async function reconcilePayroll(f:FormData){let issue:string|undefined;const month=text(f,'month');try{
 const {profile,run,admin,request}=await context(text(f,'id'));if(!['posting','uncertain','posted'].includes(run.status))throw new Error('There is no posting attempt to reconcile.');
 const doc=String(run.journal.DocNumber);if(!/^RDP-PAY-2026-\d{2}$/.test(doc))throw new Error('Unexpected journal reference.');
 const data=await request('/query?query='+encodeURIComponent(`select * from JournalEntry where DocNumber = '${doc}'`));const rows=data.QueryResponse?.JournalEntry||[];
 if(rows.length!==1)throw new Error('No unique matching journal was found. Leave this run unresolved and have an administrator investigate; no new posting was sent.');
 const actual=rows[0];const normalize=(lines:{Amount:number;DetailType:string;JournalEntryLineDetail?:{PostingType:string;AccountRef:{value:string}}}[])=>lines.filter(l=>l.DetailType==='JournalEntryLineDetail').map(l=>`${l.JournalEntryLineDetail?.PostingType}:${l.JournalEntryLineDetail?.AccountRef.value}:${Math.round(l.Amount*100)}`).sort().join('|');
 if(actual.TxnDate!==run.journal.TxnDate||normalize(actual.Line)!==normalize(run.journal.Line))throw new Error('The existing journal differs from this payroll. Manager reconciliation is required.');
 const saved=await admin.from('workforce_pay_runs').update({status:'posted',quickbooks_id:String(actual.Id),posted_at:new Date().toISOString()}).eq('id',run.id);if(saved.error)throw new Error('Could not store the journal confirmation.');
 await admin.from('audit_events').insert({organisation_id:run.organisation_id,actor_staff_id:profile.id,event_type:'payroll.quickbooks_reconciled',entity_type:'workforce_pay_runs',entity_id:run.id,metadata:{journal_id:String(actual.Id)}});
 }catch(e){issue=e instanceof Error?e.message:'Could not reconcile.';}finish(month,issue);}
