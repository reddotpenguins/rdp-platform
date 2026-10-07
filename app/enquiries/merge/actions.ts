"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isTicketId, mergeFields, validateMergeChoices } from "@/lib/enquiryMerge";
import { canManageCustomerEnquiries } from "@/lib/staffRoles";
import { createClient } from "@/lib/supabase/server";
import { requireActiveStaffSession } from "@/lib/supabase/staffProfile";

export async function mergeEnquiryTickets(form: FormData): Promise<{ error: string } | { targetId: string }> {
  const { profile } = await requireActiveStaffSession();
  if (!canManageCustomerEnquiries(profile)) redirect("/dashboard");
  const text = (key: string) => String(form.get(key) ?? "");
  const target = text("target");
  const source = text("source");
  const reason = text("reason").trim();
  const choices = Object.fromEntries(mergeFields.map(([key]) => [key, text(`choice_${key}`)]));
  if (!isTicketId(target) || !isTicketId(source) || target === source) return { error: "Choose two different tickets." };
  if (text("confirmed") !== "yes") return { error: "Confirm that both tickets concern the same child and enquiry." };
  if (!reason || reason.length > 4000) return { error: "Add merge notes between 1 and 4,000 characters." };
  if (!validateMergeChoices(choices)) return { error: "Choose which details to keep for each field." };
  const targetVersion = text("targetVersion"), sourceVersion = text("sourceVersion");
  if (!Number.isFinite(Date.parse(targetVersion)) || !Number.isFinite(Date.parse(sourceVersion))) return { error: "Reload the tickets before merging." };
  const { data, error } = await createClient().rpc("merge_enquiry_tickets", {
    p_target: target, p_source: source, p_target_version: targetVersion,
    p_source_version: sourceVersion, p_choices: choices, p_reason: reason
  });
  if (error) {
    if (/changed while|already been merged/.test(error.message)) return { error: error.message };
    return { error: "The merge could not be saved. No tickets were changed. Check that the merge database setup is installed, then refresh and try again." };
  }
  revalidatePath("/enquiries");
  revalidatePath("/enquiries/skipped");
  revalidatePath("/enquiries/merge");
  return { targetId: String(data) };
}
