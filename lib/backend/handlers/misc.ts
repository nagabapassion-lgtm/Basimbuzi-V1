import { getDb } from '../db';
import { isBackendConfigured } from '../env';
import { requireStaff } from '../auth';
import {
  getSettings,
  isPlaceholderMemberEmail,
  logAudit,
  nowDateStr,
  nowTimeStr
} from '../store';
import { mapAuditRow, mapTxRow, mapUserRow } from '../map';
import { compareTransactions, computeLedgerMetrics } from '../../../src/utils/ledgerReconciliation';
import { csvEscapeSafe } from '../../../src/utils/memberImport';
import { fail, ok, errorResult } from '../types';
import type { HandlerCtx, HandlerResult } from '../types';

// GET /api/health
// Always answers (never throws, never hangs): this endpoint is the app's
// connection diagnostic, so it must produce a readable result even when the
// database is unreachable. `status` tells you exactly what is wrong:
//   ok           — function + database both working
//   unconfigured — the Vercel environment variables are missing
//   unavailable  — env vars set, but one or more database layers failed
// The `checks` object reports each layer separately, so a single look shows
// exactly which piece (project ref, auth service, individual table, owner
// profile) is failing — including INTERMITTENT failures, because the failing
// probe is named in the response instead of being swallowed by one summary.
export const health = async (_ctx: HandlerCtx): Promise<HandlerResult> => {
  const timestamp = new Date().toISOString();
  if (!isBackendConfigured()) {
    return ok({
      success: true,
      status: 'unconfigured',
      message:
        'The function is running, but the database environment variables are NOT set. In Vercel → your project → Settings → Environment Variables, add SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SESSION_SECRET, then Deployments → Redeploy.',
      timestamp
    });
  }

  const url = process.env.SUPABASE_URL || '';
  const projectRef = (url.replace(/^https?:\/\//, '').split('.')[0] || '').slice(0, 30);
  const db = getDb();
  const checks: Record<string, unknown> = { projectRef };
  const failures: string[] = [];
  // Each probe is capped so a dead/slow database cannot exceed the function's
  // own 8.5s invocation safety net (supabase-js retries failed fetches, which
  // would otherwise burn the whole budget). Probes run in parallel: worst
  // case wall time ≈ PROBE_TIMEOUT_MS, not the sum.
  const PROBE_TIMEOUT_MS = 3_000;
  const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no response within ${ms}ms`)), ms);
      p.then(
        v => {
          clearTimeout(timer);
          resolve(v);
        },
        e => {
          clearTimeout(timer);
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      );
    });
  const probe = (name: string, work: () => Promise<void>) =>
    (async () => {
      try {
        await withTimeout(work(), PROBE_TIMEOUT_MS);
        checks[name] = 'ok';
      } catch (err) {
        checks[name] = err instanceof Error ? err.message : String(err);
        failures.push(name);
      }
    })();

  await Promise.all([
    probe('table_settings', async () => {
      const { error } = await db.from('settings').select('id').limit(1);
      if (error) throw new Error(error.message);
    }),
    probe('table_app_users', async () => {
      const { error, count } = await db
        .from('app_users')
        .select('id', { count: 'exact', head: true });
      if (error) throw new Error(error.message);
      checks.appUsersCount = count ?? null;
      const { data: owner, error: ownerErr } = await db
        .from('app_users')
        .select('email, role, status')
        .eq('email', 'nagabapassion@gmail.com')
        .maybeSingle();
      if (ownerErr) throw new Error(ownerErr.message);
      checks.ownerProfile = owner
        ? `${owner.role}/${owner.status}`
        : 'MISSING (owner row not in app_users)';
    }),
    probe('table_members', async () => {
      const { error, count } = await db.from('members').select('id', { count: 'exact', head: true });
      if (error) throw new Error(error.message);
      checks.membersCount = count ?? null;
    }),
    probe('table_transactions', async () => {
      const { error, count } = await db
        .from('transactions')
        .select('receipt_number', { count: 'exact', head: true });
      if (error) throw new Error(error.message);
      checks.transactionsCount = count ?? null;
    }),
    probe('auth_service', async () => {
      const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
      if (error) throw new Error(error.message);
      const emails = (data?.users || []).map((u: { email?: string }) =>
        String(u.email || '').toLowerCase()
      );
      checks.authUsersCount = emails.length;
      checks.staffAccountsPresent = {
        'nagabapassion@gmail.com': emails.includes('nagabapassion@gmail.com'),
        'jotham.itungo@gmail.com': emails.includes('jotham.itungo@gmail.com'),
        'passionwork94@gmail.com': emails.includes('passionwork94@gmail.com'),
        'hildanamy7@gmail.com': emails.includes('hildanamy7@gmail.com')
      };
    })
  ]);

  return ok({
    success: true,
    status: failures.length === 0 ? 'ok' : 'unavailable',
    message:
      failures.length === 0
        ? 'Central database connected — all layers healthy.'
        : `Failing layer(s): ${failures.join(', ')}. Details in "checks".`,
    checks,
    timestamp
  });
};

// GET /api/bootstrap — everything the staff dashboard needs on first paint
export const bootstrap = async (ctx: HandlerCtx): Promise<HandlerResult> => {
  try {
    const auth = await requireStaff(ctx);
    if (auth.ok === false) return auth.response;

    const [settings, txRows, userRows, auditRows] = await Promise.all([
      getSettings(),
      getDb().from('transactions').select('*').limit(20000),
      getDb()
        .from('app_users')
        .select('id, name, email, role, status, permissions, created_at')
        .order('created_at', { ascending: true }),
      getDb().from('audit_log').select('*').order('id', { ascending: false }).limit(500)
    ]);

    const transactions = [];
    for (const row of txRows.data || []) {
      const tx = mapTxRow(row);
      if (tx.email && (await isPlaceholderMemberEmail(tx.email, tx.payerName))) {
        tx.email = '';
        tx.emailStatus = 'NOT_PROVIDED';
      }
      transactions.push(tx);
    }
    transactions.sort((a, b) => compareTransactions(a, b, 'desc'));

    return ok({
      success: true,
      data: {
        settings,
        transactions,
        users: (userRows.data || []).map(mapUserRow),
        auditLogs: (auditRows.data || []).map(mapAuditRow)
      }
    });
  } catch (err) {
    return errorResult(err);
  }
};

// GET /api/audit — latest 500 entries
export const listAudit = async (ctx: HandlerCtx): Promise<HandlerResult> => {
  try {
    const auth = await requireStaff(ctx);
    if (auth.ok === false) return auth.response;

    const { data, error } = await getDb()
      .from('audit_log')
      .select('*')
      .order('id', { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    return ok({ success: true, data: (data || []).map(mapAuditRow) });
  } catch (err) {
    return errorResult(err);
  }
};

// POST /api/audit {action, description, receiptNumber?, transactionId?, user:{name,email}}
export const addAudit = async (ctx: HandlerCtx): Promise<HandlerResult> => {
  try {
    const auth = await requireStaff(ctx);
    if (auth.ok === false) return auth.response;

    const body = ctx.body || {};
    const userName = String(body.user?.name || auth.user.name || 'System').trim().slice(0, 100);
    const userEmail = String(
      body.user?.email || auth.user.email || ''
    )
      .trim()
      .toLowerCase()
      .slice(0, 120);

    await logAudit({
      user: userName,
      userEmail,
      action: String(body.action || 'SYSTEM_INITIALIZE').trim().slice(0, 60),
      receiptNumber: body.receiptNumber ? String(body.receiptNumber).slice(0, 60) : undefined,
      transactionId: body.transactionId ? String(body.transactionId).slice(0, 80) : undefined,
      description: String(body.description || '').slice(0, 500)
    });

    return ok({ success: true });
  } catch (err) {
    return errorResult(err);
  }
};

// GET /api/export/ledger.csv
export const exportLedgerCsv = async (ctx: HandlerCtx): Promise<HandlerResult> => {
  try {
    const auth = await requireStaff(ctx);
    if (auth.ok === false) return auth.response;
    const user = auth.user;
    if (!(user.role === 'OWNER' || user.role === 'ADMIN' || user.permissions.canViewReports)) {
      return fail(403, {
        success: false,
        error: 'Unauthorized: Exporting the ledger requires the canViewReports permission.'
      });
    }

    const { data, error } = await getDb().from('transactions').select('*').limit(20000);
    if (error) throw new Error(error.message);

    const list = (data || []).map(mapTxRow).sort((a, b) => compareTransactions(a, b, 'asc'));
    const header = [
      'Receipt',
      'Type',
      'Date',
      'Time',
      'Name',
      'Phone',
      'Email',
      'Category/Purpose',
      'Method',
      'Reference',
      'Amount UGX',
      'Status',
      'Generated By'
    ];
    const lines = [header.map(csvEscapeSafe).join(',')];
    for (const tx of list) {
      lines.push(
        [
          tx.receiptNumber,
          String(tx.type || 'INFLOW'),
          tx.date,
          tx.time,
          tx.payerName,
          tx.phone,
          tx.email,
          tx.paymentPurpose || tx.category || '',
          tx.paymentMethod,
          tx.paymentReference,
          String(tx.amount),
          tx.paymentStatus,
          tx.generatedBy
        ]
          .map(csvEscapeSafe)
          .join(',')
      );
    }

    const csv = `\uFEFF${lines.join('\r\n')}`;
    return {
      status: 200,
      body: csv,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="sc-basimbuzi-ledger.csv"',
        'Cache-Control': 'no-store'
      }
    };
  } catch (err) {
    return errorResult(err);
  }
};

// Ledger metrics helper reused by serverless reporting wrappers if needed.
export const ledgerMetricsFor = (rows: any[], openingBalance: number) =>
  computeLedgerMetrics(
    rows.map(r => ({
      receiptNumber: r.receiptNumber,
      type: r.type,
      amount: r.amount,
      paymentStatus: r.paymentStatus,
      syncStatus: r.syncStatus
    })),
    openingBalance
  );

export const auditTimestamps = () => ({ date: nowDateStr(), time: nowTimeStr() });
