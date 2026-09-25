'use server';
import {revalidatePath} from 'next/cache';
import {createClient} from '@/lib/supabase/server';
import {requireActiveStaffSession} from '@/lib/supabase/staffProfile';
import {hasStaffPermission} from '@/lib/staffRoles';
export async function clockAction(input:{shiftId:string;direction:'in'|'out';latitude:number;longitude:number;accuracy:number;capturedAt:string;mood?:string;feedback?:string;followUp?:boolean}){
 const {profile}=await requireActiveStaffSession();
 if(!hasStaffPermission(profile,'schedule.clock'))return {error:'Clock access is not enabled for your account.'};
 const {error}=await createClient().rpc('workforce_clock',{p_shift:input.shiftId,p_direction:input.direction,p_lat:input.latitude,p_lng:input.longitude,p_accuracy:input.accuracy,p_captured_at:input.capturedAt,p_mood:input.mood||null,p_feedback:input.feedback||null,p_follow_up:!!input.followUp});
 if(error)return {error:error.code==='23505'?'You already have a clock-in. Refresh to view it.':error.code==='P0001'?error.message:'Clock could not be saved. Refresh before trying again.'};
 revalidatePath('/attendance');return {message:input.direction==='in'?'Clock-in saved.':'Clock-out saved for manager review.'};
}
export async function reviewAttendance(input:{id:string;approve:boolean;breakMinutes:number;note:string}){
 const {profile}=await requireActiveStaffSession();
 if(!hasStaffPermission(profile,'schedule.manage'))return {error:'Scheduling manager access required.'};
 const {error}=await createClient().rpc('workforce_review',{p_id:input.id,p_approve:input.approve,p_break:input.breakMinutes,p_note:input.note});
 if(error)return {error:error.code==='P0001'?error.message:'Attendance could not be reviewed. Refresh before trying again.'};
 revalidatePath('/attendance');return {message:'Attendance review saved.'};
}

export async function saveOwnAvailability(input:{date:string;period:string;status:string}){
 const {profile}=await requireActiveStaffSession();
 if(!hasStaffPermission(profile,'schedule.viewOwn'))return {error:'Staff scheduling access required.'};
 const {error}=await createClient().rpc('workforce_set_availability',{p_date:input.date,p_period:input.period,p_status:input.status});
 if(error)return {error:error.code==='P0001'?error.message:'Availability could not be saved. Check the date and retry.'};
 revalidatePath('/attendance');revalidatePath('/schedule');return {message:'Your availability has been saved for the scheduling manager.'};
}
