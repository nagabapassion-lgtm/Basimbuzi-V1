# SC Basimbuzi — Central Backend Contract (Supabase-backed /api functions)

You are porting the Express server in `server.ts` (4,046 lines) to a **shared handler layer**
that runs BOTH as Vercel serverless functions (`api/**/*.ts`) and as the AI-Studio/local
Express app (new thin `server.ts`). All data lives in **Supabase Postgres** (schema in
`supabase/schema.sql`). JSON files under `data/` are NO LONGER used at runtime.

## Environment variables (server-side ONLY, never in the browser bundle)
- `SUPABASE_URL` — project URL
- `SUPABASE_SERVICE_ROLE_KEY` — service key (bypasses RLS)
- `SESSION_SECRET` — random 32+ byte string for signing session tokens

Use the `@supabase/supabase-js` package (add it to `dependencies` in package.json).
Create ONE admin client in `lib/backend/db.ts`:
```ts
import { createClient } from '@supabase/supabase-js';
export const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
```

## Handler architecture
- `lib/backend/types.ts` — shared types: `HandlerCtx { method: string; headers: Record<string,string>; query: Record<string,string>; params: Record<string,string>; body: any; }`, `HandlerResult { status: number; body: any; headers?: Record<string,string>; }`
- `lib/backend/auth.ts` — token helpers:
  - `signToken(payload: {sub: string; name?: string; role?: string; kind: 'staff'|'member'; memberId?: string; exp: number}): string` — HMAC-SHA256 JWT using node:crypto (base64url, header {alg:'HS256',typ:'JWT'}). NO external jwt dependency.
  - `verifyToken(token: string): TokenPayload | null` — verify signature + exp.
  - `getBearer(headers): string` — read `authorization: Bearer x`.
  - `requireStaff(ctx, roles?: string[]): {user} | error` — verifies token kind='staff', loads fresh profile from `app_users` by email (so INACTIVE/deleted staff lose access immediately), checks status ACTIVE and (if roles given) role included. Owner role is 'OWNER'.
- `lib/backend/handlers/*.ts` — one module per domain (see routes below). Export named async functions `(ctx: HandlerCtx) => Promise<HandlerResult>`.
- `api/<name>.ts` — Vercel functions: thin wrapper `export default async function (req, res) { const result = await handler(toCtx(req)); res.status(result.status).setHeaders... .json(result.body) }`. For dynamic routes use `api/[...]` filenames (e.g. `api/transactions/[receipt]/resend.ts` → params.receipt). Read `req.url` query into ctx.query.
- `server.ts` — REWRITE as a thin Express app: `export function createApp(): Express` mounts ALL the same routes to the same handlers (wrap HandlerResult → res.status().json()), keeps `express.json({ limit: '25mb' })`, keeps serving static files exactly like today (dist/ + public/ + uploads fallback), and keeps the `listen` behavior at the bottom guarded by `if (require.main === module)`. Remove ALL file-storage logic from server.ts. Keep `dotenv` config loading. Express app must still work when AI Studio runs it (AI Studio uses `server.ts` directly; check metadata.json for the exact run command and do not break it).

## DB conventions
- Table/column names in `supabase/schema.sql` (snake_case). Convert rows ↔ client camelCase types (`src/types.ts`) with small mapping helpers in `lib/backend/map.ts`. Keep field names in API responses EXACTLY as the client expects them today (client types: Transaction, Member, User, AppSettings, AuditLogEntry, PublicSiteContent, MemberProfileSubmission, SupporterInquiry, MembersDirectoryPayload, ReconciliationSummary, MemberPaymentSummary).
- Amounts: numeric columns — always Number() them before responding.
- Dates/times: stored as the client's exact strings ('YYYY-MM-DD', 'HH:mm:ss') — do NOT reformat.
- Sanitization: reuse the same rules as server.ts (staff-email stripping on payer emails, phone cleaning, type INFLOW/OUTFLOW, paymentStatus CANCELLED exclusion). You may import pure helpers from `src/utils/ledgerReconciliation.ts` (it has no node deps) or copy the needed functions into `lib/backend/`.

## Session tokens
- Staff login issues a `kind:'staff'` token (12h expiry) containing sub=email, role, name.
- Member login issues a `kind:'member'` token (12h) containing sub=email, memberId, name.
- Responses: `{ success: true, authorized: true, user: <User-shaped, NO password>, token }`.
- OTP codes: 6 digits, sha256(code + SESSION_SECRET salt) stored in `otp_codes`, 10 min expiry, max 5 verify attempts (increment attempts, reject when exceeded), 30s resend rate-limit. While no email provider is connected, the SEND endpoints RETURN the code in the response (`data.code` / `devCode` field — preserve whatever field name `server.ts` used so the UI keeps showing it).

## Routes to implement (exact paths & response shapes — the browser client depends on them)

### Auth
- `POST /api/auth/login` `{email, password}` → verify password via `db.auth.signInWithPassword({email, password})` (works with service client); load `app_users` row; reject INACTIVE with the same message text server.ts used; success → `{success:true, authorized:true, user, token}`. Failure → status 401 `{success:false, message:'Incorrect password. Please verify and try again.'}` or the not-registered / INACTIVE messages from server.ts.
- `POST /api/auth/send-otp` `{email}` → staff existence check in `app_users`; rate-limit 30s; store hashed code; respond `{success:true, data:{email, code?}, message}` (same shapes as server.ts's local OTP path).
- `POST /api/auth/verify-otp` `{email, code}` → validate → `{success:true, authorized:true, user, token}`.
- `POST /api/auth/check` `{email}` + bearer → token must exist & sub==email → `{success:true, authorized:true, user}` (fresh profile). Invalid/expired → `{success:true, authorized:false, message:'Session expired. Please sign in again.'}`.
- `GET /api/health` → `{success:true, message:'Central database connected', timestamp}` — also verify DB reachable with a trivial select.

### Bootstrap & ledger
- `GET /api/bootstrap` (staff token) → `{success, data:{ settings, transactions: Transaction[] (desc by date/time), users: User[] (NO passwords), auditLogs: AuditLogEntry[] (latest 500) }}` — settings row merged over the same defaults server.ts used; if settings row missing use defaults.
- `GET /api/historical-transactions` (staff token) → `{success, data: Transaction[], coveredGasReceipts: []}` (full ledger; header `x-operator-email` may be sent for logging).
- `POST /api/transactions` (staff token) body `{type?, payerName?, payee?, category?, phone?, email?, amount, paymentPurpose?, paymentMethod, paymentReference?, notes?, operatorEmail, operatorName, approvedBy?, paymentStatus?, memberId?}` → sanitize like server.ts/GAS did; receipt number: inflow scope `'{prefix}-{year}'` (prefix from settings.receiptPrefix default 'SB') via `select public.next_receipt_number(scope)`; outflow scope `'EXP-{year}'`; insert row; return `{success:true, data: Transaction, message}` (messages like server.ts). Duplicate receipt → retry numbering once.
- `DELETE /api/transactions/:receiptNumber` (staff token; role OWNER or permissions.canDeleteTransactions) → delete → `{success:true, message}`. Also write audit_log entry.
- `POST /api/transactions/:receiptNumber/resend` (staff token) → if tx.email present set email_status='PENDING'; return `{success:true, data: tx, message: 'Email delivery is queued — Brevo integration pending. Receipt ${num} is ready to share on WhatsApp.'}`; if no email → same as server.ts "not provided" error.
- `GET /api/export/ledger.csv` (staff token; canViewReports) → 200 text/csv of all transactions (headers: Receipt,Type,Date,Time,Name,Phone,Email,Category/Purpose,Method,Reference,Amount UGX,Status,Generated By). Content-Disposition attachment.

### Users admin
- `GET /api/users` (staff token) → `{success, data: User[]}` (never include password).
- `POST /api/users` (staff token; canManageUsers) body `{user}` (upsert one) or `{users: [...]}` (upsert many). Upsert into `app_users` by email. If `user.password` non-empty: find auth user by email (`db.auth.admin.listUsers` then match, or `inviteUserByEmail` flow) → create (`admin.createUser({email, password, email_confirm:true})`) or update (`admin.updateUserById`). Role OWNER cannot be demoted/removed via this route. → `{success:true, data: user?}`
- `PATCH /api/users` (staff token; canManageUsers) `{email, status:'ACTIVE'|'INACTIVE'}` → update app_users.status (OWNER cannot be deactivated) → `{success:true}`.
- `DELETE /api/users?email=...` (staff token; canManageUsers) → refuse deleting OWNER; delete app_users row + auth user → `{success:true}`.
- `POST /api/users/password` (staff token; canManageUsers OR target==self) `{email, password}` → admin update password → `{success:true}`.

### Settings & config (legacy no-ops)
- `GET /api/settings` (staff token) → `{success, data: AppSettings}` (row 1 merged over defaults).
- `POST /api/settings` (staff token; canEditSettings) `{settings}` → upsert row 1 → `{success:true, data}`.
- `GET /api/config` → `{success:true, data:{gasUrl:''}}` (legacy keep-alive, no auth).
- `POST /api/config` → `{success:true}` (legacy no-op).
- `POST /api/gas/invalidate-cache` → `{success:true}` (legacy no-op).

### Audit
- `GET /api/audit` (staff token) → `{success, data: AuditLogEntry[]}` latest 500.
- `POST /api/audit` (staff token) `{action, description, receiptNumber?, transactionId?, user:{name,email}}` → insert into audit_log (date/time strings generated server-side like server.ts) → `{success:true}`.

### Members admin (port server.ts logic 2309–3119 faithfully)
- `GET /api/admin/members` (staff token) → `{success, data:{ members, submissions, summary: MembersDirectorySummary, reconciliation: ReconciliationSummary|null }}` — compute summary + reconciliation exactly like server.ts (pre-NLL/spot/paidAfter sums, pending submissions count; reconciliation reuses server.ts's algorithm comparing members' recorded totals against transactions).
- `POST /api/admin/members` (staff token; canEditMembers) `{member}` → upsert by id (or match by canonical name if server.ts did) → recompute that member's derived totals → `{success, data: member}`.
- `POST /api/admin/members/import-csv` (staff token; canEditMembers) `{csvText}` → port server.ts CSV parsing/upsert + summary → `{success, data:{addedCount, updatedCount, summary}}`.
- `POST /api/admin/members/merge` (staff token; canEditMembers) `{primaryMemberId, duplicateMemberIds}` → sum totals into primary, re-point transactions.member_id, delete duplicates → `{success}`.
- `POST /api/admin/members/:id/claim-link` (staff token; canEditMembers) → generate 32-hex token, store on member row (claim_token, claim_token_expires_at = +48h) → `{success, data:{token, expiresAt, memberName}}`.
- `POST /api/admin/members/submissions/:submissionId/review` (staff token; canEditMembers) `{decision:'APPROVE'|'REJECT', reviewNotes}` → APPROVE applies submitted profile onto member (like server.ts) → `{success, data: submission}`.
- `POST /api/admin/members/reconcile-ledger` (staff token; canEditMembers) → recompute all members' derived payment columns from transactions + write reconciliation summary → `{success, data: ReconciliationSummary}`.

### Public website
- `GET /api/public-site` (NO auth; Cache-Control: public, s-maxage=60) → `{success, data:{content: PublicSiteContent, organization: {organizationName, organizationEmail, organizationPhone, organizationAddress, logoUrl}}}` (site_content row 1; fall back to server.ts defaults if empty).
- `POST /api/public-site` (staff token; canManageWebsite) `{content}` → upsert row 1 with updatedAt/updatedBy stamps → `{success, data: content}`.
- `POST /api/public-site/upload-image` (staff token; canManageWebsite) `{dataUrl, filename}` → decode data URL → `db.storage.from('site-media').upload(`${Date.now()}-${safeName}`, bytes, {contentType, upsert:false})` → getPublicUrl → `{success:true, url}`. Limit 5MB, png/jpeg/webp/gif only.
- `POST /api/public-inquiries` (NO auth) `{fullName, phone, email, interest, message}` → insert uuid → `{success:true}`.
- `GET /api/public-inquiries` (staff token; canManageWebsite) → `{success, data: SupporterInquiry[]}`.
- `PATCH /api/public-inquiries/:id` (staff token; canManageWebsite) `{status}` → update → `{success, data}`.

### Member portal (port server.ts logic 3119–4025 faithfully)
- `POST /api/me/send-code` `{email}` → same rules as server.ts (placeholder-email rejection, 30s rate limit, registered-member lookup incl. pending-submission messaging, member OTP in otp_codes with purpose MEMBER_LOGIN) → same response shapes as server.ts (including any devCode/code field it returned).
- `POST /api/me/verify-code` `{email, code}` → validate → `{success:true, token, member:{email, name}}` (member JWT kind='member').
- `GET /api/me/payments` (member bearer) → `MemberPaymentSummary` — port fetchRegisteredMemberData + payment-matching logic from server.ts exactly (match by email, then phone, then name).
- `POST /api/me/verify-receipt` (member bearer) `{receiptNumber}` → port server.ts verification.
- `GET /api/me/claim/:token` → port claim-link profile lookup.
- `POST /api/me/claim/:token` `{...profile}` → port submission-creation/update logic.
- `PATCH /api/me/profile` (member bearer) → port (creates PENDING submission or updates per server.ts behavior).

## Rules
- TypeScript strict-clean under the repo's tsconfig (`npx tsc --noEmit` must pass).
- Do NOT import anything from `src/` into `lib/backend/` except pure files with no browser/node-conflicting imports (check: `src/utils/ledgerReconciliation.ts`, `src/utils/security.ts` are fine; NOTHING from React).
- Do NOT modify anything under `src/` (the client is being updated separately).
- Do NOT keep any file-JSON persistence (no fs writes to data/).
- Preserve exact user-facing message strings from server.ts wherever the client matches on them (e.g. 'Incorrect password', 'INACTIVE', 'ACCESS DENIED', 'not registered', 'awaiting administrator approval').
- Every handler wraps its body in try/catch → 500 `{success:false, error: message}`.
- After implementing, run `npx tsc --noEmit` and fix all errors you introduced.
- List every file you created/changed and any endpoint where server.ts semantics were ambiguous in your final report.
