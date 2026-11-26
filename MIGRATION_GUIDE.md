# SC Basimbuzi — Supabase Migration Guide
**Goal:** one central database that Vercel, AI Studio and local development all read from — so every dashboard shows the same, correct amounts — plus faster loading and reliable images.

---

## Why the two dashboards showed different amounts (read this first)

Your app previously had **three copies of the data**:

1. **AI Studio's temporary container disk** — where you did daily work. This held the *real, current* ledger (this copy is correct).
2. **Static JSON files in the GitHub repo** — served by Vercel as a fallback. These were public, out of date, and were emptied during Phase 0 (security cleanup), so Vercel showed near-zero amounts.
3. **Google Sheets** — the treasurer's mirror, updated by the old Apps Script backend.

Phase 0 never intended to fix the amounts — it removed leaked passwords and member data from the public repo. The *only* real fix is what this migration does: **all deployments now read and write one Supabase database**, and your club data is imported into it.

---

## STEP 0 — Your data is already rescued (done for you)

Your export to `C:\sc-basimbuzi-migration` came out nearly empty (`members.json` and `historical_transactions.json` were 0 KB) because the AI Studio file tree showed the repo's cleaned files, not the live data.

**The complete original data is safe in your repository's git history**, and I've packaged it as **`basimbuzi-data-rescue.zip`**:

| File | Contents |
|---|---|
| `members.json` | **275 members** (full register) |
| `historical_transactions.json` | **361 payments** — total **UGX 8,385,000**, Mobile Money, dated **2026-06-01 → 2026-09-15** |
| `users.json` | **All 4 staff accounts** (nagabapassion, jotham.itungo, passionwork94, hildanamy7) **with their original passwords** — so everyone keeps their login |
| `settings.json`, `public_site.json`, `reconciliation.json` | Website content + treasury settings |

1. Download `basimbuzi-data-rescue.zip` and unzip it to a folder, e.g. `C:\sc-basimbuzi-rescue`.
2. **Never commit these files to GitHub** — they contain member personal data. They are only fed to the importer in Step 3.
3. **Cross-check (optional but smart):** open your Google Sheets ledger and confirm roughly **UGX 8.39M** in total inflows up to **15 Sep 2026**. If your treasurer recorded payments *after* 15 Sep 2026, tell me — we'll top those up with a second import; the importer never duplicates.

---

## STEP 1 — Supabase project and keys (you already did most of this)

You already created the project and have the two new-style keys. Here's what each is and where the URL lives:

1. **Project URL** — in the Supabase dashboard, click the gear **Project Settings** (bottom of the left sidebar) → **Data API** → copy **Project URL**. It looks like `https://abcdefgh.supabase.co`.
   - *Can't find it?* Look at your browser's address bar while the project is open: `supabase.com/dashboard/project/abcdefgh/...` — the `abcdefgh` part is your project reference, so your URL is **`https://abcdefgh.supabase.co`**.
2. **Secret key** — this is your `sb_secret_...` key (Project Settings → API Keys). It is the equivalent of the old "service_role" key: a **server secret**. You will paste it in exactly two places: the import script (Step 3) and Vercel's environment variables (Step 5). **Never** put it in the website code, and never commit it to GitHub.
3. **Publishable key** — the `sb_publishable_...` key is safe for browsers. You don't need it for this migration.
4. *(Recommended)* If your project was created in another region, that's fine — but when Vercel asks (Step 5), set **Function Region → Frankfurt (fra1)** for speed.

> **Security note:** your `sb_secret_` key was pasted into a chat/screenshot during setup. After everything works, go to **Project Settings → API Keys**, delete that key and create a new one, then update it in Vercel. Takes one minute and keeps the treasury airtight.

## STEP 2 — Create the database tables (2 minutes)

1. In Supabase, open **SQL Editor → New query**.
2. Open the file `supabase/schema.sql` from this repo, copy **all** of it, paste into the editor, press **Run**.
3. You should see "Success. No rows returned". This creates all tables, the atomic receipt-number generator (no more duplicate receipt numbers across devices), and locks direct access so **only your app's server can touch the data**.

## STEP 3 — Import the rescued data (5 minutes)

From the repo folder on your PC (GitHub Desktop → `Repository → Open in Command Prompt`), after you've merged the code files (Step 4) — or from any folder where you downloaded the repo:

**PowerShell:**
```powershell
$env:SUPABASE_URL="https://YOURPROJECT.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="sb_secret_...your secret key..."
node scripts/import-to-supabase.mjs --dir "C:\sc-basimbuzi-rescue"
```

**Command Prompt:**
```bat
set SUPABASE_URL=https://YOURPROJECT.supabase.co
set SUPABASE_SERVICE_ROLE_KEY=sb_secret_...your secret key...
node scripts/import-to-supabase.mjs --dir "C:\sc-basimbuzi-rescue"
```

The script prints every step: 275 members, 361 transactions, 4 staff logins, settings, public-site content, receipt counters. Safe to re-run — it upserts and never duplicates.

## STEP 4 — Merge the migration code into your repo (GitHub Desktop)

This is the same flow you used for the Phase 0 files:

1. Download **`basimbuzi-migration.zip`** and unzip it. It contains ~100 files (new `api/` and `lib/` folders, `supabase/schema.sql`, updated `src/` files, images, and this guide).
2. Open your repository folder in **GitHub Desktop** (`Repository → Show in Explorer`).
3. Copy the **contents** of the unzipped folder into the repository folder — overwrite when Windows asks.
4. GitHub Desktop will show all changes. Write a summary, for example: `feat: Supabase backend — one database, atomic receipts, faster images`.
5. Click **Commit to main**, then **Push origin**. Vercel will start a new deployment automatically (it will finish, but the app still needs the environment variables from Step 5 to switch on the new backend).

## STEP 5 — Connect Vercel (5 minutes)

1. Vercel → your `Basimbuzi-V1` project → **Settings → Environment Variables** → add all three:
   | Name | Value |
   |---|---|
   | `SUPABASE_URL` | your project URL (`https://abcdefgh.supabase.co`) |
   | `SUPABASE_SERVICE_ROLE_KEY` | your `sb_secret_...` key |
   | `SESSION_SECRET` | any long random text (e.g. 40+ mixed characters) |
2. **Deployments → latest → Redeploy** (so the new variables take effect).

## STEP 6 — Logins

The rescued `users.json` has all 4 staff passwords, so the importer creates every account with its **original email + password** — nobody needs a new account.

- Log in as Owner: `nagabapassion@gmail.com` with the same password as before.
- **These passwords were public on the internet before Phase 0** — after logging in, change all 4 passwords from the app's **Administrators** tab.

*Note on OTP login:* email delivery (Brevo) comes in the next phase. For now, when staff request a sign-in code, it is shown **on screen** instead of emailed. Password login is recommended.

## STEP 7 — Verify

1. Open the **Vercel site** → log in → the dashboard should show **UGX 8,385,000** in recorded inflows and **275 members**.
2. Compare against your **Google Sheets** ledger. If the treasurer recorded payments after **15 Sep 2026** that are missing, send me that export — we'll top up with a second, non-duplicating import.
3. Issue a test receipt → its number should continue your numbering series.
4. Open the public site → news/fixtures/merch images load from the database; uploaded photos come from Supabase Storage.
5. AI Studio (optional): add the same three environment variables in its project settings if you want its preview to work. AI Studio is now an experiments environment — **Vercel is production**.

---

## What changed under the hood

| Area | Before | After |
|---|---|---|
| Database | AI Studio container disk + static JSON + Sheets | **Supabase Postgres (single source of truth)** |
| Server | Express on AI Studio only; Vercel had none | Same API code runs as Vercel serverless functions (`api/`) **and** Express (`server.ts`) — identical behavior everywhere |
| Login | Passwords checked against browser cache; "system owner" bypass | Passwords verified by **Supabase Auth**; signed session tokens; inactive/removed staff locked out instantly; no passwords stored in the browser |
| Receipt numbers | Generated per-device (could collide) | **Atomic server-side numbering** — duplicates impossible |
| Images | 4.2 MB of JPGs + giant base64 strings inside JSON | **WebP (~0.6 MB total)** + uploads stored in Supabase Storage; news/hero/merch load from CDN |
| Speed | Google Apps Script cold starts (1–5 s), double round-trips, no caching | Direct queries (~100–300 ms), one bootstrap request on login, CDN caching on Vercel, PDF/chart libraries load only when used, vendor chunks cached between updates |
| Staff edits | Could exist only on one device (localStorage) | Everything saved centrally; localStorage is just an instant-paint cache |

## Google Sheets (treasurer)

Your existing Sheets keep all historical data as they are. The treasurer's live mirror will be re-connected as a scheduled (nightly) sync in the next phase — for now the Owner can download the full up-to-date ledger CSV at any time from `/api/export/ledger.csv` while logged in.

## Rollback

Everything is in git. If anything misbehaves: GitHub Desktop → **History** → revert the migration commit and push — the old Apps Script deployment is untouched.

## Troubleshooting — errors already fixed in this repo

**1. "No more than 12 Serverless Functions can be added to a Deployment on the Hobby plan"**
The first migration drop shipped one function file per endpoint (34 functions). Vercel's Hobby plan allows 12. **Fixed:** all `/api/*` traffic now flows through ONE function — `api/router.js`, generated by `npm run build` from `lib/backend/vercel-entry.ts` — via a rewrite in `vercel.json`, and a central route table (`lib/backend/router.ts`) dispatches it to the same handlers. All URLs are unchanged. When applying a fix package, **delete old `api` files first**, otherwise deleted files stay in git and still count as functions.

**2. `IMPORT FAILED: members upsert: permission denied for table members`**
On newer Supabase projects, tables created in the SQL Editor don't automatically get table privileges for the `service_role` key used by the importer/app. **Fixed:** `supabase/schema.sql` now ends with a "SERVER PRIVILEGES" section granting service_role access to all tables/sequences (idempotent — safe to re-run the whole file). If you already ran the manual GRANTs from the import session, your database is already fine; re-running the updated `schema.sql` does no harm.

**3. After importing, how do I verify the data landed?**
Supabase dashboard → **Table Editor** → pick a table and check the row count:
| Table | Expected rows |
|---|---|
| `members` | 275 |
| `transactions` | 361 |
| `app_users` | 4 |
`transactions` should total **UGX 8,385,000** (all Mobile Money, 2026-06-01 → 2026-09-15). Payments recorded after 15 Sep 2026 live in your Google Sheets — send them over and we'll top up with a second import (never duplicates).

**4. The deployment failed but the site still shows old data**
Until the push succeeds AND the three Vercel environment variables are set (Step 5), the app runs in fallback mode from the bundled static files — numbers will look wrong. The fix is always: finish the push, set the env vars, **Deployments → Redeploy**.

**5. `ERR_MODULE_NOT_FOUND: Cannot find module '/var/task/lib/backend/router' imported from '/var/task/api/router.js'` (build succeeds, every API call fails)**
Vercel compiles `api/*.ts` files one-by-one and preserves import specifiers verbatim; with ESM output Node never infers file extensions, so `../lib/backend/router` failed to resolve at runtime even though the compiled file was shipped. **Fixed:** `npm run build` now pre-bundles the entire API (via `lib/backend/vercel-entry.ts`) into a single self-contained plain-JS file `api/router.js` with zero relative imports. `api/router.ts` no longer exists in the repo — the generated bundle is git-ignored and created in the cloud by the same build command. Verified by executing the built lambda artifact locally: all 9 simulated requests answered correctly.

## Next phases (unchanged plan)

- **Brevo email** — receipt emails + OTP codes by email (the code hooks are already in place).
- **Nightly Sheets sync** for the treasurer.
