-- QuickBooks Online OAuth connection storage.
-- Run after supabase/claims-foundation.sql.
-- Tokens must stay server-only. Do not grant this table to authenticated users.

create extension if not exists pgcrypto;

create table if not exists public.quickbooks_connections (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  environment text not null check (environment in ('sandbox', 'production')),
  realm_id text not null,
  access_token text not null,
  refresh_token text not null,
  access_token_expires_at timestamptz not null,
  refresh_token_expires_at timestamptz not null,
  active boolean not null default true,
  connected_by uuid references public.staff_profiles(id) on delete set null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, environment)
);

alter table public.quickbooks_connections enable row level security;

revoke all on public.quickbooks_connections from anon, authenticated;
grant select, insert, update, delete on public.quickbooks_connections to service_role;

create index if not exists quickbooks_connections_realm_idx
  on public.quickbooks_connections (realm_id);
