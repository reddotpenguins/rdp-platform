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
```

For the current prototype, run this file in Supabase SQL Editor after creating the tables:

```text
supabase/auth-and-roles.sql
```

This creates `staff_profiles`, `staff_profile_centres`, adds `admin`, `lead_coach`, and `coach` roles, and protects `assessment_import_rows` with role-aware RLS.

The app also includes an admin-only RBA page at:

```text
/rba
```

Admins can update existing staff names, roles, active status, and lead coach centre assignments from that page. The **Add invited staff profile** form uses the `admin_upsert_staff_profile` helper in `supabase/auth-and-roles.sql`, so run the latest SQL file once before adding new invited users by email from the website.

How access works:

- `admin`: can see and manage all assessment rows.
- `lead_coach`: can see and upload rows only for assigned centres in `staff_profile_centres`.
- `coach`: can see their own assessment rows by `coach_email`, or by exact `coach_name` when email is blank.

The same role rules protect the `/enquiries` page:

- `admin`: can see and update all customer enquiry tickets.
- `lead_coach`: can see and update enquiry tickets for assigned centres.
- `coach`: cannot access enquiry tickets.

## Enquiry, Trial, and Sign-Up Tickets

The `/enquiries` page reads from:

```text
public.customer_enquiries
```

Use Make.com to keep your current respond.io to Google Sheets workflow, then add one more Make.com step to upsert into Supabase `customer_enquiries`.

Recommended Make.com field mapping:

```text
parent_name
phone
email
child_name
child_age
centre_name
programme
enquiry_type
status
source
message
assigned_to
notes
respondio_contact_id
respondio_conversation_id
google_sheet_row_id
```

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
