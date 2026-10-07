import { redirect } from "next/navigation";
import { EnquiriesClient } from "@/components/EnquiriesClient";
import { isTicketId } from "@/lib/enquiryMerge";
import { canManageCustomerEnquiries } from "@/lib/staffRoles";
import { getCustomerEnquiries } from "@/lib/supabase/enquiries";
import { requireActiveStaffSession } from "@/lib/supabase/staffProfile";

export const dynamic = "force-dynamic";

type EnquiriesPageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default async function EnquiriesPage({ searchParams }: EnquiriesPageProps) {
  const { profile } = await requireActiveStaffSession();

  if (!canManageCustomerEnquiries(profile)) {
    redirect("/dashboard");
  }

  const search = getSearchParam(searchParams, "search");
  const enquiriesResult = await getCustomerEnquiries(search);
  if (search && isTicketId(search) && enquiriesResult.enquiries[0] && enquiriesResult.enquiries[0].id !== search) {
    redirect(`/enquiries?tab=all&search=${encodeURIComponent(enquiriesResult.enquiries[0].id)}&saved=${encodeURIComponent("This ticket was merged. Showing the main ticket.")}`);
  }

  return (
    <EnquiriesClient
      dataError={enquiriesResult.error}
      enquiries={enquiriesResult.enquiries}
      errorMessage={getSearchParam(searchParams, "error")}
      initialFilters={{
        centre: getSearchParam(searchParams, "centre"),
        dateFrom: getSearchParam(searchParams, "from"),
        dateTo: getSearchParam(searchParams, "to"),
        search: getSearchParam(searchParams, "search"),
        sort: getSearchParam(searchParams, "sort"),
        source: getSearchParam(searchParams, "source"),
        tab: getSearchParam(searchParams, "tab"),
        type: getSearchParam(searchParams, "type")
      }}
      savedMessage={getSearchParam(searchParams, "saved")}
      staffProfile={profile}
    />
  );
}

function getSearchParam(
  searchParams: EnquiriesPageProps["searchParams"],
  key: string
) {
  const value = searchParams?.[key];

  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}
