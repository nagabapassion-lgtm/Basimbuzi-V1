# FINAL FIX — the API function now ships IN the repository

## Why your site redirected /api/health to the homepage and login said 405

Both symptoms have one cause: **your live deployment had no API function at
all.** The previous fix made the build generate `api/router.js` — but that
generated file never landed in your commit (the build-script change didn't
take), so after `api/router.ts` was deleted there was nothing to serve `/api/*`:

- `GET /api/health` fell through the rewrite rules to the homepage → you got
  the website instead of JSON.
- `POST /api/auth/send-otp` (the code login) also fell through to a static
  page → Vercel answered **405 Method Not Allowed** (static pages only accept
  GET/HEAD).

## The fix — nothing left to depend on

The pre-built function **`api/router.js` is now a committed file in the
repository itself**. Even if the build script is missing, fails, or changes,
the function is already there. Verified with the real Vercel builder:

- A deployment built WITHOUT the build-script change still ships the function
  and it answers correctly (health → 200, send-otp → reaches the handler).
- Full harness: 9/9 simulated requests pass. Typecheck clean, 32/32 tests.

`npm run build` still regenerates this file from `lib/backend/vercel-entry.ts`
whenever the backend code changes, so it stays fresh automatically.

## How to apply (GitHub Desktop)

1. **Copy everything from this package into your repository folder**,
   overwriting when asked. The package contains:
   - `api/router.js` and `api/router.js.map` (NEW — the committed function)
   - `lib/backend/vercel-entry.ts` (NEW — the source that builds it)
   - `package.json`, `.gitignore`
   - `MIGRATION_GUIDE.md`, `API-CLEANUP-NOTE.md` (this file)

2. **Check the `api` folder**: it must contain `router.js` and
   `router.js.map`, and **NOT** `router.ts`. If `router.ts` is still there,
   delete it — two router files would collide.

3. GitHub Desktop → summary `fix: ship pre-built API function` →
   **Commit to main** → **Push origin**.

## After the deploy — verify in this exact order

1. `https://YOUR-SITE.vercel.app/api/health` — must show JSON, never the
   homepage:
   - `"status":"unconfigured"` → function works; do step 2.
   - `"status":"ok"` → fully live; go log in.
   - homepage/error again → the push didn't include `api/router.js`; check
     the file list in your GitHub Desktop commit.
2. Vercel → Settings → Environment Variables: `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET` must all exist.
3. Changed/added any variable? **Deployments → ⋯ → Redeploy** — env vars only
   apply to deploys made after they were set.
4. `/api/health` again → `"status":"ok"`.
5. Log in (nagabapassion@gmail.com, original imported password; change it
   after signing in). The "code login" emails are NOT wired yet (Brevo phase),
   so use the password login for now.
6. Dashboard should show UGX 8,385,000 / 275 members once the Supabase import
   is complete (MIGRATION_GUIDE.md has the row-count table).
