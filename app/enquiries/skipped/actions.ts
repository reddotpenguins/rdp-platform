"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { validateSkipReview } from "@/lib/enquiryImportSkips";
import { canManageCustomerEnquiries } from "@/lib/staffRoles";
import { createClient } from "@/lib/supabase/server";
import { requireActiveStaffSession } from "@/lib/supabase/staffProfile";

export async function reviewSkippedImport(form: FormData) {
  const { profile } = await requireActiveStaffSession();
  if (!canManageCustomerEnquiries(profile)) redirect("/dashboard");
  const id = String(form.get("skipId") ?? "");
  const decision = String(form.get("decision") ?? "");
  const notes = String(form.get("notes") ?? "").trim();
  const validation = validateSkipReview(id, decision, notes);
  if (validation) redirect(`/enquiries/skipped?error=${encodeURIComponent(validation)}`);

  // Uses the signed-in user's session. RLS checks active admin access and identity.
  const { error } = await createClient().from("enquiry_import_skip_reviews")
    .insert({ skip_id: id, decision, notes });
  if (error) redirect("/enquiries/skipped?error=Could%20not%20save%20the%20review.%20Please%20try%20again.");
  revalidatePath("/enquiries/skipped");
  redirect("/enquiries/skipped?saved=1");
}
