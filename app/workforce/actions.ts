'use server';
import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {requireActiveStaffSession} from '@/lib/supabase/staffProfile';
import {hasStaffPermission} from '@/lib/staffRoles';
const text=(f:FormData,k:string)=>String(f.get(k)||'').trim();
async function call(name:string,args:Record<string,unknown>,manager=false){
 const {profile}=await requireActiveStaffSession();
 if(!hasStaffPermission(profile,manager?'schedule.manage':'schedule.viewOwn'))throw new Error('Staff access required');
 const {error}=await createClient().rpc(name,args);
 return error?(error.code==='P0001'?error.message:'Could not save. Check database setup and retry.'):null;
}
function finish(view:string,error:string|null){revalidatePath('/workforce');revalidatePath('/schedule');revalidatePath('/attendance');redirect(`/workforce?view=${view}&${error?'error':'saved'}=${encodeURIComponent(error||'Saved successfully.')}`);}
export async function requestLeave(f:FormData){
 const {profile}=await requireActiveStaffSession();const db=createClient();const file=f.get('attachment');let path:string|undefined;
 if(file instanceof File&&file.size){
  const bytes=new Uint8Array(await file.arrayBuffer());
  const mime=bytes[0]===0x25&&bytes[1]===0x50&&bytes[2]===0x44&&bytes[3]===0x46?'application/pdf':bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47?'image/png':bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff?'image/jpeg':null;
  if(!mime||file.size>10*1024*1024)finish('time-off','Use a PDF, PNG or JPEG lesson plan up to 10 MB.');
  const {data:org}=await db.rpc('current_staff_organisation_id');if(!org)finish('time-off','Active staff access required.');
  path=`${org}/${profile.id}/${crypto.randomUUID()}.${mime==='application/pdf'?'pdf':mime==='image/png'?'png':'jpg'}`;
  const upload=await db.storage.from('workforce-lesson-plans').upload(path,bytes,{contentType:mime!,upsert:false});if(upload.error)finish('time-off','Lesson plan upload failed. Check storage setup and retry.');
 }
 const result=await db.rpc('workforce_leave_request',{p_start:text(f,'start')+'+08:00',p_end:text(f,'end')+'+08:00',p_reason:text(f,'reason'),p_plan:text(f,'plan')});
 if(result.error)finish('time-off',result.error.code==='P0001'?result.error.message:'Request could not be saved.');
 if(path){const attached=await db.rpc('workforce_attach_plan',{p_id:result.data,p_path:path});if(attached.error)finish('time-off','The request was saved, but its attachment could not be linked. Contact your manager; do not submit the request again.');}
 finish('time-off',null);
}
export async function reviewLeave(f:FormData){finish('time-off',await call('workforce_leave_review',{p_id:text(f,'id'),p_approve:text(f,'decision')==='approve',p_note:text(f,'note')},true));}
export async function requestCover(f:FormData){finish('cover',await call('workforce_cover_request',{p_shifts:f.getAll('shifts').map(String),p_replacement:text(f,'replacement'),p_original:text(f,'original')||null,p_reason:text(f,'reason')}));}
export async function reviewCover(f:FormData){finish('cover',await call('workforce_cover_review',{p_id:text(f,'id'),p_approve:text(f,'decision')==='approve',p_note:text(f,'note')},true));}
export async function copyToStaff(f:FormData){
 const error=await call('workforce_copy_to_staff',{p_shifts:f.getAll('shifts').map(String),p_staff:f.getAll('staff').map(String)},true);
 revalidatePath('/schedule');redirect(`/schedule?week=${encodeURIComponent(text(f,'weekStartDate'))}&${error?'error':'saved'}=${encodeURIComponent(error||'Shifts copied as drafts. Review and publish when ready.')}`);
}
export async function correctAutoEnd(f:FormData){const error=await call('workforce_correct_auto_end',{p_id:text(f,'id'),p_end:text(f,'end')+'+08:00',p_note:text(f,'note')},true);revalidatePath('/attendance');redirect('/attendance?'+(error?'error=':'saved=')+encodeURIComponent(error||'End time corrected. Review attendance before approval.'));}
