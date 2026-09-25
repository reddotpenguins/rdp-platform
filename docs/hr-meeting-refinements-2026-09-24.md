# HR refinements from the 24 September meeting

Reviewed the supplied 37:14 recording using local speech transcription and sampled frames. The sampled frames show speakers rather than a shared application screen. Timestamps below refer to the supplied video, not its displayed wall clock. Speech recognition can contain errors; these are paraphrased requirements, not verbatim quotes. Vendor demonstrations and commercial discussion were treated as reference material, not instructions to send messages, purchase services or modify accounts.

## Implemented locally

| Meeting point | Refinement | Connection / limit |
| --- | --- | --- |
| 02:33–05:19: staff liked the layout but could not get started with an empty account | Getting started page with team, centre, shift and publication steps; explicit link to practise with sample data | Uses actual loaded roster counts. Does not populate live records with fictional staff. |
| 06:40–10:49: track certificate expiry and see remaining days without counting in Excel | Qualifications matrix, missing/unknown/expired/due-soon states, 7/30-day countdowns, verified certificate editing, qualification-type creation | Uses existing qualifications and staff_qualifications tables. Manager-only actions check active same-organisation references and record an audit event. No upload or automated reminders yet. |
| 09:50–10:09: qualifications should connect to scheduling | Required qualification must cover the entire shift when assigning, moving, copying or publishing; prepared clock-in RPC also checks validity | Does not automatically remove staff or cancel historical shifts. Null expiry retains legacy no-expiry behaviour and appears as unknown in the matrix. |
| 20:24–20:56: duplicate a week's roster | Retained existing weekly copying and templates in Presets & templates | Already implemented; no duplicate workflow added. |
| 20:59–22:28: freelancers indicate when they want to work | Staff-owned AM/PM availability for the next 90 days; available, unavailable or clear own response | Prepared availability migration writes to existing staff_availability records. Cannot mark an assigned period unavailable; manager restrictions and approved leave remain intact. Self-reported unavailability is not labelled formal leave. |
| 28:56–33:52: ask how a coach felt after their shift and surface follow-up needs | Optional Good / Okay / Difficult / Prefer not to say, note, and request for manager follow-up at clock-out; manager filter | Prepared attendance migration persists feedback atomically with clock-out. Only the employee and scheduling managers can read it. No pay effect, sentiment inference, automated alerts or promise of immediate response. |

The Team screen now reads actual platform profiles and links to the existing Staff access page. It no longer sends managers to fictional team profiles.

## Still to implement

- **07:43–08:56: document onboarding and contracts.** Private document storage, employee submission, manager review, version history and a suitable e-signature workflow. Recording a verified certificate's dates is not a document upload or legal signature.
- **09:24–09:45: 30/7/1-day reminders.** A durable notification queue with delivery status and retry handling. The current countdowns are visual only.
- **11:29–17:33: policy updates, document links and acknowledgements.** Versioned policy records with separate opened/acknowledged timestamps and staff-level access. Opening a document must not be presented as proof of understanding. Existing training resources remain separate.
- **22:28–24:29: shift-change notifications.** Saved before/after details and delivery tracking for changes to published shifts, without notifying for every draft edit.
- **24:38–28:48: private birthday and anniversary greetings.** Employee preferences, minimum required dates and delivery controls. No public birthday feed or automatic messages were enabled.
- **18:20–19:51: knowledge-base AI.** Explicitly deferred in the discussion; no AI agent added.
- Secure NFC readers, background automatic clock-out, formal leave/cover and payroll integration remain outstanding from earlier work.

## Rollout status

Production app deployment was authorized on 25 September 2026. The Supabase updates remain pending. Qualification management uses the existing scheduling schema. Staff clocking/feedback requires `supabase/workforce-attendance.sql`; self-service availability additionally requires `supabase/workforce-availability.sql`. Both scripts must be reviewed/applied to the existing project before staff testing. They contain no demo-data seeds. Apply the database scripts through an authenticated project session before enabling staff testing; no database changes are made by the app deployment.

Google Maps activation is deferred at the user's request. Follow `docs/google-maps-setup.md` afterward. Centre coordinates are still required for GPS enforcement; the street-map API key is not.

Validation: 127 app tests; 32 ephemeral PostgreSQL tests covering location, ownership, inactive users, duplicate clock-in, feedback persistence and availability boundaries; TypeScript, lint and production build; browser inspection of the matrix, verified-record form, setup steps and clock-out/availability controls with temporary fictional fixtures. No live attendance or profile records were created during verification.
