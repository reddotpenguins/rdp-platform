import Link from "next/link";
import { redirect } from "next/navigation";
import { EnquiryMergeComparison } from "@/components/EnquiryMergeComparison";
import { isTicketId } from "@/lib/enquiryMerge";
import { canManageCustomerEnquiries } from "@/lib/staffRoles";
import { createClient } from "@/lib/supabase/server";
import { requireActiveStaffSession } from "@/lib/supabase/staffProfile";
import type { CustomerEnquiryRow } from "@/lib/supabase/enquiries";

export const dynamic = "force-dynamic";
type Candidate = { id: string; parent_name: string; phone: string | null; child_name: string | null; programme: string | null; enquiry_type: string; status: string };
type MergeHistory = { id: string; source_id: string; target_id: string; merged_by: string; created_at: string; reason: string; source_before: unknown; target_before: unknown; target_after: unknown };
const control = "rounded-md border border-line bg-field px-3 py-2 text-sm";

export default async function MergeEnquiriesPage({ searchParams = {} }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const { profile } = await requireActiveStaffSession();
  if (!canManageCustomerEnquiries(profile)) redirect("/dashboard");
  const param = (key: string) => typeof searchParams[key] === "string" ? (searchParams[key] as string).slice(0, 200) : "";
  const targetId = param("target"), sourceId = param("source"), search = param("search");
  if (!isTicketId(targetId)) redirect("/enquiries?error=Open%20a%20ticket%20to%20start%20a%20merge.");
  const db = createClient();
  const { data: target, error } = await db.from("customer_enquiries").select("*").eq("id", targetId).maybeSingle<CustomerEnquiryRow>();
  if (!target || error) return <main className="mx-auto max-w-4xl p-6"><h1 className="text-xl font-semibold">Ticket unavailable</h1><p className="my-3">The ticket could not be loaded or you no longer have access.</p><Link href="/enquiries">Back to enquiries</Link></main>;
  if (target.merged_into) redirect(`/enquiries/merge?target=${encodeURIComponent(target.merged_into)}`);
  const [candidateResult, sourceResult, historyResult] = await Promise.all([
    db.rpc("find_enquiry_merge_candidates", { p_target: targetId, p_search: search }),
    isTicketId(sourceId) && sourceId !== targetId ? db.from("customer_enquiries").select("*").eq("id", sourceId).is("merged_into", null).maybeSingle<CustomerEnquiryRow>() : Promise.resolve({ data: null, error: null }),
    db.from("enquiry_ticket_merge_history").select("id,source_id,target_id,merged_by,created_at,reason,source_before,target_before,target_after").eq("current_ticket_id", targetId).order("created_at", { ascending: false }).limit(20)
  ]);
  const source = sourceResult.data;
  const candidates = (candidateResult.data ?? []) as Candidate[];
  return <main className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6">
    <header className="flex flex-wrap justify-between gap-4 rounded-lg border border-line bg-paper p-5 shadow-panel"><div><p className="text-sm font-semibold uppercase text-teal">Enquiries</p><h1 className="text-2xl font-semibold">Merge tickets</h1><p className="mt-2 text-sm">Main ticket: <strong>{target.parent_name}</strong> · {target.phone || "No phone"} · {target.enquiry_type}</p></div><Link className={`${control} self-start`} href="/enquiries">Back to enquiries</Link></header>
    <section className="rounded-lg border border-line bg-paper p-4">
      <h2 className="font-semibold">Find the other ticket</h2><p className="my-2 text-sm text-slate-600">Suggestions match the phone number, ignoring punctuation. Search by name, phone, conversation ID or ticket ID. Results include older tickets and are limited to 50 per search.</p>
      <form className="flex flex-wrap gap-2"><input type="hidden" name="target" value={targetId} /><input aria-label="Search other tickets" className={`${control} min-w-0 flex-1`} name="search" defaultValue={search} placeholder="Name, phone or ID" /><button className={control}>Search</button></form>
      {candidateResult.error ? <p role="alert" className="mt-3 text-sm text-red-800">Merge search is unavailable. Ask your administrator to apply the ticket-merge database setup.</p> : <ul className="mt-3 divide-y divide-line">{candidates.map(row => <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><div className="min-w-0 text-sm"><p className="font-semibold">{row.parent_name} · {row.phone || "No phone"}</p><p>{row.child_name || "Child not supplied"} · {row.programme || "Programme not supplied"} · {row.enquiry_type} · {row.status}</p></div><Link className={control} href={`/enquiries/merge?${new URLSearchParams({ target: targetId, source: row.id, search })}`}>Compare</Link></li>)}</ul>}
      {!candidateResult.error && !candidates.length && <p className="mt-3 text-sm text-slate-600">No matching tickets. Try searching by parent name or a conversation ID.</p>}
    </section>
    {sourceId && (!source || sourceResult.error) && <p role="alert" className="rounded-md bg-amber-50 p-3">The other ticket is unavailable or already merged. Choose another ticket.</p>}
    {source && !candidateResult.error && <><Link className="text-sm font-semibold text-teal" href={`/enquiries/merge?target=${source.id}&source=${target.id}`}>Use {source.parent_name} ({source.enquiry_type}) as the main ticket instead</Link><EnquiryMergeComparison key={`${target.id}:${target.updated_at}:${source.id}:${source.updated_at}`} target={target} source={source} /></>}
    <section className="rounded-lg border border-line bg-paper p-4"><h2 className="font-semibold">Merge history for this ticket</h2>
      {historyResult.error ? <p className="mt-2 text-sm text-amber-800">Merge history could not be loaded. Check the database setup and access.</p> : (historyResult.data as MergeHistory[] ?? []).length === 0 ? <p className="mt-2 text-sm text-slate-500">No merges recorded.</p> : <><p className="mt-2 text-xs text-slate-500">Most recent 20 merges. Original snapshots are preserved.</p>{(historyResult.data as MergeHistory[]).map(entry => <details key={entry.id} className="mt-3 border-t border-line pt-3"><summary className="cursor-pointer text-sm font-medium">{new Date(entry.created_at).toLocaleString("en-SG", { timeZone: "Asia/Singapore" })} (Singapore) · View merge record</summary><p className="my-2 whitespace-pre-wrap break-words text-sm">{entry.reason}</p><p className="break-all text-xs">Ticket {entry.source_id} merged into {entry.target_id}</p>{[["Main ticket before", entry.target_before], ["Other ticket before", entry.source_before], ["Main ticket after", entry.target_after]].map(([label, snapshot]) => <details key={String(label)} className="mt-2"><summary className="cursor-pointer text-sm">{String(label)}</summary><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words bg-field p-3 text-xs">{JSON.stringify(snapshot, null, 2)}</pre></details>)}</details>)}</>}
    </section>
  </main>;
}
