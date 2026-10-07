# Log and review skipped enquiries

This feature retains the incoming enquiry fields when Make skips a duplicate. It does not update an existing enquiry or automatically create a client. Each skipped attempt is a separate log, even for the same conversation. Reviews are append-only and the original evidence cannot be edited.

## 1. Supabase setup

In the same Supabase project used by this app and Make, run `supabase/enquiry-import-skips.sql` in SQL Editor after the existing `auth-and-roles.sql` foundation. Run only the new file for this feature; do not rerun the entire foundation. No existing enquiry records or unique indexes are changed.

The tables are `enquiry_import_skips` (incoming evidence) and `enquiry_import_skip_reviews` (review history). Active admins can read both and add reviews. Only the backend service connection can insert skipped evidence. Anonymous users and other staff cannot access this data. Existing Supabase service credentials remain private to Make; no new browser secret is needed.

Deploy the app changes through the normal preview/production release process. Then open **Enquiries → Skipped imports**. An empty queue is expected until Make sends its first log. The new page has a setup/access error message if the migration is missing; the original Enquiries page continues to work.

## 2. Make configuration

Leave the scenario off while changing it. On Supabase module 5, use **Add error handler**. The route must be:

**Duplicate filter → Supabase: Create a Row (skip log) → Skip**

Use **Create a Row**, not Upsert, for the log so repeated attempts are retained.

Filter the failed module's **Error → Message** using AND:

- Contains `duplicate key value violates unique constraint`
- Contains `customer_enquiries_respondio_conversation_id_key`

If your live error names the newer `customer_enquiries_conversation_id_upsert_unique` constraint, allow that name as an alternative within the constraint-name condition. Do not skip all RuntimeErrors or all HTTP 409 errors.

Select the existing Supabase backend connection and table `enquiry_import_skips`. Map:

| Column | Mapping |
| --- | --- |
| `respondio_conversation_id` | Exact conversation ID attempted by module 5, as text |
| `respondio_contact_id` | Contact ID from the incoming data, if available |
| `parent_name` | Parent name attempted by module 5 |
| `error_message` | Failed module's Error → Message |
| `event_type` | Trigger event type, if available |
| `event_id` | Trigger event/message ID, if available |
| `source_event_at` | Original event timestamp in ISO 8601, if available; otherwise omit |
| `incoming_data` | JSON object containing the enquiry fields that module 5 tried to save |

Leave `id` and `created_at` unmapped so the database supplies them. Missing optional values should be omitted or null, especially timestamps.

Build `incoming_data` from the source modules before the failing module, using Make's JSON tools or structured object editor. Preserve the actual values attempted, including parent/contact details, message, programme, centre, trial details and other enquiry fields relevant to review. Do not log HTTP headers, API keys, credentials or unrelated contact history. The object limit is 256 KB. Do not place a quoted JSON string into the JSON object column.

If the connector cannot map a JSON object, use HTTP **Make a request** for the logging step instead:

```text
POST https://YOUR_PROJECT_REF.supabase.co/rest/v1/enquiry_import_skips
Content-Type: application/json
Prefer: return=minimal
apikey: YOUR_SUPABASE_SECRET_KEY
```

Store the API key in Make's secure credential field where available. For an `sb_secret_...` key, send it as `apikey`, not as a Bearer token. If using the existing legacy service-role JWT, use the project's existing working authentication configuration (apikey and Authorization: Bearer JWT). Never expose credentials in a screenshot or log.

Example request shape only; replace all example values using Make's mappings and JSON editor:

```json
{
  "respondio_conversation_id": "example-conversation-id",
  "respondio_contact_id": "example-contact-id",
  "parent_name": "Example parent",
  "error_message": "duplicate key value violates unique constraint customer_enquiries_respondio_conversation_id_key",
  "incoming_data": {
    "respondio_conversation_id": "example-conversation-id",
    "parent_name": "Example parent",
    "message": "Example incoming enquiry for review"
  }
}
```

**A failed logging step must not be ignored.** Enable incomplete-execution storage and attach a Retry handler to the logging module so the event is retained if logging fails. Skip should run only after the log is saved. A timeout after a successful save can cause an additional log on retry; event ID and timestamp help identify such attempts.

## 3. Verify and activate

1. Test one known duplicate through the edited scenario. Verify one skip-log row appears and the existing enquiry stays unchanged.
2. Open **Enquiries → Skipped imports**, inspect the submitted fields and open the matching enquiry.
3. Save a decision with notes. Confirm it is visible using the appropriate status filter. Use **Needs adding to database** as a follow-up queue; that decision does not create a client.
4. Test a genuinely new conversation: the normal save should succeed without a skip-log row.
5. Confirm unrelated errors are not swallowed and a logging failure is retained rather than skipped.
6. Reactivate the scenario. Review earlier incomplete executions separately: they may retain the old scenario definition, so confirm the new logging route is used before retrying. Do not clear the entire queue.

Only events sent after this logging route is configured will appear. Previously skipped data cannot be reconstructed from the summary CSV; use available Make execution payloads to recover it separately.

References: [Make Skip handler](https://help.make.com/skip-error-handler), [Make incomplete executions](https://help.make.com/incomplete-executions), [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys).
