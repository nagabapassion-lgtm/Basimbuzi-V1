import crypto from 'crypto';
import { getDb } from '../db';
import { requireStaff } from '../auth';
import {
  getSettings,
  isPlaceholderMemberEmail,
  logAudit,
  nextReceiptNumber,
  nowDateStr,
  nowTimeStr,
  sanitizeIncomingTx
} from '../store';
import { mapTxRow } from '../map';
import { compareTransactions } from '../../../src/utils/ledgerReconciliation';
import { fail, ok, errorResult, getParam } from '../types';
import type { HandlerCtx, HandlerResult, StaffUser } from '../types';

const canIssue = (user: StaffUser): boolean =>
  user.role === 'OWNER' || user.role === 'ADMIN' || user.role === 'ISSUER' || user.permissions.canIssueReceipts;

const canDelete = (user: StaffUser): boolean =>
  user.role === 'OWNER' || user.permissions.canDeleteTransactions;

const fetchAllTxRows = async () => {
  const { data, error } = await getDb()
    .from('transactions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20000);
  if (error) throw new Error(error.message);
  return data || [];
};

/** Strips staff/placeholder emails + cleans phones on the way out (legacy rule). */
const sanitizeTxForClient = async (row: any) => {
  const tx = mapTxRow(row);
  if (tx.email && (await isPlaceholderMemberEmail(tx.email, tx.payerName))) {
    tx.email = '';
    tx.emailStatus = 'NOT_PROVIDED';
  }
  return tx;
};

// GET /api/historical-transactions — full central ledger
export const historicalTransactions = async (ctx: HandlerCtx): Promise<HandlerResult> => {
  try {
    const auth = await requireStaff(ctx);
    if (auth.ok === false) return auth.response;
    void ctx.headers['x-operator-email']; // logging only

    const rows = await fetchAllTxRows();
    const list = [];
    for (const row of rows) {
      list.push(await sanitizeTxForClient(row));
    }
    list.sort((a, b) => compareTransactions(a, b, 'desc'));

    return ok({
      success: true,
      data: list,
      coveredGasReceipts: [] // all rows now live centrally — nothing is double-covered
    });
  } catch (err) {
    return errorResult(err);
  }
};

// POST /api/transactions — generate receipt / record expense voucher
export const createTransaction = async (ctx: HandlerCtx): Promise<HandlerResult> => {
  try {
    const auth = await requireStaff(ctx);
    if (auth.ok === false) return auth.response;
    const user = auth.user;
    if (!canIssue(user)) {
      return fail(403, {
        success: false,
        error: 'ACCESS DENIED: Receipt issuing requires the canIssueReceipts permission.'
      });
    }

    const body = ctx.body || {};
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return fail(400, { success: false, error: 'Please provide a valid payment amount.' });
    }
    const type = String(body.type || 'INFLOW').toUpperCase() === 'OUTFLOW' ? 'OUTFLOW' : 'INFLOW';
    const name = String((type === 'OUTFLOW' ? body.payee || body.payerName : body.payerName) || '').trim();
    if (name.length < 2) {
      return fail(400, {
        success: false,
        error: type === 'OUTFLOW' ? 'Payee name is required.' : 'Payer name is required.'
      });
    }

    const row = await sanitizeIncomingTx({
      ...body,
      type,
      operatorEmail: user.email, // token identity wins; body operatorEmail is logging-only
      operatorName: String(body.operatorName || user.name || '').trim()
    });

    const settings = await getSettings();
    const year = nowDateStr().slice(0, 4);
    const prefix = String(settings.receiptPrefix || 'SB').trim().toUpperCase() || 'SB';
    const scope = type === 'OUTFLOW' ? `EXP-${year}` : `${prefix}-${year}`;

    const insertRow = {
      receipt_number: await nextReceiptNumber(scope),
      transaction_id: crypto.randomUUID(),
      ...row
    };

    let inserted;
    const first = await getDb().from('transactions').insert(insertRow).select().single();
    if (first.error && (first.error as any).code === '23505') {
      // Duplicate receipt number (race with another issuer) — retry numbering once.
      insertRow.receipt_number = await nextReceiptNumber(scope);
      const retry = await getDb()
        .from('transactions')
        .insert({ ...insertRow, receipt_number: insertRow.receipt_number })
        .select()
        .single();
      if (retry.error) throw new Error(retry.error.message);
      inserted = retry.data;
    } else if (first.error) {
      throw new Error(first.error.message);
    } else {
      inserted = first.data;
    }

    const tx = mapTxRow(inserted);
    await logAudit({
      user: user.name,
      userEmail: user.email,
      action: type === 'OUTFLOW' ? 'OUTFLOW_CREATED' : 'INFLOW_CREATED',
      receiptNumber: tx.receiptNumber,
      transactionId: tx.transactionId,
      description:
        type === 'OUTFLOW'
          ? `${user.name} recorded expense voucher ${tx.receiptNumber} of ${tx.amount.toLocaleString()} UGX to ${tx.payerName}.`
          : `${user.name} generated receipt ${tx.receiptNumber} for ${tx.payerName} (${tx.amount.toLocaleString()} UGX).`
    });

    return ok({
      success: true,
      data: tx,
      message:
        type === 'OUTFLOW'
          ? `Expense voucher ${tx.receiptNumber} recorded successfully.`
          : `Receipt ${tx.receiptNumber} generated successfully.`
    });
  } catch (err) {
    return errorResult(err);
  }
};

// DELETE /api/transactions/:receiptNumber
export const deleteTransaction = async (ctx: HandlerCtx): Promise<HandlerResult> => {
  try {
    const auth = await requireStaff(ctx);
    if (auth.ok === false) return auth.response;
    const user = auth.user;
    if (!canDelete(user)) {
      return fail(403, {
        success: false,
        error: 'Permission denied. Cannot delete transactions.'
      });
    }

    const receipt = getParam(ctx, 'receiptNumber', 'receipt').trim().toUpperCase();
    if (!receipt) {
      return fail(400, { success: false, error: 'Receipt number is required.' });
    }

    const deleted = await getDb()
      .from('transactions')
      .delete()
      .eq('receipt_number', receipt)
      .select()
      .single();

    if (deleted.error || !deleted.data) {
      return fail(404, { success: false, error: `Receipt ${receipt} not found.` });
    }

    await logAudit({
      user: user.name,
      userEmail: user.email,
      action: 'DELETE_TRANSACTION',
      receiptNumber: receipt,
      description: `${user.name} deleted transaction ${receipt}.`
    });

    return ok({ success: true, message: `Receipt ${receipt} deleted.` });
  } catch (err) {
    return errorResult(err);
  }
};

// POST /api/transactions/:receiptNumber/resend
export const resendReceipt = async (ctx: HandlerCtx): Promise<HandlerResult> => {
  try {
    const auth = await requireStaff(ctx);
    if (auth.ok === false) return auth.response;
    const user = auth.user;

    const receipt = getParam(ctx, 'receiptNumber', 'receipt').trim().toUpperCase();
    const { data: row, error } = await getDb()
      .from('transactions')
      .select('*')
      .eq('receipt_number', receipt)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) {
      return fail(404, { success: false, error: `Receipt ${receipt} not found.` });
    }

    const tx = await sanitizeTxForClient(row);
    if (!tx.email) {
      return fail(400, {
        success: false,
        error: 'No email address was provided on this receipt. Share it on WhatsApp instead.'
      });
    }

    const { data: updated, error: updateErr } = await getDb()
      .from('transactions')
      .update({ email_status: 'PENDING' })
      .eq('receipt_number', receipt)
      .select()
      .single();
    if (updateErr) throw new Error(updateErr.message);

    await logAudit({
      user: user.name,
      userEmail: user.email,
      action: 'RESEND_RECEIPT',
      receiptNumber: receipt,
      description: `${user.name} queued email re-delivery for receipt ${receipt}.`
    });

    return ok({
      success: true,
      data: mapTxRow(updated),
      message: `Email delivery is queued — Brevo integration pending. Receipt ${receipt} is ready to share on WhatsApp.`
    });
  } catch (err) {
    return errorResult(err);
  }
};
