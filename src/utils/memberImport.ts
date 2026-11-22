import { DuesStatus, Member, MemberGender, MemberSchoolPreset, Transaction } from '../types';
import {
  cleanPhoneNumber,
  isStaffOrPlaceholderEmail,
  normalizePersonName,
  resolveCanonicalMemberNameKey
} from './ledgerReconciliation';

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

export const NTARE_SCHOOL = 'Ntare School' as const;
export const BWERANYAGYI_SCHOOL = "Bweranyagyi Girls' Secondary School" as const;
export const GENDER_OPTIONS: readonly MemberGender[] = ['Male', 'Female'];
export const SCHOOL_PRESET_OPTIONS: readonly MemberSchoolPreset[] = [
  NTARE_SCHOOL,
  BWERANYAGYI_SCHOOL,
  'Other'
];
export const HOUSE_OPTIONS = [
  'Africa House',
  'Aggrey House',
  'Bangizi Jed',
  'Crichton House',
  'Golden House',
  'Kamugungunu',
  'Mbaguta House',
  'New House',
  'Nile House',
  'Pearl House',
  'Pioneer House'
] as const;

export type MemberHouseOption = (typeof HOUSE_OPTIONS)[number];

export function isHouseEligibleSchool(school?: unknown): boolean {
  const clean = String(school || '').trim().toLowerCase().replace(/[\u2018\u2019`]/g, "'");
  if (!clean) return false;
  return (
    clean === 'ntare school' ||
    clean === 'ntare' ||
    clean === "bweranyagyi girls' secondary school" ||
    clean === 'bweranyagyi girls secondary school' ||
    clean === 'bweranyagyi'
  );
}

export function normalizeMemberGender(raw: unknown): MemberGender | '' {
  const clean = String(raw || '').trim().toLowerCase();
  if (clean === 'male' || clean === 'm') return 'Male';
  if (clean === 'female' || clean === 'f') return 'Female';
  return '';
}

export function normalizeMemberSchool(rawSchool: unknown, rawOtherSchool?: unknown): string {
  const clean = String(rawSchool || '').trim().replace(/[\u2018\u2019`]/g, "'");
  if (!clean) return '';
  const lower = clean.toLowerCase();
  if (lower === 'ntare school' || lower === 'ntare') {
    return NTARE_SCHOOL;
  }
  if (
    lower === "bweranyagyi girls' secondary school" ||
    lower === 'bweranyagyi girls secondary school' ||
    lower === 'bweranyagyi'
  ) {
    return BWERANYAGYI_SCHOOL;
  }
  if (lower === 'other') {
    return String(rawOtherSchool || '').trim().slice(0, 120);
  }
  return clean.slice(0, 120);
}

export function resolveSchoolFormState(storedSchool?: unknown): {
  schoolChoice: '' | MemberSchoolPreset;
  otherSchool: string;
} {
  const clean = normalizeMemberSchool(storedSchool);
  if (!clean) return { schoolChoice: '', otherSchool: '' };
  if (clean === NTARE_SCHOOL) return { schoolChoice: NTARE_SCHOOL, otherSchool: '' };
  if (clean === BWERANYAGYI_SCHOOL) return { schoolChoice: BWERANYAGYI_SCHOOL, otherSchool: '' };
  return { schoolChoice: 'Other', otherSchool: clean };
}

export function normalizeMemberHouse(rawHouse: unknown, resolvedSchool?: unknown): string {
  if (!isHouseEligibleSchool(resolvedSchool)) {
    return '';
  }
  const clean = String(rawHouse || '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!clean) return '';

  const exactMatch = HOUSE_OPTIONS.find(opt => opt.toLowerCase() === clean);
  if (exactMatch) return exactMatch;

  // Match shorthand names (e.g. "Aggrey" -> "Aggrey House", "Bangizi" -> "Bangizi Jed")
  const normalizedNoSuffix = clean.replace(/\s+house$/i, '').trim();
  const aliasMatch = HOUSE_OPTIONS.find(opt => {
    const optLower = opt.toLowerCase();
    const optNoSuffix = optLower.replace(/\s+house$/i, '').trim();
    return optNoSuffix === normalizedNoSuffix || (optLower === 'bangizi jed' && normalizedNoSuffix === 'bangizi');
  });
  return aliasMatch || '';
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
    gender: -1,
    school: -1,
    house: -1
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
      colMap.gender = normalized.findIndex(c => c === 'GENDER' || c === 'SEX');
      colMap.school = normalized.findIndex(c => c.includes('SCHOOL'));
      colMap.house = normalized.findIndex(c => c === 'HOUSE' || c.includes('DORMITORY'));
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
    const gender = colMap.gender >= 0 ? normalizeMemberGender(row[colMap.gender]) : '';
    const school = colMap.school >= 0 ? normalizeMemberSchool(row[colMap.school]) : '';
    const house = colMap.house >= 0 ? normalizeMemberHouse(row[colMap.house], school) : '';

    const profileComplete = isMemberProfileComplete({ name: rawName, email, phone, address });
    const remainingUgx = defaultTargetUgx > 0 ? Math.max(0, defaultTargetUgx - effectiveTotal) : 0;

    const member: Member = {
      id: memberId,
      memberId,
      name: rawName,
      phone,
      email,
      address,
      gender,
      school,
      house,
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

export interface MergedDirectoryResult {
  members: any[];
  changed: boolean;
  contactUpdatedMemberIds: string[];
}

function parseIsoTimeMs(raw: unknown): number {
  const str = String(raw || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(str)) return 0;
  const ms = Date.parse(str);
  if (!Number.isFinite(ms)) return 0;
  const year = new Date(ms).getUTCFullYear();
  if (year < 2020 || year > 2035) return 0;
  return ms;
}

function stripLegacyTierField<T extends Record<string, any>>(record: T): Omit<T, 'tier'> {
  const { tier: _legacyTier, ...rest } = record || ({} as T);
  return rest;
}

export function mergeMemberDirectories(
  localMembers: any[],
  remoteMembers: any[],
  defaultTargetUgx: number = 100000,
  staffEmails: string[] = [],
  staffOwners?: Record<string, string>
): MergedDirectoryResult {
  if (!Array.isArray(remoteMembers) || remoteMembers.length === 0) {
    return { members: Array.isArray(localMembers) ? localMembers : [], changed: false, contactUpdatedMemberIds: [] };
  }

  const merged = (Array.isArray(localMembers) ? localMembers : []).map(m => stripLegacyTierField({ ...m }));
  const idIndex = new Map<string, number>();
  const emailIndex = new Map<string, number>();
  const canonicalIndex = new Map<string, number>();
  const normalizedNameIndex = new Map<string, number>();

  const registerIndices = (m: any, idx: number) => {
    const id = String(m?.id || m?.memberId || '').trim().toLowerCase();
    if (id && !id.startsWith('sb-live-') && !idIndex.has(id)) {
      idIndex.set(id, idx);
    }
    const name = String(m?.name || '').trim();
    const email = isStaffOrPlaceholderEmail(m?.email, name, staffEmails, staffOwners)
      ? ''
      : String(m?.email || '').trim().toLowerCase();
    if (email && !emailIndex.has(email)) {
      emailIndex.set(email, idx);
    }
    const canon = resolveCanonicalMemberNameKey(name);
    if (canon && !canonicalIndex.has(canon)) {
      canonicalIndex.set(canon, idx);
    }
    const norm = normalizePersonName(name);
    if (norm && !normalizedNameIndex.has(norm)) {
      normalizedNameIndex.set(norm, idx);
    }
  };

  merged.forEach((m, idx) => registerIndices(m, idx));

  let changed = false;
  const contactUpdatedIds = new Set<string>();

  for (const rawRemote of remoteMembers) {
    if (!rawRemote || typeof rawRemote !== 'object') continue;
    const remoteName = String(rawRemote.name || '').trim();
    if (!remoteName) continue;

    const remoteIdRaw = String(rawRemote.id || rawRemote.memberId || '').trim();
    const remoteIdKey = remoteIdRaw.toLowerCase();
    const remoteEmail = isStaffOrPlaceholderEmail(rawRemote.email, remoteName, staffEmails, staffOwners)
      ? ''
      : String(rawRemote.email || '').trim().toLowerCase();
    const remotePhone = cleanPhoneNumber(rawRemote.phone || '');
    const remoteAddress = String(rawRemote.address || '').trim();
    const remoteGender = normalizeMemberGender(rawRemote.gender);
    const remoteSchool = normalizeMemberSchool(rawRemote.school);
    const remoteHouse = normalizeMemberHouse(rawRemote.house, remoteSchool);
    const remoteCanon = resolveCanonicalMemberNameKey(remoteName);
    const remoteNorm = normalizePersonName(remoteName);

    let matchIdx: number | undefined;
    if (remoteIdKey && !remoteIdKey.startsWith('sb-live-')) {
      matchIdx = idIndex.get(remoteIdKey);
    }
    if (matchIdx === undefined && remoteEmail) {
      matchIdx = emailIndex.get(remoteEmail);
    }
    if (matchIdx === undefined && remoteCanon) {
      matchIdx = canonicalIndex.get(remoteCanon);
    }
    if (matchIdx === undefined && remoteNorm) {
      matchIdx = normalizedNameIndex.get(remoteNorm);
    }

    if (matchIdx !== undefined) {
      const local = merged[matchIdx];
      const localName = String(local.name || '').trim();
      const localEmail = isStaffOrPlaceholderEmail(local.email, localName, staffEmails, staffOwners)
        ? ''
        : String(local.email || '').trim().toLowerCase();
      const localPhone = cleanPhoneNumber(local.phone || '');
      const localAddress = String(local.address || '').trim();
      const localGender = normalizeMemberGender(local.gender);
      const localSchool = normalizeMemberSchool(local.school);
      const localHouse = normalizeMemberHouse(local.house, localSchool);

      const localTs = parseIsoTimeMs(local.updatedAt);
      const remoteTs = parseIsoTimeMs(rawRemote.updatedAt);
      const localHasContact = Boolean(localEmail || localPhone);
      const remoteHasContact = Boolean(remoteEmail || remotePhone);
      // Local wins if local has contact info and remote doesn't, or if local was updated more recently
      const remoteNewer = remoteTs > 0 && remoteTs > localTs && (!localHasContact || remoteHasContact);

      const pickStr = (localVal: string, remoteVal: string): string => {
        if (localVal && !remoteVal) return localVal;
        if (remoteNewer && remoteVal) return remoteVal;
        return localVal || remoteVal;
      };

      const nextName = pickStr(localName, remoteName);
      const nextEmail = pickStr(localEmail, remoteEmail);
      const nextPhone = pickStr(localPhone, remotePhone);
      const nextAddress = pickStr(localAddress, remoteAddress);
      const nextGender = (remoteNewer ? (remoteGender || localGender) : (localGender || remoteGender)) as MemberGender | '';
      const nextSchool = pickStr(localSchool, remoteSchool);
      const rawHousePick =
        remoteNewer && remoteSchool
          ? remoteHouse
          : !remoteNewer && localSchool
          ? localHouse
          : pickStr(localHouse, remoteHouse);
      const nextHouse = normalizeMemberHouse(rawHousePick, nextSchool);

      const localHist = Math.max(0, Number(local.historicalPaid ?? local.totalContributed) || 0);
      const remoteHist = Math.max(0, Number(rawRemote.historicalPaid ?? rawRemote.totalContributed) || 0);
      const nextPreNll = Math.max(0, Number(local.preNllPaid) || Number(rawRemote.preNllPaid) || 0);
      const nextSpot = Math.max(0, Number(local.spotPaid) || Number(rawRemote.spotPaid) || 0);
      const nextPaidAfter = Math.max(0, Number(local.paidAfter) || Number(rawRemote.paidAfter) || 0);
      const nextHist = localHist > 0 ? localHist : remoteHist;
      const nextLive = Math.max(0, Number(local.livePaid) || Number(rawRemote.livePaid) || 0);
      const nextTarget =
        remoteNewer && rawRemote.expectedTargetUgx !== undefined && Number(rawRemote.expectedTargetUgx) >= 0
          ? Number(rawRemote.expectedTargetUgx)
          : local.expectedTargetUgx !== undefined && Number(local.expectedTargetUgx) >= 0
          ? Number(local.expectedTargetUgx)
          : Math.max(0, Number(rawRemote.expectedTargetUgx ?? defaultTargetUgx) || 0);
      const nextTotal = nextHist + nextLive;
      const nextProfileStatus = isMemberProfileComplete({
        name: nextName,
        email: nextEmail,
        phone: nextPhone,
        address: nextAddress
      })
        ? 'COMPLETE'
        : 'INCOMPLETE';
      const nextUpdatedAt = remoteNewer ? String(rawRemote.updatedAt) : String(local.updatedAt || rawRemote.updatedAt || '');

      const contactOrProfileDiffers =
        nextName !== localName ||
        nextEmail !== localEmail ||
        nextPhone !== localPhone ||
        nextAddress !== localAddress ||
        nextGender !== localGender ||
        nextSchool !== localSchool ||
        nextHouse !== localHouse ||
        nextTarget !== (Number(local.expectedTargetUgx) || 0) ||
        nextProfileStatus !== String(local.profileStatus || 'INCOMPLETE') ||
        'tier' in (localMembers[matchIdx] || {});

      if (contactOrProfileDiffers) {
        changed = true;
        if (nextName !== localName || nextEmail !== localEmail || nextPhone !== localPhone) {
          contactUpdatedIds.add(String(local.id || local.memberId || ''));
        }
        merged[matchIdx] = stripLegacyTierField({
          ...local,
          name: nextName,
          email: nextEmail,
          phone: nextPhone,
          address: nextAddress,
          gender: nextGender,
          school: nextSchool,
          house: nextHouse,
          preNllPaid: nextPreNll,
          spotPaid: nextSpot,
          paidAfter: nextPaidAfter,
          historicalPaid: nextHist,
          livePaid: nextLive,
          totalContributed: nextTotal,
          expectedTargetUgx: nextTarget,
          remainingUgx: nextTarget > 0 ? Math.max(0, nextTarget - nextTotal) : 0,
          duesStatus: computeDuesStatus(nextTotal, nextTarget),
          profileStatus: nextProfileStatus,
          updatedAt: nextUpdatedAt
        });
        registerIndices(merged[matchIdx], matchIdx);
      }
    } else {
      const assignedId =
        remoteIdRaw && !remoteIdRaw.toUpperCase().startsWith('SB-LIVE-')
          ? remoteIdRaw
          : `SB-M-${String(merged.length + 1).padStart(4, '0')}`;
      const preNllPaid = Math.max(0, Number(rawRemote.preNllPaid) || 0);
      const spotPaid = Math.max(0, Number(rawRemote.spotPaid) || 0);
      const paidAfter = Math.max(0, Number(rawRemote.paidAfter) || 0);
      const historicalPaid = Math.max(0, Number(rawRemote.historicalPaid ?? (preNllPaid + spotPaid + paidAfter)) || 0);
      const livePaid = Math.max(0, Number(rawRemote.livePaid) || 0);
      const totalContributed = historicalPaid + livePaid;
      const expectedTargetUgx = Math.max(0, Number(rawRemote.expectedTargetUgx ?? defaultTargetUgx) || 0);
      const nowIso = String(rawRemote.updatedAt || new Date().toISOString());

      const added = stripLegacyTierField({
        id: assignedId,
        memberId: assignedId,
        name: remoteName,
        phone: remotePhone,
        email: remoteEmail,
        address: remoteAddress,
        gender: remoteGender,
        school: remoteSchool,
        house: remoteHouse,
        preNllPaid,
        spotPaid,
        paidAfter,
        historicalPaid,
        livePaid,
        totalContributed,
        expectedTargetUgx,
        remainingUgx: expectedTargetUgx > 0 ? Math.max(0, expectedTargetUgx - totalContributed) : 0,
        duesStatus: computeDuesStatus(totalContributed, expectedTargetUgx),
        profileStatus: isMemberProfileComplete({
          name: remoteName,
          email: remoteEmail,
          phone: remotePhone,
          address: remoteAddress
        })
          ? 'COMPLETE'
          : 'INCOMPLETE',
        paymentCount: (preNllPaid > 0 ? 1 : 0) + (spotPaid > 0 ? 1 : 0) + (paidAfter > 0 ? 1 : 0),
        lastPaymentDate: '',
        lastPurpose: '',
        source: String(rawRemote.source || 'CSV_IMPORT'),
        createdAt: nowIso,
        updatedAt: nowIso
      });
      const newIdx = merged.length;
      merged.push(added);
      registerIndices(added, newIdx);
      changed = true;
    }
  }

  return {
    members: merged,
    changed,
    contactUpdatedMemberIds: Array.from(contactUpdatedIds).filter(Boolean)
  };
}

