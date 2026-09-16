# Dashboard scheduler replacement

`/schedule` now renders `Scheduler.tsx` through the existing `SchedulingClient` entry point. The route still calls `requireActiveStaffSession` and `canManageScheduling` before loading records. No demo staff, wages, attendance or browser-local roster is loaded into this page. The public `/prototypes/workforce` page remains a separate fictional demo.

## Included

- Staff-by-day roster, open/partly staffed blocks, weekly navigation, search, centre/role/department filters, draft filter, shift editing and single-assignment drag/drop.
- Existing Supabase shift IDs, assignments, centre IDs, departments, programmes, required roles, qualifications, manpower, notes and colours are retained. Multi-staff blocks are edited together and cannot be silently reassigned by dragging one row.
- AM/PM statuses saved as date-scoped `staff_availability` rows. `notes` beginning `rdp-roster-status:` identify this editor's rows. Existing recurring availability and approved `staff_unavailable_periods` are not removed. Sick/leave markers block save, move, resize, copy, template assignment and publication through shared server validation.
- Exact-time Orchard Friday and the two Siglap Saturday suggestions. A missing/renamed centre requires selecting its real saved record; suggested names never create centres or guess an old centre's identity.
- Shared coaching presets saved using `schedule_templates` and `schedule_template_shifts`; `description = rdp-single-block-v1` identifies single-block presets. Incomplete preset creation remains inactive. Existing full-week templates and copy operations remain available.
- Existing centres can be renamed without changing IDs, and centres can be added with validated optional geofence coordinates.
- Server checks include active scheduling-manager access, organisation/resource ownership, staff activity, role, qualifications, availability and overlaps. Publication rechecks assignments. Failed assignment reads block edits rather than treating groups as empty.

## Existing schema and rollout

Uses the existing `supabase/scheduling-phase-1.sql` schema and admin/organisation RLS policies. No migration is required for this interface replacement and no SQL, account updates or production data mutations were run during implementation. Do not run schema seed SQL just to rename a centre: use Sites & centres so the same ID is preserved. In particular, a saved centre still named Dhoby Ghaut should only be renamed to Orchard after the operator verifies they represent the same centre.

The existing Scheduling & payroll dashboard tile opens this replacement at `/schedule`. Workforce preview links open the separate sample-data modules, including attendance, leave, CPF payroll and QuickBooks. They are explicitly labelled Preview and provide a return to the saved schedule. Deployment uses the existing GitHub-to-Vercel production workflow.

## Attendance boundary

The older attendance foundation references `staff_schedule_shifts`; this scheduler uses `schedule_shifts`. Those are different record identities. This replacement does not match attendance by names/times, copy simulated clock records, use prototype payroll for live records, or claim NFC is live. A protected attendance/checkpoint implementation is still needed before production NFC, lateness and payroll can use this roster. The fictional prototype continues to demonstrate these separately.

## Validation and limits

TypeScript and ESLint pass. Tests cover database-shaped time values, noon/midnight and overnight boundaries, exact presets, actor permissions, organisation ownership, inactive staff, multi-person preservation, database read failure, persisted status markers, template failures and publish-time availability checks. Server-action tests execute the actual action module with a deterministic database adapter; they do not substitute for live Supabase/RLS integration tests. The unauthenticated route was checked in the browser and still redirects to login. The new layout and forms were checked with temporary fictional fixtures, which were removed afterwards. No live save/publish was attempted without an authenticated staging account.

The existing scheduling actions use multiple database statements rather than a transaction. Bulk template/copy operations can save earlier rows before a later conflict; inspect the roster before retrying. A transactional RPC and database-enforced overlap/locking constraints are a subsequent backend-hardening task for concurrent manager edits. Direct staff self-service and hardware NFC remain outside this manager-interface replacement.
