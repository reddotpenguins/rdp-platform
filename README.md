# RDP LTS Assessment Dashboard

Temporary internal prototype for reviewing Red Dot Penguins LTS 2026 Q1 and Q2 assessment results while the full RDP Management Dashboard is not ready.

## Install Dependencies

Use Node.js 22 or newer. This prototype is pinned to pnpm 10 for Vercel deployment compatibility.

```bash
pnpm install
```

The project is a Next.js, TypeScript, Tailwind CSS, Recharts, CSV/XLSX upload prototype.

## Run Locally

```bash
pnpm dev
```

Open `http://localhost:3000/dashboard`.

## Supabase Setup

Create a local `.env.local` file with:

```text
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

The dashboard uses Supabase Auth for login and reads uploaded assessment rows from:

```text
public.assessment_import_rows
public.customer_enquiries
public.student_profiles
```

For the current prototype, run this file in Supabase SQL Editor after creating the tables:

```text
supabase/auth-and-roles.sql
```

This creates `staff_profiles`, `staff_profile_centres`, adds `admin`, `lead_coach`, and `coach` roles, and protects `assessment_import_rows`, `customer_enquiries`, and `student_profiles` with role-aware RLS.

The app also includes an admin-only RBA page at:

```text
/rba
```

Admins can invite new staff and update existing staff names, roles, active status, and lead coach centre assignments from that page. The **Invite and add staff profile** form sends the Supabase invite email by default, then uses the `admin_upsert_staff_profile` helper in `supabase/auth-and-roles.sql`, so run the latest SQL file once before adding new users by email from the website. If Supabase email rate limits are reached, untick **Send invite email** to connect an existing Supabase Auth user without sending another email.

How access works:

- `admin`: can see and manage all assessment rows.
- `lead_coach`: can see and upload rows only for assigned centres in `staff_profile_centres`.
- `coach`: can see their own assessment rows by `coach_email`, or by exact `coach_name` when email is blank.

Admin operations pages:

- `/enquiries`: admin only.
- `/withdrawals`: admin only.
- `/rba`: admin only.

The `/students` page uses `student_profiles`:

- `/students`: shows sign-ups, withdrawals, total current students, active students, and students on freeze.
- `admin`: can see all students.
- `lead_coach`: can see students for assigned centres in `staff_profile_centres`.
- `coach`: can see students whose `coach_name` matches their staff profile `coach_name`.

The `/withdrawals` page records active, freeze, and withdrawn student status changes into `student_profiles`; only admins can access it.

## Enquiry, Trial, and Sign-Up Tickets

The `/enquiries` page reads from:

```text
public.customer_enquiries
```

Use Make.com to keep your current respond.io to Google Sheets workflow, then add one more Make.com step to upsert into Supabase `customer_enquiries`.

Recommended Make.com field mapping:

```text
Google Sheet column                    Supabase customer_enquiries column
Time Stamp                             enquiry_received_at
Name                                   parent_name
Number                                 phone
Trial Time                             trial_time
First message                          message
First Touch Date                       first_touch_date
Trial details / Comments               trial_details
Trial date                             trial_date
Trial Location (filtered)              trial_location and centre_name
Trial Coach                            trial_coach and assigned_to
Programme                              programme
Registration Date? (or NA)             registration_date
Signed up Location                     signed_up_location
Signed up Coach                        signed_up_coach
If yes/no details or feedback          outcome_notes
Source                                 source
Google Sheets row number or row ID      google_sheet_row_id
Respond.io conversation ID             respondio_conversation_id
Respond.io contact ID                  respondio_contact_id
```

For `source`, use only `respond.io` or `website contact form`. Put hotline/respond.io enquiries under `respond.io`, and WordPress or website form submissions under `website contact form`.

In Make.com, add an **HTTP -> Make a request** step after your Google Sheets row is created.

```text
Method: POST
URL: https://your-project-ref.supabase.co/rest/v1/customer_enquiries?on_conflict=google_sheet_row_id
Headers:
apikey: your-private-supabase-secret-or-service-role-key
Content-Type: application/json
Prefer: resolution=merge-duplicates,return=representation
```

Example JSON body:

```json
{
  "enquiry_received_at": "{{formatDate(now; \"YYYY-MM-DDTHH:mm:ssZ\"; \"Asia/Singapore\")}}",
  "parent_name": "{{First Name}}",
  "phone": "{{Phone No.}}",
  "trial_time": "{{Trial Time}}",
  "message": "{{86.custom_fields[9].value}}",
  "first_touch_date": "{{formatDate(86.custom_fields[10].value; \"YYYY-MM-DD\"; \"Asia/Singapore\")}}",
  "trial_details": "{{Trial details / Comments}}",
  "trial_date": "{{formatDate(Trial date; \"YYYY-MM-DD\"; \"Asia/Singapore\")}}",
  "trial_location": "{{Trial Location (filtered)}}",
  "centre_name": "{{Trial Location (filtered)}}",
  "trial_coach": "{{Trial Coach}}",
  "assigned_to": "{{Trial Coach}}",
  "programme": "{{Programme}}",
  "registration_date": "{{formatDate(Registration Date?; \"YYYY-MM-DD\"; \"Asia/Singapore\")}}",
  "signed_up_location": "{{Signed up Location}}",
  "signed_up_coach": "{{Signed up Coach}}",
  "outcome_notes": "{{If yes/no details or feedback}}",
  "source": "respond.io",
  "enquiry_type": "enquiry",
  "status": "new",
  "google_sheet_row_id": "{{Google Sheets Row ID}}",
  "respondio_contact_id": "{{Respond.io Contact ID}}",
  "respondio_conversation_id": "{{Respond.io Conversation ID}}"
}
```

Only send date fields when a date exists. Empty text values can be sent as blank, but empty date values should be omitted or sent as `null`.

Use these `enquiry_type` values:

```text
enquiry
trial
sign_up
```

Use these `status` values:

```text
new
contacted
trial_booked
signed_up
closed
```

To reduce duplicate tickets, Make.com should upsert by `google_sheet_row_id` when the row comes from Google Sheets, or by `respondio_conversation_id` when the row comes straight from respond.io. Keep the Supabase service role key only in trusted server-side places such as Make.com or a private Vercel environment variable; never put it in a `NEXT_PUBLIC_` variable.

To push website edits back into Google Sheets, create a second Make.com scenario:

```text
Custom Webhook -> Google Sheets: Search Rows -> Google Sheets: Update a Row
```

Use the webhook URL as this private Vercel environment variable:

```text
MAKE_ENQUIRY_UPDATE_WEBHOOK_URL=https://hook.make.com/your-private-webhook-url
```

When a ticket is saved on `/enquiries`, the app sends Make.com the ticket ID, Google Sheet row ID, status, trial details, registration details, outcome notes, and website notes. In Make.com, use `googleSheetRowId` to find or update the matching Google Sheet row. If the Google Sheet is often sorted manually, use `respondioConversationId` as the stable lookup key instead of the row number.

## Student Lifecycle Uploads

The `/students` and `/withdrawals` pages read from:

```text
public.student_profiles
```

For old withdrawal or freeze records, prepare a CSV using this template:

```text
public/sample-student-lifecycle-template.csv
```

Required columns:

```text
student_name
status
status_effective_date
```

Recommended columns:

```text
parent_name
phone
email
centre_name
coach_name
programme
start_date
reason
notes
```

Use these `status` values exactly:

```text
active
frozen
withdrawn
```

Dates should use `YYYY-MM-DD`, for example `2026-08-05`. To upload, open Supabase -> Table Editor -> `student_profiles` -> Insert -> Import data from CSV, then map the CSV columns to the matching table columns.

Then create admin, lead coach, or coach login users in **Authentication -> Users** inside Supabase and add a matching staff profile row. Auth users hold the password; staff profiles hold the app role.

Example admin profile:

```sql
insert into public.staff_profiles (id, email, full_name, role, coach_name, centre_name)
select id, email, 'Tyrone Peh', 'admin', null, null
from auth.users
where email = 'tyrone@example.com'
on conflict (id) do update set
  full_name = excluded.full_name,
  role = excluded.role,
  coach_name = excluded.coach_name,
  centre_name = excluded.centre_name,
  active = true;
```

Example coach profile:

```sql
insert into public.staff_profiles (id, email, full_name, role, coach_name, centre_name)
select id, email, 'Coach A', 'coach', 'Coach A', 'Tampines'
from auth.users
where email = 'coach.a@example.com'
on conflict (id) do update set
  full_name = excluded.full_name,
  role = excluded.role,
  coach_name = excluded.coach_name,
  centre_name = excluded.centre_name,
  active = true;
```

Example lead coach profile with two centres:

```sql
insert into public.staff_profiles (id, email, full_name, role, coach_name, centre_name)
select id, email, 'Lead Coach A', 'lead_coach', null, null
from auth.users
where lower(email) = lower('lead.coach@example.com')
on conflict (id) do update set
  full_name = excluded.full_name,
  role = excluded.role,
  coach_name = excluded.coach_name,
  centre_name = excluded.centre_name,
  active = true;

insert into public.staff_profile_centres (staff_profile_id, centre_name)
select id, 'Tampines'
from auth.users
where lower(email) = lower('lead.coach@example.com')
on conflict do nothing;

insert into public.staff_profile_centres (staff_profile_id, centre_name)
select id, 'Bedok'
from auth.users
where lower(email) = lower('lead.coach@example.com')
on conflict do nothing;
```

For assessment days, add the extra centre before the lead coach goes there. Remove it after the assessment day if the access should be temporary:

```sql
delete from public.staff_profile_centres
where staff_profile_id = (
  select id
  from auth.users
  where lower(email) = lower('lead.coach@example.com')
)
and centre_name = 'Bedok';
```

Centre names must match the `centre_name` values in `assessment_import_rows`, aside from capitalization and extra spaces.

## Supabase Invite and Password Reset Setup

Set Supabase **Authentication -> URL Configuration**:

```text
Site URL: https://your-vercel-app.vercel.app
Redirect URLs:
https://your-vercel-app.vercel.app/**
https://your-vercel-app.vercel.app/auth/callback
https://your-vercel-app.vercel.app/auth/callback?next=/auth/set-password
http://localhost:3000/**
http://localhost:3002/**
```

Put the base Vercel URL in **Site URL**. Do not put `/**` in the Site URL field.

If the Supabase invite modal has a **Redirect URL** field, use:

```text
https://your-vercel-app.vercel.app/auth/callback?next=/auth/set-password
```

This works with Supabase's default invite email body because the app now accepts the default callback/session link flow.

For server-side auth links, update Supabase **Authentication -> Email Templates**.

Invite user link:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/auth/set-password">
  Accept invitation
</a>
```

Reset password link:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/set-password">
  Reset password
</a>
```

Supabase documents this token hash flow for server-side auth because default links can return sessions in URL fragments that server components cannot read.

## Vercel Deployment

When importing `reddotpenguins/rdp-platform` as a new Vercel project:

- Framework Preset: `Next.js`
- Root Directory: leave blank, or use `.`
- Build Command: leave default, or use `pnpm build`
- Install Command: leave default
- Output Directory: leave default

Add these Vercel environment variables for Production, Preview, and Development:

```text
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-private-service-role-key
ENABLE_EXPERIMENTAL_COREPACK=1
```

`ENABLE_EXPERIMENTAL_COREPACK=1` tells Vercel to use the pnpm version pinned in `package.json`.

`SUPABASE_SERVICE_ROLE_KEY` is private and optional, but recommended. It lets the admin-only RBA delete button remove the Supabase Auth login account as well as the staff profile. Without it, the button removes website access only.

The same private key is required for the RBA page to send Supabase invite emails from the website.

## Default Dataset

The prototype loads this local file by default:

```text
data/RDP_LTS_2026_Q1_Q2_Cleaned_Combined.csv
```

This real assessment export is intentionally ignored by git so private student data is not pushed to GitHub. If the file is not present, the app falls back to:

```text
data/demo-lts-assessments.csv
```

To update the local default dataset, replace the ignored real CSV with a cleaned combined file using compatible column names, then restart the dev server.

## Upload CSV or XLSX Data

Go to `/upload` and choose a `.csv`, `.xls`, or `.xlsx` file. The uploaded file is parsed in the browser, normalized into the dashboard model, and saved into Supabase `assessment_import_rows`.

The parser maps similar column names, including:

- `Student Name`, `Name`, `Student`
- `Student Code`, `student_code`, `Student ID`
- `Coach`, `Coach Name`, `Current Coach`
- `Q1 Coach`, `Q2 Coach`
- `Centre`, `Location`, `Q1 Centre`, `Q2 Centre`
- `Level`, `Current Level`, `Q1 Level`, `Q2 Level`
- `Session`, `Session Time`, `Class Time`, `Q1 Session`, `Q2 Session`
- `Day`, `Session Day`, `Q1 Day`, `Q2 Day`
- `AM/PM`, `Session Period`, `Q1 AM/PM`, `Q2 AM/PM`
- `Q1 Result`, `2026 Q1`
- `Q2 Result`, `2026 Q2`
- `Flag Status`
- `Action Required`

Optional fields such as centre and level can be missing.

Quarter-specific coach, centre, level, and session fields are kept separately so student movement across coaches, centres, and session timings can be reviewed later. If day or AM/PM fields are supplied separately, they are folded into the session label for filtering. The dashboard shows weekday choices in the Day filter; rows will match those choices when the uploaded session information includes a day such as `Saturday`, `Sun`, or a separate `Q1 Day` / `Q2 Day` column.

A sample upload template is available at:

```text
public/sample-lts-assessment-template.csv
```

## Concern Highlights

Red means the student explicitly failed both Q1 and Q2. The suggested action is `Intervention Required`.

Yellow means the latest assessed result is `Fail`, but the student has not failed both Q1 and Q2. This includes Q1 blank and Q2 `Fail`. The suggested action is `Monitor`.

`None` means no immediate concern. Passed results are shown as results, but they do not create a green concern state.

## Concern Logic

Concern and action calculations live in:

```text
lib/assessmentLogic.ts
```

The dashboard recalculates concerns from assessment results even when the CSV already contains `Flag Status` or `Action Required` columns.

Rules:

- Q1 `Fail` and Q2 `Fail` gives `Red`
- If the latest assessed result is `Fail` and the row is not red, it gives `Yellow`
- Q1 blank and Q2 `Fail` gives `Yellow`
- Q1 `Fail` and Q2 blank gives `Yellow`
- Q1 `Fail` and Q2 `Pass` gives `None`
- Absent, Not Assessed, and blank are ignored when finding the latest assessed result

## Pass Rate Calculation

Pass rate is:

```text
Pass / (Pass + Fail)
```

Absent, Not Assessed, and blank results are excluded from assessed counts and pass rate denominators.

## Dashboard Views

`/dashboard` is the coach assessment view. It keeps the coach-level pass rate and intervention summary.

`/dashboard/quarter` is the quarter assessment view. It reorganizes rows by quarter, session timing, centre, and coach.

## Supabase and Future Dashboard Integration

This prototype connects to Supabase Auth and `assessment_import_rows`. A production version can extend this with:

- Supabase tables for students, coaches, assessment attempts, concern highlights, and intervention notes
- Quarter-by-quarter student assignment history for coach, centre, level, and session changes
- More detailed row-level access policies for admin, lead coach, and coach roles
- Import jobs for CSV/XLSX files
- Audit history for manual edits and intervention actions
- Shared user identity with the full RDP Management Dashboard
