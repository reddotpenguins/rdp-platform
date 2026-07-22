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
```

For the current prototype, run this file in Supabase SQL Editor after creating the tables:

```text
supabase/rls-policies.sql
```

Then create coach/admin login users in **Authentication -> Users** inside Supabase.

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
ENABLE_EXPERIMENTAL_COREPACK=1
```

`ENABLE_EXPERIMENTAL_COREPACK=1` tells Vercel to use the pnpm version pinned in `package.json`.

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
- `Q1 Result`, `2026 Q1`
- `Q2 Result`, `2026 Q2`
- `Flag Status`
- `Action Required`

Optional fields such as centre and level can be missing.

Quarter-specific coach, centre, level, and session fields are kept separately so student movement across coaches, centres, and session timings can be reviewed later.

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

This prototype intentionally does not connect to Supabase. A production version can replace `lib/sampleData.ts` and the local upload storage with:

- Supabase tables for students, coaches, assessment attempts, concern highlights, and intervention notes
- Quarter-by-quarter student assignment history for coach, centre, level, and session changes
- Row-level access policies for management and Lead Coach roles
- Import jobs for CSV/XLSX files
- Audit history for manual edits and intervention actions
- Shared user identity with the full RDP Management Dashboard
