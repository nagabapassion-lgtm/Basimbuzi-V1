# Fix: Login 500 / "No account registered" / flapping /api/health

**Date:** 2026-11-26
**Symptoms fixed:** password login silently failing (HTTP 500 "Server authentication
error"), email-code login wrongly saying "No account registered with this email",
and /api/health flapping between `status:"ok"` and
`"permission denied for table settings"`.

## Root cause (one bug, three symptoms)

`lib/backend/handlers/auth.ts` called `signInWithPassword` on the SHARED
service-role Supabase client. supabase-js keeps the user session in memory
after a successful sign-in, so every LATER database query on that client was
sent with the USER's access token (Postgres role `authenticated`) instead of
the service-role key. Two consequences:

1. The login handler's next step — looking up the user profile in `app_users` —
   immediately failed with `permission denied for table app_users`. The error
   was swallowed (`data || null`), so login returned an opaque 500 and the OTP
   path returned "No account registered" for an account that exists.
2. The serverless function caches that client as a module singleton. A warm
   instance that had processed one login attempt was "poisoned": every
   subsequent request landing on it — including /api/health table probes —
   ran as `authenticated` and failed with
   `permission denied for table settings` etc. This is why health flipped
   between ok and unavailable, while `auth_service` (a different auth path)
   stayed ok in the failing responses.

## What changed

- `lib/backend/db.ts` — added `getAuthVerifier()`: a dedicated client used
  ONLY for password verification. It may hold user sessions; it is never used
  for table queries, so nothing can be poisoned.
- `lib/backend/handlers/auth.ts` — login now verifies passwords via
  `getAuthVerifier()`; `loadUserRow` / `provisionProfile` no longer swallow
  database errors (a real error now surfaces as a readable JSON message
  instead of a fake "no account").
- `api/router.js` + `api/router.js.map` — rebuilt with esbuild
  (`npm run build`). These committed artifacts ARE the deployed function.

## Deploy steps

1. Extract this zip INTO the repository root (the same folder as
   `package.json`), allowing it to replace `api/router.js`,
   `api/router.js.map`, `lib/backend/db.ts`,
   `lib/backend/handlers/auth.ts`, `.gitignore`, `package.json`,
   `vercel.json`.
2. GitHub Desktop: commit ALL files (must include both `api/` files) and push.
3. Wait for Vercel to finish deploying (Deployments → latest = Ready).
4. Open `https://basimbuziv1.vercel.app/api/health` and refresh ~5 times over
   2 minutes — it must stay `status: "ok"` every time, even AFTER someone has
   tried to log in.
5. Log in with nagabapassion@gmail.com / Passion@2026 — should succeed and
   land on the dashboard.

No Supabase changes are required for this fix. The RLS policies added in the
dashboard for `authenticated` are harmless (the backend uses service_role),
and can stay.

## Housekeeping reminder (after everything works)

Rotate the Supabase keys pasted into chat: Dashboard → Settings → API Keys,
then update SUPABASE_SERVICE_ROLE_KEY in Vercel and Redeploy.
