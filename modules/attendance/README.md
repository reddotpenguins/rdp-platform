# Saved attendance pilot

`/attendance` provides personal published shifts, GPS clock-in/out, saved location evidence, red lateness flags, manager review with unpaid breaks, optional shift feedback and staff AM/PM availability. Staff see their own records. Managers see their organisation's records and cannot approve their own attendance. Records are read from Supabase, not demo arrays or browser storage.

Apply `supabase/workforce-attendance.sql` and then `supabase/workforce-availability.sql` after the existing scheduling phase-1 migration. It is additive, transactional and rerunnable. It creates an attendance table with RLS and narrowly scoped security-definer RPCs. Authenticated clients have SELECT only on the table; writes and immutable audit inserts go through RPCs. The actor comes from `auth.uid()`. Clock times are server times. Centre/shift values are snapshotted so later roster edits do not rewrite past evidence. Unique indexes and an actor row lock prevent duplicate/open concurrent clocks. Existing centre IDs, rosters, staff and old attendance are not migrated or reseeded.

All active existing admin/lead_coach/coach roles receive personal schedule/clock access. Only existing scheduling managers review others. There is no hospitality role in the current account model; hospitality accounts need an appropriate role model before rollout to that team.

Use the Google Maps setup guide in `docs/google-maps-setup.md`. GPS checks do not prove that a device is unspoofed. This pilot is manual GPS attendance, not hardware-attested attendance.

## Not enabled by this change

- NFC tags/cards, trusted shared readers and background auto-clock-out.
- Formal leave requests, lesson-plan attachments and cover workflows against the saved roster.
- Payroll rates, CPF employee profiles, pay-run snapshots and QuickBooks payroll posting. The older workforce prototype still demonstrates these using sample data.
- Payroll export of these attendance records. Managers review records first; no deduction or payment is triggered by lateness.
- Corrections to finalised records, forgotten clock-out adjustments, retention automation and staff self-service beyond their own shifts, attendance and availability.

Do not describe the entire workforce product as production ready. Before widening the pilot, verify the migration on the real project, confirm centre entrances, publish a pilot assignment, and test a real staff clock-in/out plus another manager's review. The list displays the latest 31 days plus open records, up to 1,000 rows.

Local SQL checks use temporary PGlite PostgreSQL, not the production database:

```
RDP_PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node tests/workforceAttendance.sql.mjs
```

September 24 meeting refinements add optional clock-out feedback and a manager follow-up filter. Responses do not affect pay and do not send immediate alerts. The availability RPC changes only date-specific staff-owned markers, blocks unavailable responses over assigned shifts, and preserves manager/leave records. See `docs/hr-meeting-refinements-2026-09-24.md` for implementation and rollout boundaries.
