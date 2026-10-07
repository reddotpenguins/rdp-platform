import Link from "next/link";
import { redirect } from "next/navigation";
import { reviewSkippedImport } from "./actions";
import { escapeSkipSearch, isSkipDecision, skipDecisions, skipQueuePage, type SkipDecision } from "@/lib/enquiryImportSkips";
import { canManageCustomerEnquiries } from "@/lib/staffRoles";
import { createClient } from "@/lib/supabase/server";
import { requireActiveStaffSession } from "@/lib/supabase/staffProfile";

export const dynamic = "force-dynamic";
type Row = {
  id: string; created_at: string; respondio_conversation_id: string;
  respondio_contact_id: string | null; parent_name: string | null;
  event_type: string | null; event_id: string | null; source_event_at: string | null;
  error_message: string; incoming_data: Record<string, unknown>;
  decision: SkipDecision; review_notes: string | null; reviewed_at: string | null;
  existing_enquiry_id: string | null;
};
const field = "w-full rounded-md border border-line bg-field px-3 py-2 text-sm";
const button = "inline-flex items-center justify-center rounded-md border border-line bg-paper px-3 py-2 text-sm font-semibold hover:border-teal hover:text-teal";
const date = (value: string) => new Intl.DateTimeFormat("en-SG", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Singapore" }).format(new Date(value));

export default async function SkippedImportsPage({ searchParams = {} }: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const { profile } = await requireActiveStaffSession();
  if (!canManageCustomerEnquiries(profile)) redirect("/dashboard");
  const param = (key: string) => typeof searchParams[key] === "string" ? searchParams[key] as string : "";
  const requested = param("status");
  const status = requested === "all" || isSkipDecision(requested) ? requested : "needs_review";
  const search = param("search").trim().slice(0, 200);
  const page = skipQueuePage(param("page"));
  const size = 25;
  let query = createClient().from("enquiry_import_skip_queue").select("*", { count: "exact" })
    .order("created_at", { ascending: false }).order("id", { ascending: false });
  if (status !== "all") query = query.eq("decision", status);
  if (search) query = query.ilike("search_text", `%${escapeSkipSearch(search)}%`);
  const { data, error, count } = await query.range((page - 1) * size, page * size - 1);
  const rows = (data ?? []) as Row[];
  const link = (next: number) => `/enquiries/skipped?${new URLSearchParams({ status, search, page: String(next) })}`;

  return <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6">
    <header className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-line bg-paper p-5 shadow-panel">
      <div><p className="text-sm font-semibold uppercase text-teal">Enquiries</p>
        <h1 className="text-2xl font-semibold text-ink">Skipped imports</h1>
        <p className="mt-2 text-sm text-slate-600">Review incoming data that was not saved as an enquiry. Decisions here do not add or update client records.</p>
      </div>
      <Link className={button} href="/enquiries">Back to enquiries</Link>
    </header>
    {param("saved") === "1" && <p role="status" className="rounded-lg bg-teal/10 p-4">Review saved. The original skipped data is unchanged.</p>}
    {param("error") && <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-800">{param("error").slice(0, 200)}</p>}
    <form className="grid gap-3 rounded-lg border border-line bg-paper p-4 sm:grid-cols-[1fr_240px_auto]">
      <label className="text-sm font-medium">Search<input className={field} name="search" defaultValue={search} maxLength={200} placeholder="Parent name, conversation or contact ID" /></label>
      <label className="text-sm font-medium">Review status<select className={field} name="status" defaultValue={status}>
        <option value="all">All statuses</option>{Object.entries(skipDecisions).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      <button className={`${button} self-end`} type="submit">Apply filters</button>
    </form>
    {error ? <p role="alert" className="rounded-lg bg-amber-50 p-4 text-amber-900">Skipped imports could not be loaded. Ask your administrator to check that the skipped-import setup has been applied and your access is enabled.</p> : <>
      <p className="text-sm text-slate-600">{count ?? 0} matching skipped events · Times shown in Singapore time</p>
      {!rows.length && <div className="rounded-lg border border-line bg-paper p-8 text-center"><h2 className="font-semibold">No skipped imports in this view</h2><p className="mt-2 text-sm text-slate-600">Try another filter. New events appear here once Make is connected to the skip log.</p></div>}
      {rows.map(row => <article key={row.id} className="min-w-0 rounded-lg border border-line bg-paper p-5 shadow-panel">
        <div className="flex flex-wrap items-start justify-between gap-3"><div>
          <h2 className="text-lg font-semibold">{row.parent_name || "Name not supplied"}</h2>
          <p className="break-all text-sm text-slate-600">Conversation {row.respondio_conversation_id} · Logged {date(row.created_at)}</p>
        </div><span className="rounded-full bg-slate-100 px-3 py-1 text-sm">{skipDecisions[row.decision]}</span></div>
        <p className="mt-3 break-words text-sm text-slate-700">{row.error_message}</p>
        {row.existing_enquiry_id ? <Link className={`${button} mt-3`} href={`/enquiries?tab=all&search=${encodeURIComponent(row.existing_enquiry_id)}`}>View matching enquiry</Link> : <p className="mt-3 text-sm text-amber-800">No current enquiry matches this conversation ID. Search the client database before deciding.</p>}
        <details className="mt-4"><summary className="cursor-pointer font-medium text-teal">Inspect skipped data and review</summary>
          <dl className="my-3 grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-slate-500">Contact ID</dt><dd className="break-all">{row.respondio_contact_id || "Not supplied"}</dd></div>
            <div><dt className="text-slate-500">Event</dt><dd>{row.event_type || "Not supplied"}</dd></div>
            <div><dt className="text-slate-500">Event ID</dt><dd className="break-all">{row.event_id || "Not supplied"}</dd></div>
            <div><dt className="text-slate-500">Event time</dt><dd>{row.source_event_at ? date(row.source_event_at) : "Not supplied"}</dd></div>
          </dl>
          <p className="mb-2 text-sm text-slate-600">Original enquiry fields received from Make:</p>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-field p-4 text-xs">{JSON.stringify(row.incoming_data, null, 2)}</pre>
          {row.reviewed_at && <div className="mt-4 rounded-md bg-slate-50 p-3 text-sm"><p>Latest review · {date(row.reviewed_at)}</p><p className="whitespace-pre-wrap break-words">{row.review_notes}</p></div>}
          <form action={reviewSkippedImport} className="mt-4 grid gap-3">
            <input type="hidden" name="skipId" value={row.id} />
            <label className="text-sm font-medium">Decision<select className={field} name="decision" defaultValue={row.decision}>{Object.entries(skipDecisions).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <label className="text-sm font-medium">Review notes<textarea className={field} name="notes" required maxLength={4000} rows={3} placeholder="What did you check, and what should happen next?" /></label>
            <p className="text-xs text-slate-500">Saving adds a review to the history. Add or update client records separately after checking the data.</p>
            <button className={`${button} justify-self-start`} type="submit">Save review</button>
          </form>
        </details>
      </article>)}
      <nav aria-label="Skipped imports pages" className="flex items-center justify-between">
        {page > 1 ? <Link className={button} href={link(page - 1)}>Previous</Link> : <span />}
        <span className="text-sm">Page {page}</span>
        {page * size < (count ?? 0) ? <Link className={button} href={link(page + 1)}>Next</Link> : <span />}
      </nav>
    </>}
  </main>;
}
