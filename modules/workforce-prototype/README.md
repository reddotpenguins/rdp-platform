# RDP People prototype

Local route: `/prototypes/workforce` in the existing Next.js application. This is an isolated client-only concept with fictional staff, wages and records, with the four user-supplied centre names. Centre settings persist in browser localStorage; rosters, attendance, cover applications and local lesson-plan attachments reset on refresh. No production records, submission or payment APIs are called. The existing protected dashboard and QuickBooks claims integration are unchanged.

## September meeting update

- Sites & centres: Orchard, Siglap, Caldecott and Bt Timah; create/rename centres, addresses, entrance coordinates, radius and stable NFC codes. The scheduler and clock share the same list. Unused centres can be removed; centres with shifts or attendance are protected. Exact entrance coordinates start unset. Device GPS is blocked until configured; demo coordinates are explicitly illustrative.
- Renaming a centre updates its current roster labels; original clock/timesheet evidence remains unchanged. Saved centre settings are validated when loaded and matched to seeded rosters by stable centre ID.
- Shift cover: staff request cover or apply for open published shifts; managers approve after rechecking team, leave, conflicts and recorded attendance. Linked 2–4-week shifts are claimed together, with validation across all dates before any reassignment. Publish each week before applications. Copying a prior week creates independent drafts.
- Coaching leave requires a local PDF/JPG/PNG lesson plan (maximum 10 MB) and no remaining assigned shifts in the leave period before approval. Hospitality leave does not require a lesson plan. Existing approved sample leave predates this demonstration rule. Additional medical/emergency proof, secure document storage and access controls remain future work.
- Daniel's 16 September example has 09:00–12:00 at Orchard and 15:00–18:00 at Siglap. They are separate sessions, so the three-hour gap is unpaid.
- Reviewed the supplied 39-minute meeting via a local transcript and sampled video frames; no media was uploaded. Meeting notes are in `../outputs/connecteam-meeting-review/review.md` relative to the repository root.

## Workflows

- Scheduling: weekly roster, shift editing/dragging, team and location filters, open shifts, conflict checks, leave, copying and draft publication.
- Time clock: published assigned shifts, a 30-minute early check-in window, duplicate/open-record checks, GPS accuracy-aware geofence results, recorded coordinates and timestamps, and explicit map links. No background location tracking. Demo location scenarios are labelled separately from device readings.
- NFC: simulated taps; feature-detected Web NFC NDEF reading on supported Android browsers; checkpoint URLs for phones that open NFC links. URL records are labelled as an unverified physical tap. Codes/URLs identify a location, not a person or a secure physical presence proof.
- Automatic clock-out: an inferred scheduled end without a fabricated departure location. Records stay pending until reviewed with a note. Approved attendance flows into timesheets and monthly payroll. Demo-clock advances do not change device-record timestamps. The browser interval only runs while the app is active; production needs a server scheduler.
- Payroll: monthly 2026 Ordinary Wage CPF estimates using integer-cents arithmetic, official rounding, all five age bands, SC / PR year 1 / 2 / 3+, GG/FG/FF, low-wage thresholds and an $8,000 OW ceiling. PR conversion months require review. Other years are blocked. Profiles are fictional, never inferred from names.
- Monthly wages: approved recorded hours plus editable fictional earlier-month Ordinary Wages for September. Those amounts are keyed by employee AND month. Unapproved entries are excluded. Bonuses / Additional Wages, SDL, other deductions, CPF submission and bank payments are not implemented.
- QuickBooks Online: account mapping and balanced journal payload preview/download. Wages and employer CPF are debits; combined CPF and net wages payable are credits. Unresolved attendance, pending timesheets or CPF errors block export. Changes invalidate the review acknowledgment. No OAuth is invoked and nothing is posted.

## Module boundaries

- `model.ts`: scheduling and base demo data.
- `attendance.ts`: geofence/attendance validation, automatic endings and timesheet conversion.
- `cpf.ts`: versioned 2026 Ordinary Wage calculation.
- `monthly-payroll.ts`: calendar-month aggregation and local exports.
- `payroll-journal.ts`: pure QuickBooks JournalEntry payload builder; no network calls.
- `TimeClockPanel.tsx`, `PayrollPanel.tsx`, `QuickBooksPanel.tsx`: feature views.
- `WorkforcePrototype.tsx`: shared prototype state and existing roster.
- CSS uses the `wf-` namespace. No dependencies were added.

## Production integration

The exact public demo route bypasses session refresh because it contains no protected data. Never connect actual staff or payroll data to this route. Port the approved views into the existing protected dashboard with `requireActiveStaffSession`, `hasStaffPermission` and module permissions. Reuse the existing scheduling models and Supabase RLS; validate staff, organization, shift, location, pay profiles and all mutations server-side.

Attendance needs a server timestamp, immutable evidence/audit records, a unique open-record constraint, checkpoint ownership, transactionally enforced clock-in rules, spoofing/replay controls and a retention policy. A fixed NDEF pool tag/card can open an authenticated HTTPS check-in URL. Static codes are cloneable. Staff cards on a shared reader require a separate kiosk/reader integration. Physical NFC and GPS reliability must be tested at the actual pools; no hardware was available during this prototype build.

Automatic clock-out needs a recurring server job that closes only due, still-open records, rechecks current shift policy, is idempotent and records an inferred (not observed) departure. Review and correction must preserve the original evidence. Cross-day shifts and break corrections require further production handling.

CPF must use a reconciled calendar month and effective-dated verified profiles/rates, not a filtered week or location subtotal. Add AW annual ceiling/reconciliation, SDL and other deductions, historical/future rate tables, employee exemptions and submission formats before a real pay run. Validate outcomes against CPF Board tooling and payroll review. No official certification is implied.

QuickBooks Online OAuth routes and claims posting already exist under `app/api/quickbooks/`. Reuse the authorized connection and token-refresh infrastructure for a new protected payroll service; do not send client-supplied totals directly to it. Compute from a finalized server-side pay run, resolve account types/IDs from the connected company, use a pay-run idempotency key and transactional lock, and store the returned JournalEntry ID. Reconcile uncertain responses before retrying. Test in an Intuit sandbox before enabling live posting. No new production endpoint or schema is introduced in this prototype.

## Sources checked 16 September 2026

- [CPF Board contribution rules](https://www.cpf.gov.sg/employer/employer-obligations/how-much-cpf-contributions-to-pay)
- [CPF Board 2026 rate tables (Tables 1–5)](https://www.cpf.gov.sg/content/dam/web/employer/employer-obligations/documents/CPFcontributionratesfrom1Jan2026.pdf)
- [CPF age transitions](https://www.cpf.gov.sg/service/article/which-cpf-contribution-rate-should-be-applied-when-my-employee-enters-the-next-age-group)
- [Chrome Web NFC](https://developer.chrome.com/docs/capabilities/nfc)
- [Apple background tag reading](https://developer.apple.com/documentation/corenfc/adding-support-for-background-tag-reading)
- [Intuit JournalEntry reference](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/journalentry)

## Validation

`pnpm typecheck` and `node --test --experimental-strip-types tests/*.test.mts` using Node 22+. Tests cover age/PR transitions, wage thresholds, rounding, OW ceiling, monthly aggregation/isolation, geofence uncertainty, attendance approval gating and balanced journal entries. Browser walkthrough covers geofence rejection, NFC simulation, auto-clock-out review, monthly recalculation and journal export safeguards. Actual NFC hardware, real GPS permissions and live QuickBooks posting are not verified.

## Coach schedule statuses

Each coaching day shows Morning (before 12:00) and Afternoon (from 12:00) badges: On Shift, Not On Shift, Sick leave, On Leave, or Available for work. Click the badges to edit unassigned periods. On Shift derives from assigned draft or published shifts, not actual clock-in. Approved medical/sick time off renders Sick leave; other approved time off renders On Leave. Explicit sick/leave markers block overlapping assignment, drag, copy, publication and cover approval. Availability is an offer to work, not a paid shift or formal leave request. Status markers are session-only demo state, like the roster. A shift crossing noon occupies both periods, and statuses reflect all centres even with a centre filter active.

## Schedule presets and lateness

The schedule includes three exact-time presets: Orchard Friday 16:00–18:15; Siglap Saturday 08:45–12:30; and Siglap Saturday 08:45–11:45. Create/edit/delete presets and optionally select a default coach. Presets persist in localStorage separately from sample shifts. Using one opens a draft for the selected schedule week; the existing weekly repeat and conflict/leave checks apply. Presets resolve stable centre IDs to the current name. Changing/deleting a preset does not change existing shifts.

Attendance and corresponding roster cards show a red `L · N min late` marker for observed clock-in after the captured scheduled start. Zero grace applies; positive partial minutes round up for display. Early/on-time records are not flagged, and missing/invalid timestamps are not treated as late. This compares recorded arrivals, not the current time or subsequently edited shift start. The indicator introduces no automatic penalties or payroll deductions. No-show detection is a separate, unimplemented policy.
