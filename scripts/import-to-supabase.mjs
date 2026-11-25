#!/usr/bin/env node
/**
 * SC Basimbuzi — one-time data importer: AI Studio export -> Supabase.
 *
 * USAGE
 *   1. Download your live data from AI Studio (file tree -> data/ folder):
 *      members.json, historical_transactions.json, users.json,
 *      public_site.json, settings.json, member_submissions.json, inquiries.json
 *      Put them in one folder, e.g. ./migration-export/
 *   2. In the same folder-less terminal, set:
 *        export SUPABASE_URL="https://YOURPROJECT.supabase.co"
 *        export SUPABASE_SERVICE_ROLE_KEY="eyJ..."   (Supabase -> Settings -> API)
 *   3. Run from the repo root:   node scripts/import-to-supabase.mjs --dir ./migration-export
 *
 * The script is idempotent (safe to re-run): it upserts by primary key.
 * It NEVER prints or stores your keys.
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const argDir = (() => {
  const i = process.argv.indexOf('--dir');
  return i !== -1 ? process.argv[i + 1] : './migration-export';
})();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables first.');
  process.exit(1);
}
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const SYSTEM_OWNER_EMAIL = 'nagabapassion@gmail.com';
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const str = (v) => (v === undefined || v === null ? '' : String(v));

function readJson(name, fallback) {
  const p = path.join(argDir, name);
  if (!fs.existsSync(p)) return fallback;
  const raw = fs.readFileSync(p, 'utf8').trim();
  if (!raw || raw === '[]' || raw === '{}') return fallback;
  try {
    const parsed = JSON.parse(raw);
    console.log(`  read ${name} (${Array.isArray(parsed) ? parsed.length + ' rows' : 'object'})`);
    return parsed;
  } catch (e) {
    console.warn(`  WARNING: ${name} is not valid JSON (${e.message}) — skipped.`);
    return fallback;
  }
}

async function upsertBatched(table, rows, chunk = 400) {
  let done = 0;
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const { error } = await db.from(table).upsert(slice, { onConflict: Object.keys(slice[0]).includes('id') ? 'id' : undefined });
    if (error) throw new Error(`${table} upsert: ${error.message}`);
    done += slice.length;
  }
  return done;
}

async function main() {
  console.log(`\n=== SC Basimbuzi importer — source: ${argDir} ===\n`);
  if (!fs.existsSync(argDir)) {
    console.error(`ERROR: folder "${argDir}" does not exist. Download your AI Studio data/ files first.`);
    process.exit(1);
  }

  // ------------------------------------------------ 1. STAFF USERS + AUTH
  const users = readJson('users.json', []);
  if (Array.isArray(users) && users.length) {
    // index existing auth users by email
    const existing = new Map();
    let page = 1;
    for (;;) {
      const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error(`listUsers: ${error.message}`);
      for (const u of data.users) existing.set(str(u.email).toLowerCase(), u);
      if (data.users.length < 200) break;
      page += 1;
    }
    for (const u of users) {
      const email = str(u.email).trim().toLowerCase();
      if (!email) continue;
      const password = str(u.password || '').trim();
      const role = ['OWNER', 'ADMIN', 'ISSUER', 'MEDIA'].includes(str(u.role).toUpperCase())
        ? str(u.role).toUpperCase()
        : (email === SYSTEM_OWNER_EMAIL ? 'OWNER' : 'ISSUER');
      let authUser = existing.get(email);
      if (!authUser) {
        const payload = { email, email_confirm: true, user_metadata: { name: str(u.name) } };
        if (password) payload.password = password;
        const { data: created, error } = await db.auth.admin.createUser(payload);
        if (error) { console.warn(`  auth create ${email}: ${error.message}`); continue; }
        authUser = created.user;
        existing.set(email, authUser);
        console.log(`  auth user created: ${email}${password ? ' (password set)' : ' (NO password — set one in Supabase Auth!)'}`);
      }
      await db.from('app_users').upsert({
        id: authUser.id,
        email,
        name: str(u.name),
        role,
        status: str(u.status).toUpperCase() === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
        permissions: u.permissions || null
      }, { onConflict: 'id' });
    }
    console.log(`  app_users synced: ${users.filter(u => str(u.email)).length}`);
  }

  // ------------------------------------------------ 2. MEMBERS
  const members = readJson('members.json', []);
  if (Array.isArray(members) && members.length) {
    const mapped = members.map((m, i) => ({
      id: str(m.id || m.memberId) || `IMP-${String(i + 1).padStart(4, '0')}`,
      name: str(m.name),
      phone: str(m.phone),
      email: str(m.email).toLowerCase(),
      address: str(m.address),
      gender: str(m.gender),
      school: str(m.school),
      house: str(m.house),
      role: str(m.role),
      status: str(m.status),
      last_payment_date: str(m.lastPaymentDate),
      total_contributed: num(m.totalContributed),
      pre_nll_paid: num(m.preNllPaid),
      spot_paid: num(m.spotPaid),
      paid_after: num(m.paidAfter),
      historical_paid: num(m.historicalPaid),
      live_paid: num(m.livePaid),
      expected_target_ugx: num(m.expectedTargetUgx),
      remaining_ugx: num(m.remainingUgx),
      dues_status: str(m.duesStatus),
      profile_status: str(m.profileStatus),
      payment_count: Math.trunc(num(m.paymentCount)),
      last_purpose: str(m.lastPurpose),
      source: str(m.source)
    }));
    const n = await upsertBatched('members', mapped);
    console.log(`  members upserted: ${n}`);
  }

  // ------------------------------------------------ 3. TRANSACTIONS
  const txs = readJson('historical_transactions.json', []);
  if (Array.isArray(txs) && txs.length) {
    const mapped = txs.map(t => ({
      receipt_number: str(t.receiptNumber),
      transaction_id: str(t.transactionId) || null,
      member_id: str(t.memberId) || null,
      type: str(t.type).toUpperCase() === 'OUTFLOW' ? 'OUTFLOW' : 'INFLOW',
      date: str(t.date),
      time: str(t.time),
      payer_name: str(t.payerName),
      payee: str(t.payee) || null,
      category: str(t.category) || null,
      voucher_number: str(t.voucherNumber) || null,
      approved_by: str(t.approvedBy) || null,
      phone: str(t.phone),
      email: str(t.email).toLowerCase(),
      amount: num(t.amount),
      payment_purpose: str(t.paymentPurpose),
      payment_method: str(t.paymentMethod),
      payment_reference: str(t.paymentReference),
      notes: str(t.notes),
      generated_by: str(t.generatedBy),
      operator_email: str(t.operatorEmail).toLowerCase(),
      payment_status: str(t.paymentStatus) || 'COMPLETED',
      email_status: str(t.emailStatus) || 'NOT_PROVIDED',
      sync_status: str(t.syncStatus) || null
    })).filter(r => r.receipt_number);
    const n = await upsertBatched('transactions', mapped);
    console.log(`  transactions upserted: ${n}`);

    // ------------------------------------------------ 4. RECEIPT COUNTERS
    // Continue numbering AFTER the highest imported receipt per prefix-year.
    const counters = new Map();
    for (const r of mapped) {
      const m = /^([A-Z]+)-(\d{4})-(\d+)$/.exec(r.receipt_number);
      if (!m) continue;
      const scope = `${m[1]}-${m[2]}`;
      const seq = parseInt(m[3], 10);
      if (!counters.has(scope) || counters.get(scope) < seq) counters.set(scope, seq);
    }
    for (const [scope, seq] of counters) {
      const { error } = await db.from('receipt_counters').upsert({ scope, last_seq: seq });
      if (error) console.warn(`  counter ${scope}: ${error.message}`);
      else console.log(`  receipt counter ${scope} -> ${String(seq).padStart(5, '0')}`);
    }
  }

  // ------------------------------------------------ 5. SETTINGS
  const settings = readJson('settings.json', null);
  if (settings && typeof settings === 'object') {
    const { error } = await db.from('settings').upsert({ id: 1, data: settings, updated_by: 'import-script' }, { onConflict: 'id' });
    if (error) console.warn(`  settings: ${error.message}`);
    else console.log('  settings row written');
  }

  // ------------------------------------------------ 6. PUBLIC SITE (images -> Storage)
  const site = readJson('public_site.json', null);
  if (site && typeof site === 'object') {
    const uploaded = new Map();
    const dataUrls = [];

    const collect = (obj, cb) => {
      if (Array.isArray(obj)) obj.forEach(v => collect(v, cb));
      else if (obj && typeof obj === 'object') Object.values(obj).forEach(v => collect(v, cb));
      else if (typeof obj === 'string' && obj.startsWith('data:image/')) cb(obj);
    };
    collect(site, (u) => { if (!dataUrls.includes(u)) dataUrls.push(u); });

    for (const [idx, dataUrl] of dataUrls.entries()) {
      try {
        const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
        if (!m) continue;
        const ext = m[1].split('/')[1].replace('jpeg', 'jpg');
        const bytes = Buffer.from(m[2], 'base64');
        const objectPath = `import/${Date.now()}-${idx + 1}.${ext}`;
        const { error } = await db.storage.from('site-media').upload(objectPath, bytes, { contentType: m[1], upsert: false });
        if (error) throw new Error(error.message);
        const { data } = db.storage.from('site-media').getPublicUrl(objectPath);
        uploaded.set(dataUrl, data.publicUrl);
        console.log(`  image #${idx + 1} (${(bytes.length / 1024).toFixed(0)} KB) -> Storage`);
      } catch (e) {
        console.warn(`  image #${idx + 1} upload failed: ${e.message} (kept as data URL)`);
      }
    }
    if (uploaded.size) {
      const rewrite = (obj) => {
        if (Array.isArray(obj)) return obj.map(rewrite);
        if (obj && typeof obj === 'object') {
          const out = {};
          for (const [k, v] of Object.entries(obj)) out[k] = typeof v === 'string' && uploaded.has(v) ? uploaded.get(v) : rewrite(v);
          return out;
        }
        return obj;
      };
      var siteToStore = rewrite(site);
    }
    const content = siteToStore || site;
    const { error } = await db.from('site_content').upsert({
      id: 1,
      content,
      updated_at: new Date().toISOString(),
      updated_by: 'import-script'
    }, { onConflict: 'id' });
    if (error) console.warn(`  site_content: ${error.message}`);
    else console.log(`  public site content written${uploaded.size ? ` (${uploaded.size} images moved to Storage)` : ''}`);
  }

  // ------------------------------------------------ 7. MEMBER SUBMISSIONS + INQUIRIES
  const subs = readJson('member_submissions.json', []);
  if (Array.isArray(subs) && subs.length) {
    const mapped = subs.map(s => ({
      id: str(s.id) || crypto.randomUUID(),
      member_id: str(s.memberId),
      member_name: str(s.memberName),
      submitted_name: str(s.submittedName),
      submitted_email: str(s.submittedEmail).toLowerCase(),
      submitted_phone: str(s.submittedPhone),
      submitted_address: str(s.submittedAddress),
      submitted_gender: str(s.submittedGender),
      submitted_school: str(s.submittedSchool),
      submitted_house: str(s.submittedHouse),
      pre_nll_paid: num(s.preNllPaid),
      spot_paid: num(s.spotPaid),
      paid_after: num(s.paidAfter),
      total_paid: num(s.totalPaid),
      submitted_at: s.submittedAt ? new Date(s.submittedAt).toISOString() : new Date().toISOString(),
      status: str(s.status) || 'PENDING',
      reviewed_by: str(s.reviewedBy) || null,
      reviewed_at: s.reviewedAt ? new Date(s.reviewedAt).toISOString() : null,
      review_notes: str(s.reviewNotes) || null
    }));
    const n = await upsertBatched('member_submissions', mapped);
    console.log(`  member submissions upserted: ${n}`);
  }

  const inquiries = readJson('inquiries.json', []);
  if (Array.isArray(inquiries) && inquiries.length) {
    const mapped = inquiries.map(q => ({
      id: str(q.id) || crypto.randomUUID(),
      full_name: str(q.fullName),
      phone: str(q.phone),
      email: str(q.email).toLowerCase(),
      interest: str(q.interest) || 'General',
      message: str(q.message),
      status: str(q.status) || 'NEW',
      created_at: q.createdAt ? new Date(q.createdAt).toISOString() : new Date().toISOString()
    }));
    const n = await upsertBatched('inquiries', mapped);
    console.log(`  inquiries upserted: ${n}`);
  }

  console.log('\nDONE. Next: start the app, log in as the Owner, and confirm the dashboard totals.');
  console.log('Remember: the receipt numbering continued automatically from your imported history.\n');
}

main().catch(e => { console.error('IMPORT FAILED:', e.message); process.exit(1); });
