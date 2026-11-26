# IMPORTANT — read before copying this fix into your repository

## What this fix does
Vercel's Hobby plan allows at most **12 Serverless Functions** per deployment.
The migration drop had 34 individual `api/` endpoint files, so the build failed.
This package replaces all of them with **ONE function** (`api/router.ts`) plus a
routing rule in `vercel.json` — every `/api/...` URL stays exactly the same.
It also bakes the `service_role` GRANTs into `supabase/schema.sql` (the
"permission denied for table members" fix you ran by hand), so a fresh run of
`schema.sql` never hits that error again.

## How to apply (GitHub Desktop, 4 steps)

1. **DELETE the old `api` folder** in your repository folder (the whole folder,
   everything inside — this is essential: leftover files would still count as
   functions and the build would fail again).

2. **Copy the new `api` folder** from this package into the repository folder
   (it contains a single file: `api/router.ts`).

3. **Copy these files too**, overwriting when asked:
   - `vercel.json`
   - `lib/backend/router.ts` (new file — goes inside the existing `lib/backend` folder)
   - `supabase/schema.sql`
   - `tests/router.test.ts` (new file — goes inside the existing `tests` folder)
   - `MIGRATION_GUIDE.md`
   - `API-CLEANUP-NOTE.md` (this file)

4. In GitHub Desktop: summary text `fix: single API function for Vercel Hobby
   plan limit` → **Commit to main** → **Push origin**.

## Then verify
- Vercel should build WITHOUT the 12-function error.
- Open the site, log in, and check the dashboard shows your club totals
  (UGX 8,385,000 / 275 members once the import is done).
- Quick API check in the browser: open `https://YOUR-SITE.vercel.app/api/health`
  → it should answer JSON `{"success":true,...}`.

## If the import hasn't finished yet
Run it any time after this fix (see MIGRATION_GUIDE.md Step 3). The updated
`schema.sql` includes the GRANTs, so re-running the whole file in the Supabase
SQL Editor first is safe and fixes the "permission denied" error permanently.
