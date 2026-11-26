-- =====================================================================
-- SC BASIMBUZI — SUPABASE SCHEMA (single source of truth)
-- Run this ONCE in: Supabase Dashboard → SQL Editor → New query → paste → Run
-- Safe to re-run (idempotent: uses IF NOT EXISTS / OR REPLACE).
-- Region recommendation for the project itself: eu-central-1 (Frankfurt)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. STAFF ACCOUNTS (mirrors Supabase Auth users)
--    Passwords NEVER live here — they live in Supabase Auth (hashed).
-- ---------------------------------------------------------------------
create table if not exists public.app_users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text unique not null,
  name        text not null default '',
  role        text not null default 'ISSUER' check (role in ('OWNER','ADMIN','ISSUER','MEDIA')),
  status      text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  permissions jsonb,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. ORGANIZATION SETTINGS (single row, id = 1)
-- ---------------------------------------------------------------------
create table if not exists public.settings (
  id         int primary key default 1 check (id = 1),
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- ---------------------------------------------------------------------
-- 3. TREASURY TRANSACTIONS (receipts + expense vouchers)
--    receipt_number is the primary key: SB-2026-00042 / EXP-2026-00003
-- ---------------------------------------------------------------------
create table if not exists public.transactions (
  receipt_number   text primary key,
  transaction_id   text,
  member_id        text,
  type             text not null default 'INFLOW' check (type in ('INFLOW','OUTFLOW')),
  date             text not null default '',           -- YYYY-MM-DD (client format kept verbatim)
  time             text not null default '',           -- HH:mm:ss
  payer_name       text not null default '',           -- payer (inflow) or payee (outflow)
  payee            text,
  category         text,
  voucher_number   text,
  approved_by      text,
  phone            text not null default '',
  email            text not null default '',
  amount           numeric(14,2) not null default 0 check (amount >= 0),
  payment_purpose  text not null default '',
  payment_method   text not null default '',
  payment_reference text not null default '',
  notes            text not null default '',
  generated_by     text not null default '',
  operator_email   text not null default '',
  payment_status   text not null default 'COMPLETED',  -- COMPLETED|PENDING|REFUNDED|CANCELLED
  email_status     text not null default 'NOT_PROVIDED',
  sync_status      text,
  created_at       timestamptz not null default now()
);

create index if not exists idx_transactions_date   on public.transactions (date desc, time desc);
create index if not exists idx_transactions_member on public.transactions (member_id);
create index if not exists idx_transactions_email  on public.transactions (lower(email));
create index if not exists idx_transactions_phone  on public.transactions (phone);

-- ---------------------------------------------------------------------
-- 4. ATOMIC RECEIPT NUMBERING (no duplicate receipt numbers, ever)
--    scope is e.g. 'SB-2026' (inflow) or 'EXP-2026' (outflow)
-- ---------------------------------------------------------------------
create table if not exists public.receipt_counters (
  scope      text primary key,
  last_seq   int not null default 0,
  updated_at timestamptz not null default now()
);

create or replace function public.next_receipt_number(p_scope text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq int;
begin
  insert into receipt_counters (scope, last_seq) values (p_scope, 1)
  on conflict (scope) do update
    set last_seq = receipt_counters.last_seq + 1,
        updated_at = now()
  returning last_seq into v_seq;
  return p_scope || '-' || lpad(v_seq::text, 5, '0');
end;
$$;

-- ---------------------------------------------------------------------
-- 5. MEMBERS DIRECTORY
-- ---------------------------------------------------------------------
create table if not exists public.members (
  id                  text primary key,             -- memberId (SB-M001 / PAYER-0001)
  name                text not null,
  phone               text not null default '',
  email               text not null default '',
  address             text not null default '',
  gender              text not null default '',
  school              text not null default '',
  house               text not null default '',
  role                text not null default '',     -- player / supporter / exec etc.
  status              text not null default '',
  last_payment_date   text not null default '',
  total_contributed   numeric(14,2) not null default 0,
  pre_nll_paid        numeric(14,2) not null default 0,
  spot_paid           numeric(14,2) not null default 0,
  paid_after          numeric(14,2) not null default 0,
  historical_paid     numeric(14,2) not null default 0,
  live_paid           numeric(14,2) not null default 0,
  expected_target_ugx numeric(14,2) not null default 0,
  remaining_ugx       numeric(14,2) not null default 0,
  dues_status         text not null default '',
  profile_status      text not null default '',
  payment_count       int not null default 0,
  last_purpose        text not null default '',
  source              text not null default '',
  claim_token         text not null default '',
  claim_token_expires_at timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_members_email on public.members (lower(email));
create index if not exists idx_members_phone on public.members (phone);
create index if not exists idx_members_name  on public.members (lower(name));

-- ---------------------------------------------------------------------
-- 6. MEMBER PROFILE SUBMISSIONS (claim/self-service updates)
-- ---------------------------------------------------------------------
create table if not exists public.member_submissions (
  id                text primary key,
  member_id         text not null,
  member_name       text not null default '',
  submitted_name    text not null default '',
  submitted_email   text not null default '',
  submitted_phone   text not null default '',
  submitted_address text not null default '',
  submitted_gender  text not null default '',
  submitted_school  text not null default '',
  submitted_house   text not null default '',
  pre_nll_paid      numeric(14,2) not null default 0,
  spot_paid         numeric(14,2) not null default 0,
  paid_after        numeric(14,2) not null default 0,
  total_paid        numeric(14,2) not null default 0,
  submitted_at      timestamptz not null default now(),
  status            text not null default 'PENDING', -- PENDING|APPROVED|REJECTED
  reviewed_by       text,
  reviewed_at       timestamptz,
  review_notes      text
);

create index if not exists idx_submissions_email on public.member_submissions (lower(submitted_email));
create index if not exists idx_submissions_status on public.member_submissions (status);

-- ---------------------------------------------------------------------
-- 7. AUDIT LOG (append-only)
-- ---------------------------------------------------------------------
create table if not exists public.audit_log (
  id             bigint generated always as identity primary key,
  date           text not null default '',
  time           text not null default '',
  user_name      text not null default '',
  user_email     text not null default '',
  action         text not null default '',
  receipt_number text,
  transaction_id text,
  description    text not null default '',
  created_at     timestamptz not null default now()
);

create index if not exists idx_audit_created on public.audit_log (created_at desc);

-- ---------------------------------------------------------------------
-- 8. PUBLIC WEBSITE CONTENT (single row, id = 1; news/fixtures/merch jsonb)
-- ---------------------------------------------------------------------
create table if not exists public.site_content (
  id         int primary key default 1 check (id = 1),
  content    jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- ---------------------------------------------------------------------
-- 9. SUPPORTER INQUIRIES (public "Join the Club" form)
-- ---------------------------------------------------------------------
create table if not exists public.inquiries (
  id         text primary key,
  full_name  text not null default '',
  phone      text not null default '',
  email      text not null default '',
  interest   text not null default 'General',
  message    text not null default '',
  status     text not null default 'NEW',          -- NEW|CONTACTED
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 10. LOGIN / MEMBER OTP CODES (hashed, expiring — never stored plain)
-- ---------------------------------------------------------------------
create table if not exists public.otp_codes (
  email      text primary key,
  code_hash  text not null,                        -- sha256(code + salt)
  purpose    text not null default 'STAFF_LOGIN',  -- STAFF_LOGIN|MEMBER_LOGIN
  expires_at timestamptz not null,
  attempts   int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 11. STORAGE BUCKET for site images (logo, hero, news, merch photos)
--     Public read; uploads happen only through the app's API functions.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('site-media', 'site-media', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 12. LOCK IT DOWN (Row Level Security)
--     The Vercel/AI-Studio API functions use the service_role key, which
--     bypasses RLS. With NO policies below, the anon/public key can touch
--     NOTHING directly. The browser never holds any Supabase key at all.
-- ---------------------------------------------------------------------
alter table public.app_users           enable row level security;
alter table public.settings            enable row level security;
alter table public.transactions        enable row level security;
alter table public.receipt_counters    enable row level security;
alter table public.members             enable row level security;
alter table public.member_submissions  enable row level security;
alter table public.audit_log           enable row level security;
alter table public.site_content        enable row level security;
alter table public.inquiries           enable row level security;
alter table public.otp_codes           enable row level security;

-- ---------------------------------------------------------------------
-- 13. SERVER PRIVILEGES (service_role)
--     The app's API server (Vercel functions / Express / the import
--     script) connects with the service_role key. On newer projects,
--     tables created via the SQL Editor do NOT automatically receive
--     table-level privileges for service_role, which shows up as
--     "permission denied for table ..." during the data import.
--     These grants make it explicit and cover future tables too.
--     (Safe to re-run — GRANT statements are idempotent.)
-- ---------------------------------------------------------------------
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on function public.next_receipt_number(text) to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;

-- Done. Next step: import your data (see MIGRATION_GUIDE.md).
