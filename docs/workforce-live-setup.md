# Live workforce setup

Apply to the existing Supabase project, in this order:

1. `supabase/workforce-operations.sql` — automatic closure fields, review/correction, atomic staff copying, cover requests and leave requests. Requires existing scheduling, attendance and availability setup.
2. `supabase/workforce-payroll.sql` — verified monthly pay/CPF inputs and immutable finalized monthly snapshots.
3. `supabase/workforce-leave-files.sql` — private optional PDF/JPEG/PNG lesson plan attachments.
4. `supabase/workforce-auto-clock-job.sql` — enable Supabase Cron and register the once-per-minute automatic closure job. Apply last, after verifying the app and SQL setup.

The job closes still-open attendance 30 minutes after the captured scheduled end, recording the scheduled end as inferred clock-out. It stores no departure GPS and leaves attendance pending. It applies only to clock-ins recorded after operations setup activation, not historical forgotten records. Managers can correct pending inferred end times with reasons; another manager must review their own attendance. The original inferred time and audit history are preserved. Existing shift schedules are not rewritten.

In Schedule, open a shift to copy it to selected staff; use Presets & templates to copy a person's week. Copies keep the dates, times and centre and remain drafts. The database rejects the entire operation on conflicts, unavailable periods, expired/missing qualifications, wrong role, or cross-organisation staff. No partial batch is retained.

Shift cover supports groups of up to 28 published sessions with the same original staff member. Staff can propose replacements for their own sessions or apply for open shifts. An uninvolved manager reviews. Approval rechecks every session and changes all assignments atomically. Attendance already started prevents reassignment. Time off requires a written lesson handover plan; optional private lesson plan attachments support PDF/JPEG/PNG up to 10 MB. Approved leave creates protected unavailable periods; unresolved assigned shifts block approval. The sample screens remain isolated at `/prototypes/workforce`.

Payroll uses actual approved attendance and manager-verified profiles for each staff/month. No wages or residency status are inferred. The current calculation covers 2026 Ordinary Wages and CPF only. Additional Wages, SDL, other deductions, payslips, payment, official CPF submission and year-end reconciliation are outside this worksheet. Cross-month attendance is blocked for reconciliation rather than guessing break distribution. Finalization requires month-end, no pending attendance, complete profiles, verified accounting IDs, and a review acknowledgement. Once finalized, source attendance and the financial snapshot are locked. Corrections must happen before finalization; an audited payroll adjustment workflow is not yet included.

Finalization and QuickBooks posting need server-only `SUPABASE_SERVICE_ROLE_KEY` and the existing QuickBooks OAuth configuration in Vercel. Reuse the existing Claims company connection. The payroll journal validates SGD home currency and active expense/liability account types. A run has a single posting attempt and a stable request ID; uncertain attempts are blocked from reposting and can be reconciled against a matching existing journal. No staff payment is made. No journal is posted merely by deploying this release. Verify posting in an Intuit sandbox before the first production journal.

Verification after SQL: visit `/workforce?view=cover`, `/workforce?view=time-off`, `/workforce?view=payroll`, `/workforce?view=quickbooks`. Check `cron.job` for `rdp-auto-clock-out` and `cron.job_run_details` for successful execution. Test with authorized real staff; do not create fictitious production attendance for testing.
