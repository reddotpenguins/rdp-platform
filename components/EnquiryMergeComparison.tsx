"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { mergeEnquiryTickets } from "@/app/enquiries/merge/actions";
import { canCombineMergeField, defaultMergeChoice, mergeFields, normaliseMergedPhone, phoneMatchKey } from "@/lib/enquiryMerge";
import type { CustomerEnquiryRow } from "@/lib/supabase/enquiries";

const show = (value: unknown, field?: string) => {
  if (value == null || value === "") return "Not supplied";
  const text = String(value);
  return field === "status" || field === "enquiry_type"
    ? text.charAt(0).toUpperCase() + text.slice(1).replace(/_/g, " ")
    : text;
};

export function EnquiryMergeComparison({ target, source }: { target: CustomerEnquiryRow; source: CustomerEnquiryRow }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const samePhone = phoneMatchKey(target.phone) !== "" && phoneMatchKey(target.phone) === phoneMatchKey(source.phone);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    setPending(true); setError("");
    try {
      const result = await mergeEnquiryTickets(form);
      if ("error" in result) { setError(result.error); setPending(false); }
      else {
        router.push(`/enquiries?tab=all&search=${encodeURIComponent(result.targetId)}&saved=${encodeURIComponent("Tickets merged. The original ticket and merge history have been retained.")}`);
        router.refresh();
      }
    } catch { setError("The result could not be confirmed. Refresh and check the tickets before trying again."); setPending(false); }
  }
  return <form onSubmit={submit} className="min-w-0 rounded-lg border border-line bg-paper p-4 shadow-panel">
    <h2 className="text-xl font-semibold">Choose the details to keep</h2>
    <p className="mt-2 text-sm text-slate-600">The main ticket stays in the enquiry list. The other ticket is retained as a merged record. Both original conversation IDs and snapshots are preserved.</p>
    <p className={`my-3 rounded-md p-3 text-sm ${samePhone ? "bg-teal/10" : "bg-amber-50 text-amber-900"}`}>{samePhone ? "The phone numbers match after removing formatting. Confirm the child and programme too." : "The phone numbers do not match or are missing. Check carefully that these tickets belong together."}</p>
    <input type="hidden" name="target" value={target.id} />
    <input type="hidden" name="source" value={source.id} />
    <input type="hidden" name="targetVersion" value={target.updated_at} />
    <input type="hidden" name="sourceVersion" value={source.updated_at} />
    <div className="overflow-x-auto"><table className="w-full min-w-[660px] table-fixed text-left text-sm">
      <thead><tr className="border-b border-line"><th className="w-1/6 p-2">Field</th><th className="p-2">Main: {target.parent_name}</th><th className="p-2">Other: {source.parent_name}</th><th className="w-44 p-2">Keep</th></tr></thead>
      <tbody>{mergeFields.map(([key, label]) => <tr key={key} className="border-b border-line align-top">
        <th scope="row" className="p-2 font-medium">{label}</th>
        <td className="whitespace-pre-wrap break-words p-2">{show(key === "phone" ? normaliseMergedPhone(target[key]) : target[key], key)}</td>
        <td className="whitespace-pre-wrap break-words p-2">{show(key === "phone" ? normaliseMergedPhone(source[key]) : source[key], key)}</td>
        <td className="p-2"><select aria-label={`Keep ${label}`} name={`choice_${key}`} defaultValue={defaultMergeChoice(key, target[key], source[key])} className="w-full rounded-md border border-line bg-field px-2 py-2">
          <option value="target">Main ticket</option><option value="source">Other ticket</option>
          {canCombineMergeField(key) && <option value="combine">Combine both</option>}
        </select></td>
      </tr>)}</tbody>
    </table></div>
    <p className="mt-3 text-xs text-slate-500">Singapore numbers with country code 65 are saved consistently with +65. A Signed up status also sets the ticket type to Sign up. Source identifiers remain on their original tickets.</p>
    <label className="mt-4 block text-sm font-medium">Merge notes<textarea name="reason" required maxLength={4000} rows={3} className="mt-1 w-full rounded-md border border-line bg-field p-3" placeholder="Why are these the same enquiry? Note any differences you checked." /></label>
    <label className="mt-4 flex items-start gap-2 text-sm"><input type="checkbox" name="confirmed" value="yes" required className="mt-1" /><span>I checked that these tickets concern the same child and enquiry. I understand the other ticket will leave the active list and there is no automatic undo.</span></label>
    {error && <p role="alert" className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <button type="submit" disabled={pending} className="mt-4 rounded-md bg-teal px-4 py-2 font-semibold text-white disabled:opacity-50">{pending ? "Merging…" : "Confirm merge into main ticket"}</button>
  </form>;
}
