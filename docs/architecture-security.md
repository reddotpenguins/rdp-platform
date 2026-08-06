# Architecture And Security Notes

The Red Dot Penguins Platform is an internal operations platform built as a modular monolith. The current focus is operational workflows, not a full student CRM or parent/student portal.

## Current Stack

- Next.js and React for the app
- TypeScript for maintainable application logic
- Supabase for authentication, database, and RLS
- Vercel for hosting
- GitHub for source control

## Module Direction

The app should remain organised around operational modules:

- Authentication and users
- Roles and permissions
- Coach assessments
- Role-based assessment administration
- Claims
- Enquiries
- Hospitality
- Reports
- Audit logs
- Administration

Each module should own its UI, validation, business rules, database access, and permission checks as much as practical.

## Permission Model

Roles are collections of permissions. Application code should prefer named permission helpers over direct role comparisons.

The initial permission catalogue lives in `lib/staffRoles.ts` and includes:

- User administration: `users.view`, `users.create`, `users.update`, `users.disable`, `roles.assign`
- Assessments: `assessments.create`, `assessments.viewOwn`, `assessments.viewTeam`, `assessments.viewAll`
- Claims: `claims.create`, `claims.viewOwn`, `claims.review`, `claims.approve`, `claims.markPaid`, `claims.settings.manage`
- Enquiries and students: `enquiries.assign`, `students.view`, `students.manage`
- Reporting and governance: `reports.view`, `reports.export`, `audit.view`, `settings.manage`

The current Supabase database still stores compact role names: `admin`, `lead_coach`, and `coach`. That is acceptable for now, but feature code should ask for permissions through helpers such as `hasStaffPermission`, `canManageStaffAccess`, `canManageCustomerEnquiries`, and `canViewTeamAssessments`.

## Security Defaults

- Protected pages must call `requireActiveStaffSession`.
- Server actions and API routes must enforce authorization again.
- Supabase RLS must remain enabled for operational tables.
- Service role keys must only be used on the server.
- Anonymous users should not be able to read or write operational records.
- Staff should only see records allowed by their permissions and assigned centres.

## Known Follow-Up Work

- Move Supabase RLS helper functions from role-name checks toward permission checks.
- Add append-only audit tables for role changes, assessment submissions, claims approvals, claim rejections, enquiry assignments, exports, and user disable actions.
- Add role-based test fixtures that verify coach, lead coach, admin, and anonymous access paths.
- Keep file upload validation strict for claim receipts and assessment imports.

## Feature Review Template

For meaningful features, document:

1. Architectural overview
2. Security considerations
3. Database changes
4. Permission requirements
5. Risks
6. Recommended implementation
