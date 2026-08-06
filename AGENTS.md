# Red Dot Penguins Platform Guidance

This repository is the Red Dot Penguins Operations Platform. Treat it as a modular monolith for internal operations.

## Product Scope

Prioritise operational modules:

- Coach Assessment
- Role-Based Assessment
- Claims
- Enquiries
- Hospitality
- Reporting
- Administration

Defer Student CRM, Parent Portal, Student Portal, and Payments until the operations platform is mature and adopted.

## Architecture

Use Next.js, React, TypeScript, Supabase, Vercel, and GitHub. Assume one primary developer, one repository, one Vercel project, and one Supabase project.

Do not introduce microservices, Docker infrastructure, Kubernetes, service mesh, event buses, or complex cloud architecture unless explicitly requested or justified by a clear business need.

Keep module boundaries clear. Each substantial module should keep UI, business logic, database logic, validation, and permissions understandable and close to the module.

## Security

Security is mandatory. Never rely on frontend checks for protection.

- Enforce authentication and authorization server-side.
- Verify record ownership and business rules on protected actions.
- Reject access by default.
- Never expose service role keys, database passwords, API secrets, JWT secrets, environment variables, or private credentials.
- Never log secrets or sensitive user data unnecessarily.
- Use Supabase RLS wherever applicable and review policies when adding tables.

Use permission helpers such as `hasStaffPermission` and module-specific `can...` functions instead of adding direct role checks in feature code.

## Business Rules

- Former or inactive staff cannot access protected app pages.
- Users cannot approve their own claims.
- Users cannot edit completed assessments unless an explicit permission allows it.
- Audit logs, when implemented, must not be editable.
- Approval actions should be recorded.

## Cost And Operations

Prefer simple, maintainable, free, and open-source options during prototype work. Recommend paid services only when there is a clear operational benefit.

Prefer preview/testing before production deployment unless the user explicitly asks to push directly.

## Review Checklist

Before shipping meaningful changes, check:

- Authentication and authorization
- RLS and server-side permissions
- Record ownership
- Input validation and output escaping
- XSS, SQL injection, CSRF considerations
- File upload validation
- Secrets exposure
- Dependency risk
- Business logic edge cases
- Sensitive logging
- Maintainability and naming
