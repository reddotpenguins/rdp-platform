# Merge duplicate enquiry tickets

## Enable

1. Run `supabase/enquiry-ticket-merges.sql` in the app's Supabase SQL Editor after the existing `auth-and-roles.sql` foundation. Run this separate migration only; do not rerun the foundation. The skipped-import migration can be applied before or after this file.
2. Deploy the app changes through preview and then the normal production release process. Apply the migration before deploying because the enquiry list now excludes archived merged tickets in its database query.
3. Sign in as an active administrator. Open a ticket under **Enquiries and Sign Ups**, then choose **Merge with another ticket / view merge history**.

## Use

The ticket you opened is the main ticket. Phone matches ignore punctuation: `6500000000` and `+6500000000` are suggested together. Search can also find older tickets by name, phone, conversation ID or ticket ID; it does not depend on the latest 500 tickets shown in the normal enquiry list.

Choose **Compare** on the other ticket. Check the child and programme; matching phone numbers can belong to a parent enquiring for different children. You can swap which ticket is the main ticket before proceeding.

Review each field. Missing main-ticket values default to the other ticket's value. Different messages, notes, trial details and outcome notes default to **Combine both**, labelled by their original ticket IDs. Conflicting other fields default to the main ticket and can be selected individually. Singapore numbers already containing country code 65 are standardised to `+65…`; local numbers are not assigned an assumed country code. A final Signed up status sets the ticket type to Sign up.

Add notes explaining the merge, check the confirmation, and select **Confirm merge into main ticket**. If either ticket changes while you are reviewing it, the whole operation is rejected: refresh and compare again.

## Preserved information

- The main ticket remains in the enquiry list. The other ticket remains in the database with `merged_into`, `merged_at` and `merged_by`, but leaves the active list and counts.
- Original conversation, contact and external-ticket IDs stay on their original rows. They are not overwritten by another ticket's IDs.
- Both original ticket snapshots, chosen fields, resulting ticket, actor, reason and time are saved in the immutable merge history. View recent history using the same merge link on the surviving ticket; it includes earlier merges into tickets subsequently merged again.
- Linked student records are reassigned to the main enquiry. Student records themselves are not merged or removed.
- Old ticket-ID links, including links from Skipped imports, open the surviving ticket.
- Direct edits to archived merged tickets are rejected. There is no automatic undo or automatic update to respond.io during a merge.

The merge is one database transaction. Unauthorised requests, invalid choices, stale versions and failures roll back all changes. Active admins alone can merge and inspect history. Reapplying this migration is safe; rerunning older foundation SQL may replace grants and should be avoided without review.

## Make: resolve an identifier before saving

The app preserves old identifiers, but Make needs to use the resolver to route later events to the surviving ticket. Simply matching phone numbers or continuing to upsert an archived row will not do that. Configure this before relying on merged tickets for new imports.

Add a Supabase API/HTTP step before the save:

```text
POST https://YOUR_PROJECT_REF.supabase.co/rest/v1/rpc/resolve_enquiry_ticket
Content-Type: application/json
apikey: YOUR_SUPABASE_SECRET_KEY
```

Body, built using Make's JSON editor with the real incoming conversation ID:

```json
{
  "p_conversation_id": "example-conversation-id"
}
```

For website events, pass `p_external_ticket_id` instead. Only pass both when both identifiers are known; if they resolve to different tickets, the function rejects the request for manual review. Keep credentials in Make's protected connection/credential settings. New `sb_secret_...` keys belong in `apikey`, not Bearer; legacy service-role JWT connections can keep their existing working authentication configuration.

The response is a ticket UUID as a JSON string, or `null`:

- **UUID:** the enquiry already exists, including if it was merged. For the current **log and skip** workflow, create a row in `enquiry_import_skips` using the incoming fields and original conversation ID, then stop that route successfully. Skip is an error-handler directive, so a normal Router branch can simply end after logging. The error-handler Skip route remains available for concurrent new inserts that conflict.
- **null:** continue to create the new enquiry using the incoming identifiers. Retain the duplicate-error logging handler because concurrent events can both look up a new ID before either insert completes.

If later choosing to update instead of skip, update the returned ticket **by its database `id`** using only the agreed enquiry fields. Do not replace its primary conversation/contact/external IDs with the incoming archived ticket's IDs. Preserve the incoming snapshot for review if it contains new information.

Keep incomplete-execution storage enabled and handle logging failures with Retry, not Skip. Do not discard an event before its skip log has saved.

## Verification before activation

- Merge two test tickets with phone numbers differing by `+`, and confirm field choices, combined notes and one surviving ticket.
- Check the merged ticket's original row and history; both must remain.
- Resolve each original conversation ID: both should return the main ticket's UUID.
- Try editing the archived ticket: it must be rejected.
- Test one existing event through Make: the incoming data should be logged and the main ticket left unchanged under the log-and-skip workflow.
- Test a new conversation: it should create one enquiry normally.

Existing skipped-event logs remain unchanged. Their link resolves to the current ticket when opened.
