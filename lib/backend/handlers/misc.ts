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
//   unavailable  — env vars set, but the database did not respond
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
  try {
    const { error } = await getDb().from('settings').select('id').limit(1);
    if (error) throw new Error(error.message);
    return ok({
      success: true,
      status: 'ok',
      message: 'Central database connected',
      timestamp
    });
  } catch (err) {
    return ok({
      success: true,
      status: 'unavailable',
      message:
        'The function is running and the environment variables are set, but the database did not respond. Check that the Supabase project is active (not paused) and that SUPABASE_URL is exactly your project URL.',
      error: err instanceof Error ? err.message : String(err),
      timestamp
    });
  }
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
