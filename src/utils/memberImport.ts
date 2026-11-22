import { DuesStatus, Member, MembershipTier, Transaction } from '../types';
import { cleanPhoneNumber, isStaffOrPlaceholderEmail } from './ledgerReconciliation';

export interface ParsedTreasuryCsvResult {
  members: Member[];
  historicalTransactions: Transaction[];
  summary: {
    memberCount: number;
    preNllSum: number;
    spotSum: number;
    paidAfterSum: number;
    totalSum: number;
    reportedGrandTotal: number;
    reconciliationAdjustmentSum: number;
    skippedRows: number;
    warnings: string[];
  };
}

const VALID_TIERS = new Set<MembershipTier>(['Supporter', 'Player', 'Executive', 'Academy', 'Other']);

export function normalizeMembershipTier(raw: unknown): MembershipTier {
  const clean = String(raw || '').trim();
  if (!clean) return 'Supporter';
  const match = Array.from(VALID_TIERS).find(t => t.toLowerCase() === clean.toLowerCase());
  return match || 'Supporter';
}

export function parseUgxAmount(raw: unknown): number {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 0;
  }
  const str = String(raw || '').trim();
  if (!str || str === '—' || str === '-' || str === '--') return 0;
  const numeric = str.replace(/[^0-9.-]/g, '');
  const parsed = Number(numeric);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}

/**
 * RFC-4180 quote-aware CSV parser that supports embedded newlines inside quoted cells,
 * commas inside quoted currency values ("50,000"), and CRLF/LF line endings.
 */
export function parseRfc4180Csv(csvText: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const text = csvText.replace(/^\uFEFF/, ''); // strip UTF-8 BOM if present

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field.trim());
      field = '';
    } else if (ch === '\r') {
      if (text[i + 1] === '\n') i++;
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = '';
    } else if (ch === '\n') {
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    rows.push(row);
  }

  return rows.filter(r => r.some(cell => cell !== ''));
}

export function computeDuesStatus(totalPaid: number, targetUgx: number): DuesStatus {
  if (targetUgx > 0 && totalPaid >= targetUgx) return 'Paid';
  if (totalPaid > 0) return 'Partial';
  return 'Overdue';
}

export function isMemberProfileComplete(member: Partial<Member>): boolean {
  const name = String(member.name || '').trim();
  const phone = cleanPhoneNumber(member.phone || '');
  const address = String(member.address || '').trim();
  const hasValidEmail = !isStaffOrPlaceholderEmail(member.email, name);
  return name.length >= 2 && hasValidEmail && phone.length >= 7 && address.length >= 2;
}

function makeMemberId(index: number): string {
  return `SB-M-${String(index).padStart(4, '0')}`;
}

export function parseTreasuryMembersCsv(
  csvText: string,
  options?: { defaultTargetUgx?: number; sourceReference?: string }
): ParsedTreasuryCsvResult {
  const defaultTargetUgx = Math.max(0, Number(options?.defaultTargetUgx ?? 100000));
  const sourceRef = options?.sourceReference || '0771254454 - Barigye Samson';
  const rows = parseRfc4180Csv(csvText);

  if (rows.length === 0) {
    return {
      members: [],
      historicalTransactions: [],
      summary: {
        memberCount: 0,
        preNllSum: 0,
        spotSum: 0,
        paidAfterSum: 0,
        totalSum: 0,
        reportedGrandTotal: 0,
        reconciliationAdjustmentSum: 0,
        skippedRows: 0,
        warnings: ['CSV file is empty.']
      }
    };
  }

  // Locate header row cleanly (works for Mission NLL report AND clean member directory CSVs)
  let headerRowIdx = -1;
  let colMap = {
    index: -1,
    name: -1,
    preNll: -1,
    spot: -1,
    paidAfter: -1,
    totalPaid: -1,
    phone: -1,
    email: -1,
    address: -1,
    tier: -1
  };

  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const normalized = rows[i].map(c => c.replace(/\s+/g, ' ').trim().toUpperCase());
    const nameIdx = normalized.findIndex(c => c === 'NAME' || c === 'FULL NAME' || c === 'MEMBER NAME');
    if (nameIdx !== -1) {
      headerRowIdx = i;
      colMap.index = normalized.findIndex(c => c === '#' || c === 'NO' || c === 'ID');
      colMap.name = nameIdx;
      colMap.preNll = normalized.findIndex(c => c.includes('PRE-NLL') || c.includes('PRE NLL'));
      colMap.spot = normalized.findIndex(c => c.includes('SPOT PAID') || c === 'SPOT');
      colMap.paidAfter = normalized.findIndex(c => c.includes('PAID AFTER'));
      colMap.totalPaid = normalized.findIndex(c => c.includes('TOTAL PAID') || c === 'TOTAL');
      colMap.phone = normalized.findIndex(c => c.includes('PHONE') || c.includes('WHATSAPP') || c.includes('TEL'));
      colMap.email = normalized.findIndex(c => c.includes('EMAIL'));
      colMap.address = normalized.findIndex(c => c.includes('ADDRESS') || c.includes('RESIDENCE') || c.includes('LOCATION'));
      colMap.tier = normalized.findIndex(c => c.includes('TIER') || c.includes('MEMBERSHIP'));
      break;
    }
  }

  if (headerRowIdx === -1) {
    return {
      members: [],
      historicalTransactions: [],
      summary: {
        memberCount: 0,
        preNllSum: 0,
        spotSum: 0,
        paidAfterSum: 0,
        totalSum: 0,
        reportedGrandTotal: 0,
        reconciliationAdjustmentSum: 0,
        skippedRows: rows.length,
        warnings: ['Could not find a header row containing a NAME column.']
      }
    };
  }

  const members: Member[] = [];
  const historicalTransactions: Transaction[] = [];
  const warnings: string[] = [];

  let preNllSum = 0;
  let spotSum = 0;
  let paidAfterSum = 0;
  let totalSum = 0;
  let reportedGrandTotal = 0;
  let reconciliationAdjustmentSum = 0;
  let skippedRows = 0;
  const nowIso = new Date().toISOString();

  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    const rawIndex = colMap.index >= 0 ? String(row[colMap.index] || '').trim() : '';
    const rawName = colMap.name >= 0 ? String(row[colMap.name] || '').trim() : '';
    const upperIndex = rawIndex.toUpperCase();
    const upperName = rawName.toUpperCase();

    // Capture and skip GRAND TOTAL summary footer row without counting it as a member
    if (
      upperIndex.includes('GRAND TOTAL') ||
      upperName.includes('GRAND TOTAL') ||
      upperIndex === 'TOTAL' ||
      upperName === 'TOTAL'
    ) {
      if (colMap.totalPaid >= 0) {
        reportedGrandTotal = parseUgxAmount(row[colMap.totalPaid]);
      }
      skippedRows++;
      continue;
    }

    if (!rawName) {
      skippedRows++;
      continue;
    }

    const preNll = colMap.preNll >= 0 ? parseUgxAmount(row[colMap.preNll]) : 0;
    const spot = colMap.spot >= 0 ? parseUgxAmount(row[colMap.spot]) : 0;
    const paidAfter = colMap.paidAfter >= 0 ? parseUgxAmount(row[colMap.paidAfter]) : 0;
    const rawTotal = colMap.totalPaid >= 0 ? parseUgxAmount(row[colMap.totalPaid]) : 0;
    const componentSum = preNll + spot + paidAfter;
    const effectiveTotal = rawTotal > 0 ? rawTotal : componentSum;

    const memberSeq = members.length + 1;
    const memberId = makeMemberId(memberSeq);

    const phone = colMap.phone >= 0 ? cleanPhoneNumber(row[colMap.phone]) : '';
    const rawEmail = colMap.email >= 0 ? String(row[colMap.email] || '').trim().toLowerCase() : '';
    const email = isStaffOrPlaceholderEmail(rawEmail, rawName) ? '' : rawEmail;
    const address = colMap.address >= 0 ? String(row[colMap.address] || '').trim() : '';
    const tier = colMap.tier >= 0 ? normalizeMembershipTier(row[colMap.tier]) : 'Supporter';

    const profileComplete = isMemberProfileComplete({ name: rawName, email, phone, address });
    const remainingUgx = defaultTargetUgx > 0 ? Math.max(0, defaultTargetUgx - effectiveTotal) : 0;

    const member: Member = {
      id: memberId,
      memberId,
      name: rawName,
      phone,
      email,
      address,
      tier,
      preNllPaid: preNll,
      spotPaid: spot,
      paidAfter,
      historicalPaid: effectiveTotal,
      livePaid: 0,
      totalContributed: effectiveTotal,
      expectedTargetUgx: defaultTargetUgx,
      remainingUgx,
      duesStatus: computeDuesStatus(effectiveTotal, defaultTargetUgx),
      profileStatus: profileComplete ? 'COMPLETE' : 'INCOMPLETE',
      paymentCount: (preNll > 0 ? 1 : 0) + (spot > 0 ? 1 : 0) + (paidAfter > 0 ? 1 : 0),
      lastPaymentDate: paidAfter > 0 ? '2026-09-15' : spot > 0 ? '2026-08-01' : preNll > 0 ? '2026-06-01' : '',
      lastPurpose: paidAfter > 0
        ? 'Mission NLL XVII — Paid After'
        : spot > 0
        ? 'Mission NLL XVII — Spot Paid'
        : preNll > 0
        ? 'Mission NLL XVII — Pre-NLL'
        : 'Mission NLL XVII',
      source: 'CSV_IMPORT',
      createdAt: nowIso,
      updatedAt: nowIso
    };

    members.push(member);

    preNllSum += preNll;
    spotSum += spot;
    paidAfterSum += paidAfter;
    totalSum += effectiveTotal;

    const baseReceiptSlug = `HIST-NLL17-${String(memberSeq).padStart(4, '0')}`;
    const addHistTx = (suffix: string, amount: number, date: string, purpose: string, notes: string) => {
      if (amount <= 0) return;
      const receiptNumber = `${baseReceiptSlug}-${suffix}`;
      historicalTransactions.push({
        receiptNumber,
        transactionId: receiptNumber,
        memberId,
        type: 'INFLOW',
        date,
        time: '12:00:00',
        payerName: rawName,
        phone,
        email,
        amount,
        paymentPurpose: purpose,
        paymentMethod: 'Mobile Money',
        paymentReference: sourceRef,
        notes,
        generatedBy: 'Treasury Historical Import',
        operatorEmail: 'nagabapassion@gmail.com',
        paymentStatus: 'COMPLETED',
        emailStatus: email ? 'SKIPPED' : 'NOT_PROVIDED',
        syncStatus: 'PENDING',
        createdAt: `${date}T12:00:00.000Z`
      });
    };

    addHistTx('PRE', preNll, '2026-06-01', 'Mission NLL XVII — Pre-NLL', `Historical treasury import (#${rawIndex || memberSeq})`);
    addHistTx('SPOT', spot, '2026-08-01', 'Mission NLL XVII — Spot Paid', `NLL Ph1 Wks 1-6 + Ph2 Wks 1-3 (#${rawIndex || memberSeq})`);
    addHistTx('AFTER', paidAfter, '2026-09-15', 'Mission NLL XVII — Paid After', `Post-NLL collection (#${rawIndex || memberSeq})`);

    if (effectiveTotal !== componentSum) {
      const diff = effectiveTotal - componentSum;
      if (diff > 0) {
        reconciliationAdjustmentSum += diff;
        addHistTx(
          'ADJ',
          diff,
          '2026-09-20',
          'Mission NLL XVII — Treasury Adjustment',
          `Reconciled difference between reported row total (${effectiveTotal.toLocaleString()}) and phase columns (${componentSum.toLocaleString()})`
        );
      } else {
        warnings.push(
          `Row "${rawName}": phase columns sum (${componentSum.toLocaleString()}) exceeded row Total Paid (${effectiveTotal.toLocaleString()}).`
        );
      }
    }
  }

  return {
    members,
    historicalTransactions,
    summary: {
      memberCount: members.length,
      preNllSum,
      spotSum,
      paidAfterSum,
      totalSum,
      reportedGrandTotal,
      reconciliationAdjustmentSum,
      skippedRows,
      warnings
    }
  };
}

/**
 * Neutralize spreadsheet formula prefixes (=, +, -, @, tab, CR) when exporting CSV for Excel/Sheets.
 */
export function csvEscapeSafe(value: unknown): string {
  let str = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
