import crypto from 'crypto';
import { getDb } from '../db';
import { requireStaff } from '../auth';
import {
  buildReconciliationSummary,
  computeMemberTotals,
  coveredReceiptSet,
  isPlaceholderMemberEmail,
  logAudit,
  memberRowToMember,
  sanitizeMemberForClient
} from '../store';
import { mapSubmissionRow } from '../map';
import {
  cleanPhoneNumber,
  isStaffOrPlaceholderEmail,
  normalizePersonName,
  PRE_CSV_COVERED_GAS_RECEIPTS,
  resolveCanonicalMemberNameKey,
  UNRECORDED_LIVE_GAS_RECEIPTS
} from '../../../src/utils/ledgerReconciliation';
import {
  computeDuesStatus,
  isHouseEligibleSchool,
  isMemberProfileComplete,
  normalizeMemberGender,
  normalizeMemberHouse,
  normalizeMemberSchool,
  parseTreasuryMembersCsv,
  resolveMemberExpectedTarget
} from '../../../src/utils/memberImport';
import { fail, ok, errorResult, getParam } from '../types';
import type { HandlerCtx, HandlerResult, StaffUser } from '../types';
import type { ReconciliationSummary } from '../../../src/types';

const canEditMembers = (user: StaffUser): boolean =>
  user.role === 'OWNER' || user.permissions.canEditMembers === true;

const requireMemberEditor = async (
  ctx: HandlerCtx,
  deniedMessage: string
): Promise<{ ok: true; user: StaffUser } | { ok: false; response: HandlerResult }> => {
  const auth = await requireStaff(ctx);
  if (auth.ok === false) return auth;
  if (!canEditMembers(auth.user)) {
    return {
      ok: false,
      response: fail(403, { success: false, error: deniedMessage })
    };
  }
  return auth;
};

const loadMemberRows = async () => {
  const { data, error } = await getDb()
    .from('members')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20000);
  if (error) throw new Error(error.message);
  return data || [];
};

const loadTxRows = async () => {
  const { data, error } = await getDb()
    .from('transactions')
    .select('*')
    .limit(20000);
  if (error) throw new Error(error.message);
  return data || [];
};

const loadSubmissionRows = async () => {
  const { data, error } = await getDb()
    .from('member_submissions')
    .select('*')
    .order('submitted_at', { ascending: false })
    .limit(5000);
  if (error) throw new Error(error.message);
  return data || [];
};

interface HistBucket {
  pre: number;
  spot: number;
  after: number;
  total: number;
}

const histBucketFor = (rows: any[]): Map<string, HistBucket> => {
  const map = new Map<string, HistBucket>();
  for (const tx of rows) {
    const mId = String(tx?.member_id || '').trim();
    const recNo = String(tx?.receipt_number || '').trim().toUpperCase();
    if (!mId || !recNo.startsWith('HIST-')) continue;
    const amt = Math.max(0, Number(tx?.amount) || 0);
    if (!map.has(mId)) map.set(mId, { pre: 0, spot: 0, after: 0, total: 0 });
    const bucket = map.get(mId)!;
    bucket.total += amt;
    if (recNo.endsWith('-PRE')) bucket.pre += amt;
    else if (recNo.endsWith('-SPOT')) bucket.spot += amt;
    else if (recNo.endsWith('-AFTER') || recNo.endsWith('-ADJ')) bucket.after += amt;
  }
  return map;
};

const reconciliationCounters = (members: any[], txRows: any[]) => {
  let staffEmailsStripped = 0;
  for (const tx of txRows) {
    const em = String(tx?.email || '').trim().toLowerCase();
    if (em && isStaffOrPlaceholderEmail(em, tx?.payer_name)) staffEmailsStripped++;
  }
  const realEmails = new Set(
    PRE_CSV_COVERED_GAS_RECEIPTS.map(r => String(r.realEmail || '').toLowerCase()).filter(Boolean)
  );
  const recoveredPhones = new Set<string>(
    [
      ...PRE_CSV_COVERED_GAS_RECEIPTS.map(r => r.phone),
      ...UNRECORDED_LIVE_GAS_RECEIPTS.map(r => r.phone)
    ]
      .filter(Boolean)
      .map(p => cleanPhoneNumber(p))
  );
  let realEmailsRecovered = 0;
  let phonesRecovered = 0;
  for (const m of members) {
    const em = String(m.email || '').toLowerCase();
    if (em && realEmails.has(em)) realEmailsRecovered++;
    const ph = cleanPhoneNumber(m.phone || '');
    if (ph && recoveredPhones.has(ph)) phonesRecovered++;
  }
  return { staffEmailsStripped, realEmailsRecovered, phonesRecovered };
};

/** Recomputes every member's derived payment columns from HIST-* ledger rows. */
export const recomputeMembersFromLedger = async (): Promise<ReconciliationSummary> => {
  const [memberRows, txRows] = await Promise.all([loadMemberRows(), loadTxRows()]);
  const members = memberRows.map(memberRowToMember);
  const histByMember = histBucketFor(txRows);
  const nowIso = new Date().toISOString();

  const updates: any[] = [];
  for (const m of members) {
    const bucket = histByMember.get(String(m.id));
    if (!bucket) continue;
    const livePaid = Math.max(0, Number(m.livePaid) || 0);
    const historicalPaid = bucket.total;
    const totalContributed = historicalPaid + livePaid;
    const target = resolveMemberExpectedTarget(m.expectedTargetUgx, normalizeMemberGender(m.gender));
    const remaining = target > 0 ? Math.max(0, target - totalContributed) : 0;
    updates.push({
      id: String(m.id),
      pre_nll_paid: bucket.pre,
      spot_paid: bucket.spot,
      paid_after: bucket.after,
      historical_paid: historicalPaid,
      total_contributed: totalContributed,
      expected_target_ugx: target,
      remaining_ugx: remaining,
      dues_status: computeDuesStatus(totalContributed, target),
      updated_at: nowIso
    });
  }

  for (let i = 0; i < updates.length; i += 200) {
    const chunk = updates.slice(i, i + 200);
    const { error } = await getDb().from('members').upsert(chunk, { onConflict: 'id' });
    if (error) throw new Error(error.message);
  }

  return buildReconciliationSummary(reconciliationCounters(members, txRows));
};

// GET /api/admin/members
export const listMembers = async (ctx: HandlerCtx): Promise<HandlerResult> => {
  try {
    const auth = await requireStaff(ctx);
    if (auth.ok === false) return auth.response;

    const [memberRows, txRows, submissionRows] = await Promise.all([
      loadMemberRows(),
      loadTxRows(),
      loadSubmissionRows()
    ]);
    const covered = coveredReceiptSet();
    const histByMember = histBucketFor(txRows);

    // Index members by clean email & canonical name for live-receipt linking
    const idxByEmail = new Map<string, number>();
    const idxByName = new Map<string, number>();
    const members = memberRows.map(memberRowToMember);
    members.forEach((m, i) => {
      const em = String(m.email || '').trim().toLowerCase();
      if (em && !isStaffOrPlaceholderEmail(em)) idxByEmail.set(em, i);
      const key = resolveCanonicalMemberNameKey(m.name);
      if (key && !idxByName.has(key)) idxByName.set(key, i);
    });
    const idxById = new Map<string, number>();
    members.forEach((m, i) => idxById.set(String(m.id), i));

    const liveByMember = new Map<
      number,
      { amount: number; count: number; phone: string; email: string; lastDate: string; lastPurpose: string }
    >();
    const newUnregistered: any[] = [];
    const unregisteredByName = new Map<string, number>();

    for (const tx of txRows) {
      const rec = String(tx?.receipt_number || '').trim().toUpperCase();
      const type = String(tx?.type || 'INFLOW').toUpperCase();
      const status = String(tx?.paymentStatus || tx?.payment_status || 'COMPLETED').toUpperCase();
      if (type === 'OUTFLOW' || rec.startsWith('EXP-') || status === 'CANCELLED') continue;
      if (rec.startsWith('HIST-')) continue; // folded into member phase columns
      if (covered.has(rec)) continue; // pre-CSV live receipts already deduplicated

      const amt = Math.max(0, Number(tx?.amount) || 0);
      const payerName = String(tx?.payer_name || '').trim();
      const rawEm = String(tx?.email || '').trim().toLowerCase();
      const cleanEm = rawEm && !isStaffOrPlaceholderEmail(rawEm, payerName) ? rawEm : '';
      const cleanPh = cleanPhoneNumber(tx?.phone || '');
      const canonKey = resolveCanonicalMemberNameKey(payerName);

      let targetIdx: number | undefined;
      const mid = String(tx?.member_id || '').trim();
      if (mid && idxById.has(mid)) targetIdx = idxById.get(mid);
      if (targetIdx === undefined && cleanEm && idxByEmail.has(cleanEm)) targetIdx = idxByEmail.get(cleanEm);
      if (targetIdx === undefined && canonKey && idxByName.has(canonKey)) targetIdx = idxByName.get(canonKey);

      if (targetIdx !== undefined) {
        const cur =
          liveByMember.get(targetIdx) ||
          { amount: 0, count: 0, phone: '', email: '', lastDate: '', lastPurpose: '' };
        cur.amount += amt;
        cur.count += 1;
        if (!cur.phone && cleanPh) cur.phone = cleanPh;
        if (!cur.email && cleanEm) cur.email = cleanEm;
        const txDate = String(tx?.date || '');
        if (txDate && (!cur.lastDate || txDate > cur.lastDate)) {
          cur.lastDate = txDate;
          cur.lastPurpose = String(tx?.payment_purpose || cur.lastPurpose);
        }
        liveByMember.set(targetIdx, cur);
      } else if (payerName) {
        const existing = unregisteredByName.get(canonKey);
        if (existing !== undefined) {
          const nm = newUnregistered[existing];
          nm.livePaid += amt;
          nm.paymentCount += 1;
          if (!nm.phone && cleanPh) nm.phone = cleanPh;
          if (!nm.email && cleanEm) nm.email = cleanEm;
        } else {
          const id = `SB-LIVE-${String(newUnregistered.length + 1).padStart(4, '0')}`;
          unregisteredByName.set(canonKey, newUnregistered.length);
          newUnregistered.push({
            id,
            memberId: id,
            name: payerName,
            phone: cleanPh,
            email: cleanEm,
            address: '',
            gender: '',
            school: '',
            house: '',
            preNllPaid: 0,
            spotPaid: 0,
            paidAfter: 0,
            historicalPaid: 0,
            livePaid: amt,
            expectedTargetUgx: 0,
            paymentCount: 1,
            lastPaymentDate: String(tx?.date || ''),
            lastPurpose: String(tx?.payment_purpose || 'Membership'),
            source: 'LIVE_RECEIPT',
            createdAt: String(tx?.created_at || new Date().toISOString()),
            updatedAt: new Date().toISOString()
          });
        }
      }
    }

    const sanitized = members.map((m, i) => {
      const live = liveByMember.get(i);
      const hist = histByMember.get(String(m.id));
      const enriched = {
        ...m,
        email: String(m.email || '').trim().toLowerCase(),
        phone: cleanPhoneNumber(m.phone || live?.phone || ''),
        preNllPaid: hist ? hist.pre : m.preNllPaid,
        spotPaid: hist ? hist.spot : m.spotPaid,
        paidAfter: hist ? hist.after : m.paidAfter,
        historicalPaid: hist ? hist.total : m.historicalPaid,
        livePaid: live ? live.amount : Math.max(0, Number(m.livePaid) || 0),
        paymentCount: (m.source === 'LIVE_RECEIPT' ? 0 : Number(m.paymentCount) || 0) + (live?.count || 0),
        lastPaymentDate:
          live?.lastDate && (!m.lastPaymentDate || live.lastDate > m.lastPaymentDate)
            ? live.lastDate
            : m.lastPaymentDate,
        lastPurpose: live?.lastPurpose || m.lastPurpose
      };
      return sanitizeMemberForClient(enriched);
    });
    for (const extra of newUnregistered) {
      sanitized.push(sanitizeMemberForClient(extra));
    }

    const pendingCount = submissionRows.filter((s: any) => s?.status === 'PENDING').length;
    const summary = {
      totalMembers: sanitized.length,
      completeProfiles: sanitized.filter(m => m.profileStatus === 'COMPLETE').length,
      incompleteProfiles: sanitized.filter(m => m.profileStatus === 'INCOMPLETE').length,
      missingEmailCount: sanitized.filter(m => !m.email).length,
      missingPhoneCount: sanitized.filter(m => !m.phone).length,
      preNllSum: sanitized.reduce((acc, m) => acc + m.preNllPaid, 0),
      spotSum: sanitized.reduce((acc, m) => acc + m.spotPaid, 0),
      paidAfterSum: sanitized.reduce((acc, m) => acc + m.paidAfter, 0),
      historicalTotalSum: sanitized.reduce((acc, m) => acc + m.historicalPaid, 0),
      combinedTotalSum: sanitized.reduce((acc, m) => acc + (m.totalContributed || 0), 0),
      pendingSubmissions: pendingCount
    };

    return ok({
      success: true,
      data: {
        members: sanitized,
        submissions: submissionRows.map(mapSubmissionRow),
        summary,
        reconciliation: buildReconciliationSummary(reconciliationCounters(members, txRows))
      }
    });
  } catch (err) {
    return errorResult(err);
  }
};

// POST /api/admin/members {member}
export const upsertMember = async (ctx: HandlerCtx): Promise<HandlerResult> => {
  try {
    const auth = await requireMemberEditor(
      ctx,
      'Unauthorized: You do not have permission to edit or add member details.'
    );
    if (auth.ok === false) return auth.response;
    const operator = auth.user;

    const incoming = ctx.body?.member;
    if (!incoming || typeof incoming !== 'object') {
      return fail(400, { success: false, error: 'Invalid member payload.' });
    }

    const cleanName = String(incoming.name || '').trim().slice(0, 120);
    if (cleanName.length < 2) {
      return fail(400, { success: false, error: 'Member full name is required.' });
    }

    const cleanEmail = String(incoming.email || '').trim().toLowerCase().slice(0, 120);
    if (cleanEmail && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || (await isPlaceholderMemberEmail(cleanEmail)))) {
      return fail(400, {
        success: false,
        error: 'Please enter a valid email address or leave blank.'
      });
    }

    const cleanPhone = cleanPhoneNumber(String(incoming.phone || '').trim().slice(0, 30));
    const cleanAddress = String(incoming.address || '').trim().slice(0, 200);
    const cleanGender = normalizeMemberGender(incoming.gender);
    const cleanSchool = normalizeMemberSchool(incoming.school, incoming.otherSchool);
    const cleanHouse = normalizeMemberHouse(incoming.house, cleanSchool);
    const nowIso = new Date().toISOString();

    const memberRows = await loadMemberRows();
    const members = memberRows.map(memberRowToMember);
    const targetId = String(incoming.id || incoming.memberId || '').trim();
    let existing: any = undefined;
    let existingIdx = -1;
    if (targetId && !targetId.toUpperCase().startsWith('SB-LIVE-')) {
      existingIdx = members.findIndex(
        m =>
          String(m.id || '').trim().toLowerCase() === targetId.toLowerCase() ||
          String(m.memberId || '').trim().toLowerCase() === targetId.toLowerCase()
      );
    }
    if (existingIdx === -1 && cleanName) {
      const cleanCanonKey = resolveCanonicalMemberNameKey(cleanName);
      const cleanIncomingName = normalizePersonName(cleanName);
      existingIdx = members.findIndex(
        m =>
          (cleanCanonKey && resolveCanonicalMemberNameKey(m.name) === cleanCanonKey) ||
          normalizePersonName(m.name) === cleanIncomingName
      );
    }
    if (existingIdx !== -1) existing = members[existingIdx];

    if (cleanEmail) {
      const duplicate = members.find(
        (m, idx) => idx !== existingIdx && String(m?.email || '').trim().toLowerCase() === cleanEmail
      );
      if (duplicate) {
        return fail(409, {
          success: false,
          error: `Duplicate email conflict: "${cleanEmail}" is already assigned to ${duplicate.name} (${duplicate.id}).`
        });
      }
    }

    const touchTransactions = async (memberId: string) => {
      await getDb()
        .from('transactions')
        .update({
          payer_name: cleanName,
          email: cleanEmail,
          phone: cleanPhone,
          email_status: cleanEmail ? 'SKIPPED' : 'NOT_PROVIDED'
        })
        .eq('member_id', memberId);
    };

    if (existing) {
      const prevGender = normalizeMemberGender(existing.gender);
      const nextGender = incoming.gender !== undefined ? cleanGender : prevGender;
      const nextExpected = resolveMemberExpectedTarget(
        incoming.expectedTargetUgx !== undefined ? incoming.expectedTargetUgx : existing.expectedTargetUgx,
        nextGender,
        prevGender
      );
      const totals = computeMemberTotals({
        historicalPaid: existing.historicalPaid ?? existing.totalContributed,
        livePaid: existing.livePaid,
        gender: nextGender,
        expectedTargetUgx: nextExpected,
        name: cleanName,
        email: cleanEmail,
        phone: cleanPhone,
        address: cleanAddress
      });
      const nextSchool = incoming.school !== undefined ? cleanSchool : normalizeMemberSchool(existing.school);
      const nextHouse = isHouseEligibleSchool(nextSchool)
        ? incoming.house !== undefined
          ? cleanHouse
          : normalizeMemberHouse(existing.house, nextSchool)
        : '';

      const updatedRecord = {
        ...existing,
        name: cleanName,
        email: cleanEmail,
        phone: cleanPhone,
        address: cleanAddress,
        gender: nextGender,
        school: nextSchool,
        house: nextHouse,
        expectedTargetUgx: totals.expectedTargetUgx,
        totalContributed: totals.totalContributed,
        remainingUgx: totals.remainingUgx,
        duesStatus: totals.duesStatus,
        profileStatus: totals.profileStatus,
        updatedAt: nowIso
      };

      const { data, error } = await getDb()
        .from('members')
        .upsert(
          {
            id: String(existing.id),
            name: cleanName,
            email: cleanEmail,
            phone: cleanPhone,
            address: cleanAddress,
            gender: nextGender,
            school: nextSchool,
            house: nextHouse,
            expected_target_ugx: totals.expectedTargetUgx,
            total_contributed: totals.totalContributed,
            remaining_ugx: totals.remainingUgx,
            dues_status: totals.duesStatus,
            profile_status: totals.profileStatus,
            updated_at: nowIso
          },
          { onConflict: 'id' }
        )
        .select()
        .single();
      if (error) throw new Error(error.message);
      await touchTransactions(String(existing.id));

      await logAudit({
        user: operator.name,
        userEmail: operator.email,
        action: 'EDIT_USER',
        description: `${operator.name} updated member ${cleanName} (${existing.id}).`
      });

      return ok({
        success: true,
        data: sanitizeMemberForClient(data ? memberRowToMember(data) : updatedRecord)
      });
    }

    const { count } = await getDb()
      .from('members')
      .select('id', { count: 'exact', head: true });
    const nextSeq = (count || members.length) + 1;
    const newId = `SB-M-${String(nextSeq).padStart(4, '0')}-${crypto
      .randomBytes(2)
      .toString('hex')
      .toUpperCase()}`;
    const newExpectedTarget = resolveMemberExpectedTarget(incoming.expectedTargetUgx, cleanGender);
    const profile = {
      name: cleanName,
      email: cleanEmail,
      phone: cleanPhone,
      address: cleanAddress
    };
    const newRecord = {
      id: newId,
      memberId: newId,
      name: cleanName,
      email: cleanEmail,
      phone: cleanPhone,
      address: cleanAddress,
      gender: cleanGender,
      school: cleanSchool,
      house: cleanHouse,
      preNllPaid: 0,
      spotPaid: 0,
      paidAfter: 0,
      historicalPaid: 0,
      livePaid: 0,
      totalContributed: 0,
      expectedTargetUgx: newExpectedTarget,
      remainingUgx: newExpectedTarget,
      duesStatus: computeDuesStatus(0, newExpectedTarget),
      profileStatus: isMemberProfileComplete(profile) ? 'COMPLETE' : 'INCOMPLETE',
      paymentCount: 0,
      lastPaymentDate: '',
      lastPurpose: '',
      source: 'MANUAL',
      createdAt: nowIso,
      updatedAt: nowIso
    };

    const { data, error } = await getDb()
      .from('members')
      .insert({
        id: newId,
        name: cleanName,
        email: cleanEmail,
        phone: cleanPhone,
        address: cleanAddress,
        gender: cleanGender,
        school: cleanSchool,
        house: cleanHouse,
        expected_target_ugx: newExpectedTarget,
        remaining_ugx: newExpectedTarget,
        dues_status: newRecord.duesStatus,
        profile_status: newRecord.profileStatus,
        payment_count: 0,
        source: 'MANUAL',
        created_at: nowIso,
        updated_at: nowIso
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    await logAudit({
      user: operator.name,
      userEmail: operator.email,
      action: 'ADD_ADMIN',
      description: `${operator.name} added member ${cleanName} (${newId}).`
    });

    return ok({
      success: true,
      data: sanitizeMemberForClient(data ? memberRowToMember(data) : newRecord)
    });
  } catch (err) {
    return errorResult(err);
  }
};

// POST /api/admin/members/import-csv {csvText}
export const importCsv = async (ctx: HandlerCtx): Promise<HandlerResult> => {
  try {
    const auth = await requireMemberEditor(
      ctx,
      'Unauthorized: You do not have permission to import or modify member records.'
    );
    if (auth.ok === false) return auth.response;
    const operator = auth.user;

    const csvText = String(ctx.body?.csvText || '');
    if (!csvText.trim() || csvText.length > 2 * 1024 * 1024) {
      return fail(400, { success: false, error: 'Please provide a valid CSV file under 2 MB.' });
    }

    const parsed = parseTreasuryMembersCsv(csvText, { defaultTargetUgx: 0 });
    if (parsed.members.length === 0) {
      return fail(400, {
        success: false,
        error: parsed.summary.warnings[0] || 'No member rows were found in that CSV.'
      });
    }
    if (parsed.members.length > 2000) {
      return fail(400, { success: false, error: 'Maximum 2,000 rows per CSV import.' });
    }

    const memberRows = await loadMemberRows();
    const members = memberRows.map(memberRowToMember);
    const byId = new Map<string, any>();
    const byCanonicalName = new Map<string, any>();
    for (const m of members) {
      if (m.id) byId.set(String(m.id), m);
      const canonKey = m.name ? resolveCanonicalMemberNameKey(m.name) : '';
      if (canonKey && !byCanonicalName.has(canonKey)) byCanonicalName.set(canonKey, m);
    }

    let addedCount = 0;
    let updatedCount = 0;
    const merged: any[] = [];
    const seenIds = new Set<string>();

    for (const imported of parsed.members) {
      const canonImported = resolveCanonicalMemberNameKey(imported.name);
      const existing =
        (imported.id ? byId.get(String(imported.id)) : undefined) ||
        (canonImported ? byCanonicalName.get(canonImported) : undefined);

      if (existing) {
        updatedCount++;
        const mergedEmail = String(imported.email || existing.email || '').toLowerCase();
        const mergedPhone = cleanPhoneNumber(imported.phone || existing.phone || '');
        const mergedAddress = imported.address || existing.address || '';
        const mergedGender = normalizeMemberGender(existing.gender || imported.gender);
        const mergedSchool = normalizeMemberSchool(existing.school || imported.school);
        const mergedHouse = normalizeMemberHouse(existing.house || imported.house, mergedSchool);
        const preservedLivePaid = Math.max(0, Number(existing.livePaid) || 0);
        const nextTotal = Math.max(0, Number(imported.historicalPaid) || 0) + preservedLivePaid;
        const updated = {
          ...existing,
          preNllPaid: Math.max(0, Number(imported.preNllPaid) || 0),
          spotPaid: Math.max(0, Number(imported.spotPaid) || 0),
          paidAfter: Math.max(0, Number(imported.paidAfter) || 0),
          historicalPaid: Math.max(0, Number(imported.historicalPaid) || 0),
          livePaid: preservedLivePaid,
          totalContributed: nextTotal,
          email: mergedEmail,
          phone: mergedPhone,
          address: mergedAddress,
          gender: mergedGender,
          school: mergedSchool,
          house: mergedHouse,
          profileStatus: isMemberProfileComplete({
            name: existing.name,
            email: mergedEmail,
            phone: mergedPhone,
            address: mergedAddress
          })
            ? 'COMPLETE'
            : 'INCOMPLETE',
          updatedAt: new Date().toISOString()
        };
        merged.push(updated);
        seenIds.add(String(updated.id));
      } else {
        addedCount++;
        merged.push(imported);
        seenIds.add(String(imported.id));
      }
    }

    // Preserve manual members not part of this CSV batch
    for (const existing of members) {
      if (!seenIds.has(String(existing.id))) merged.push(existing);
    }

    const memberUpserts = merged.map(m => ({
      id: String(m.id),
      name: String(m.name || ''),
      phone: cleanPhoneNumber(m.phone || ''),
      email: String(m.email || '').toLowerCase(),
      address: String(m.address || ''),
      gender: String(m.gender || ''),
      school: String(m.school || ''),
      house: String(m.house || ''),
      pre_nll_paid: Math.max(0, Number(m.preNllPaid) || 0),
      spot_paid: Math.max(0, Number(m.spotPaid) || 0),
      paid_after: Math.max(0, Number(m.paidAfter) || 0),
      historical_paid: Math.max(0, Number(m.historicalPaid) || 0),
      live_paid: Math.max(0, Number(m.livePaid) || 0),
      total_contributed: Math.max(0, Number(m.totalContributed) || 0),
      expected_target_ugx: Math.max(0, Number(m.expectedTargetUgx) || 0),
      remaining_ugx: Math.max(0, Number(m.remainingUgx) || 0),
      dues_status: String(m.duesStatus || ''),
      profile_status: String(m.profileStatus || ''),
      payment_count: Number(m.paymentCount) || 0,
      last_payment_date: String(m.lastPaymentDate || ''),
      last_purpose: String(m.lastPurpose || ''),
      source: String(m.source || 'CSV_IMPORT'),
      updated_at: new Date().toISOString()
    }));

    for (let i = 0; i < memberUpserts.length; i += 200) {
      const { error } = await getDb()
        .from('members')
        .upsert(memberUpserts.slice(i, i + 200), { onConflict: 'id' });
      if (error) throw new Error(error.message);
    }

    // Idempotently merge historical transactions (preserving saved contacts)
    const { data: existingHist } = await getDb()
      .from('transactions')
      .select('*')
      .limit(20000);
    const histByReceipt = new Map<string, any>();
    for (const tx of existingHist || []) {
      if (tx?.receipt_number) histByReceipt.set(String(tx.receipt_number), tx);
    }
    const memberLookup = new Map<string, any>();
    for (const m of merged) memberLookup.set(String(m.id), m);

    const txUpserts: any[] = [];
    for (const tx of parsed.historicalTransactions) {
      const prev = histByReceipt.get(String(tx.receiptNumber));
      const ownerMember = tx.memberId ? memberLookup.get(String(tx.memberId)) : null;
      const email = String(ownerMember?.email || prev?.email || tx.email || '').toLowerCase();
      txUpserts.push({
        receipt_number: String(tx.receiptNumber),
        transaction_id: prev?.transaction_id || `hist-${String(tx.receiptNumber).toLowerCase()}`,
        member_id: String(tx.memberId || prev?.member_id || ''),
        type: 'INFLOW',
        date: String(tx.date || ''),
        time: String(tx.time || ''),
        payer_name: String(ownerMember?.name || prev?.payer_name || tx.payerName || ''),
        phone: cleanPhoneNumber(ownerMember?.phone || prev?.phone || tx.phone || ''),
        email,
        amount: Math.max(0, Number(tx.amount) || 0),
        payment_purpose: String(tx.paymentPurpose || prev?.payment_purpose || ''),
        payment_method: String(tx.paymentMethod || prev?.payment_method || ''),
        payment_reference: String(tx.paymentReference || prev?.payment_reference || ''),
        notes: String(tx.notes || prev?.notes || ''),
        generated_by: String(tx.generatedBy || prev?.generated_by || ''),
        operator_email: String(tx.operatorEmail || prev?.operator_email || ''),
        payment_status: String(tx.paymentStatus || prev?.payment_status || 'COMPLETED').toUpperCase(),
        email_status: email ? 'SKIPPED' : 'NOT_PROVIDED',
        sync_status: 'SYNCED'
      });
      histByReceipt.set(String(tx.receiptNumber), { member_id: txUpserts[txUpserts.length - 1].member_id });
    }

    for (let i = 0; i < txUpserts.length; i += 200) {
      const { error } = await getDb()
        .from('transactions')
        .upsert(txUpserts.slice(i, i + 200), { onConflict: 'receipt_number' });
      if (error) throw new Error(error.message);
    }

    await recomputeMembersFromLedger();

    await logAudit({
      user: operator.name,
      userEmail: operator.email,
      action: 'HISTORICAL_IMPORT_COMPLETED',
      description: `${operator.name} imported ${parsed.members.length} member rows (${addedCount} new, ${updatedCount} updated).`
    });

    return ok({
      success: true,
      message: `Imported ${parsed.members.length} members (${addedCount} new, ${updatedCount} updated) & reconciled ledger. Historical treasury: ${parsed.summary.totalSum.toLocaleString()} UGX.`,
      data: {
        addedCount,
        updatedCount,
        summary: parsed.summary
      }
    });
  } catch (err) {
    return errorResult(err);
  }
};

// POST /api/admin/members/merge {primaryMemberId, duplicateMemberIds}
export const mergeMembers = async (ctx: HandlerCtx): Promise<HandlerResult> => {
  try {
    const auth = await requireMemberEditor(
      ctx,
      'Unauthorized: You do not have permission to merge member profiles.'
    );
    if (auth.ok === false) return auth.response;
    const operator = auth.user;

    const primaryId = String(ctx.body?.primaryMemberId || '').trim();
    const duplicateIds = Array.isArray(ctx.body?.duplicateMemberIds)
      ? ctx.body.duplicateMemberIds.map((id: unknown) => String(id || '').trim()).filter((id: string) => id && id !== primaryId)
      : [];

    if (!primaryId || duplicateIds.length === 0) {
      return fail(400, {
        success: false,
        error: 'Select one primary member and at least one duplicate member to merge.'
      });
    }

    const memberRows = await loadMemberRows();
    const members = memberRows.map(memberRowToMember);
    const primaryIdx = members.findIndex(m => String(m.id || m.memberId) === primaryId);
    if (primaryIdx === -1) {
      return fail(404, { success: false, error: 'Primary member record was not found.' });
    }

    const dupSet = new Set(duplicateIds);
    const toMerge = members.filter(m => dupSet.has(String(m.id || m.memberId)));
    if (toMerge.length === 0) {
      return fail(404, { success: false, error: 'Selected duplicate records were not found.' });
    }

    const primary = { ...members[primaryIdx] };
    for (const d of toMerge) {
      primary.preNllPaid = (Number(primary.preNllPaid) || 0) + (Number(d.preNllPaid) || 0);
      primary.spotPaid = (Number(primary.spotPaid) || 0) + (Number(d.spotPaid) || 0);
      primary.paidAfter = (Number(primary.paidAfter) || 0) + (Number(d.paidAfter) || 0);
      primary.historicalPaid = (Number(primary.historicalPaid) || 0) + (Number(d.historicalPaid) || 0);
      primary.livePaid = (Number(primary.livePaid) || 0) + (Number(d.livePaid) || 0);
      primary.paymentCount = (Number(primary.paymentCount) || 0) + (Number(d.paymentCount) || 0);
      if (!primary.email && d.email && !isStaffOrPlaceholderEmail(d.email)) primary.email = d.email;
      if (!primary.phone && d.phone) primary.phone = cleanPhoneNumber(d.phone);
      if (!primary.address && d.address) primary.address = d.address;
    }
    primary.phone = cleanPhoneNumber(primary.phone || '');
    primary.totalContributed = (Number(primary.historicalPaid) || 0) + (Number(primary.livePaid) || 0);
    const targetUgx = resolveMemberExpectedTarget(primary.expectedTargetUgx, primary.gender);
    primary.expectedTargetUgx = targetUgx;
    primary.remainingUgx = targetUgx > 0 ? Math.max(0, targetUgx - primary.totalContributed) : 0;
    primary.duesStatus = computeDuesStatus(primary.totalContributed, targetUgx);
    primary.profileStatus = isMemberProfileComplete(primary) ? 'COMPLETE' : 'INCOMPLETE';
    primary.updatedAt = new Date().toISOString();

    const { error: updErr } = await getDb()
      .from('members')
      .upsert(
        {
          id: String(primary.id),
          email: String(primary.email || '').toLowerCase(),
          phone: primary.phone,
          address: String(primary.address || ''),
          pre_nll_paid: primary.preNllPaid,
          spot_paid: primary.spotPaid,
          paid_after: primary.paidAfter,
          historical_paid: primary.historicalPaid,
          live_paid: primary.livePaid,
          total_contributed: primary.totalContributed,
          expected_target_ugx: primary.expectedTargetUgx,
          remaining_ugx: primary.remainingUgx,
          dues_status: primary.duesStatus,
          profile_status: primary.profileStatus,
          payment_count: primary.paymentCount,
          updated_at: primary.updatedAt
        },
        { onConflict: 'id' }
      );
    if (updErr) throw new Error(updErr.message);

    // Re-point ledger transactions to the primary member
    const { error: txErr } = await getDb()
      .from('transactions')
      .update({
        member_id: String(primary.id),
        payer_name: primary.name,
        ...(primary.email ? { email: String(primary.email).toLowerCase() } : {}),
        ...(primary.phone ? { phone: primary.phone } : {})
      })
      .in('member_id', Array.from(dupSet));
    if (txErr) throw new Error(txErr.message);

    const { error: delErr } = await getDb()
      .from('members')
      .delete()
      .in('id', Array.from(dupSet));
    if (delErr) throw new Error(delErr.message);

    await logAudit({
      user: operator.name,
      userEmail: operator.email,
      action: 'EDIT_USER',
      description: `${operator.name} merged ${toMerge.length} duplicate member record(s) into ${primary.name}.`
    });

    return ok({
      success: true,
      message: `Merged ${toMerge.length} duplicate record${toMerge.length === 1 ? '' : 's'} into ${primary.name}.`
    });
  } catch (err) {
    return errorResult(err);
  }
};

// POST /api/admin/members/:id/claim-link
export const claimLink = async (ctx: HandlerCtx): Promise<HandlerResult> => {
  try {
    const auth = await requireMemberEditor(
      ctx,
      'Unauthorized: You do not have permission to edit or add member details.'
    );
    if (auth.ok === false) return auth.response;

    const memberId = getParam(ctx, 'id').trim();
    const { data: row, error } = await getDb()
      .from('members')
      .select('id, name')
      .eq('id', memberId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) {
      return fail(404, { success: false, error: 'Member not found.' });
    }

    const rawToken = crypto.randomBytes(16).toString('hex'); // 32-hex chars
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const { error: updErr } = await getDb()
      .from('members')
      .update({ claim_token: rawToken, claim_token_expires_at: expiresAt, updated_at: new Date().toISOString() })
      .eq('id', memberId);
    if (updErr) throw new Error(updErr.message);

    return ok({
      success: true,
      data: {
        token: rawToken,
        expiresAt,
        memberName: String(row.name || '')
      }
    });
  } catch (err) {
    return errorResult(err);
  }
};

// POST /api/admin/members/submissions/:submissionId/review {decision, reviewNotes}
export const reviewSubmission = async (ctx: HandlerCtx): Promise<HandlerResult> => {
  try {
    const auth = await requireMemberEditor(
      ctx,
      'Unauthorized: You do not have permission to review or change member submissions.'
    );
    if (auth.ok === false) return auth.response;
    const operator = auth.user;

    const submissionId = getParam(ctx, 'submissionId', 'id').trim();
    const decision = String(ctx.body?.decision || '').trim().toUpperCase();
    const reviewNotes = String(ctx.body?.reviewNotes || '').trim().slice(0, 300);

    if (decision !== 'APPROVE' && decision !== 'REJECT') {
      return fail(400, { success: false, error: 'Decision must be APPROVE or REJECT.' });
    }

    const { data: sub, error: subErr } = await getDb()
      .from('member_submissions')
      .select('*')
      .eq('id', submissionId)
      .maybeSingle();
    if (subErr) throw new Error(subErr.message);
    if (!sub) {
      return fail(404, { success: false, error: 'Submission not found.' });
    }
    if (String(sub.status) !== 'PENDING') {
      return fail(400, {
        success: false,
        error: `Submission has already been ${String(sub.status).toLowerCase()}.`
      });
    }

    const nowIso = new Date().toISOString();

    if (decision === 'APPROVE') {
      const { data: memberRow, error: mErr } = await getDb()
        .from('members')
        .select('*')
        .eq('id', String(sub.member_id))
        .maybeSingle();
      if (mErr) throw new Error(mErr.message);
      if (!memberRow) {
        return fail(404, { success: false, error: 'Target member record no longer exists.' });
      }
      const member = memberRowToMember(memberRow);

      const cleanEmail = String(sub.submitted_email || '').trim().toLowerCase();
      if (cleanEmail) {
        const { data: conflicts } = await getDb()
          .from('members')
          .select('id, name, email')
          .ilike('email', cleanEmail);
        const conflict = (conflicts || []).find((m: any) => String(m.id) !== String(member.id));
        if (conflict) {
          return fail(409, {
            success: false,
            error: `Cannot approve: "${cleanEmail}" is already registered to ${conflict.name}.`
          });
        }
      }

      const prevGender = normalizeMemberGender(member.gender);
      const cleanPhone = cleanPhoneNumber(sub.submitted_phone || member.phone || '');
      const cleanSchool = normalizeMemberSchool(sub.submitted_school || member.school);
      const cleanGender = normalizeMemberGender(sub.submitted_gender || member.gender);
      const cleanHouse = normalizeMemberHouse(sub.submitted_house || member.house, cleanSchool);
      const nextTarget = resolveMemberExpectedTarget(member.expectedTargetUgx, cleanGender, prevGender);
      const histPaid = Math.max(0, Number(member.historicalPaid ?? member.totalContributed) || 0);
      const livePaid = Math.max(0, Number(member.livePaid) || 0);
      const totalContributed = histPaid + livePaid;
      const updatedMember: any = {
        ...member,
        name: String(sub.submitted_name || member.name),
        email: cleanEmail,
        phone: cleanPhone,
        address: String(sub.submitted_address || member.address),
        gender: cleanGender,
        school: cleanSchool,
        house: cleanHouse,
        expectedTargetUgx: nextTarget,
        remainingUgx: nextTarget > 0 ? Math.max(0, nextTarget - totalContributed) : 0,
        duesStatus: computeDuesStatus(totalContributed, nextTarget),
        claim_token: '',
        claim_token_expires_at: null,
        updatedAt: nowIso
      };
      updatedMember.profileStatus = isMemberProfileComplete(updatedMember) ? 'COMPLETE' : 'INCOMPLETE';

      const { error: updErr } = await getDb()
        .from('members')
        .upsert(
          {
            id: String(member.id),
            name: updatedMember.name,
            email: cleanEmail,
            phone: cleanPhone,
            address: updatedMember.address,
            gender: cleanGender,
            school: cleanSchool,
            house: cleanHouse,
            expected_target_ugx: nextTarget,
            remaining_ugx: updatedMember.remainingUgx,
            dues_status: updatedMember.duesStatus,
            profile_status: updatedMember.profileStatus,
            claim_token: '',
            claim_token_expires_at: null,
            updated_at: nowIso
          },
          { onConflict: 'id' }
        );
      if (updErr) throw new Error(updErr.message);

      // Stamp verified email/phone/name ONLY onto this member's ledger transactions
      await getDb()
        .from('transactions')
        .update({
          payer_name: updatedMember.name,
          email: cleanEmail,
          phone: cleanPhone,
          email_status: cleanEmail ? 'SKIPPED' : 'NOT_PROVIDED'
        })
        .eq('member_id', String(member.id));
    }

    const { data: updatedSub, error: subUpdErr } = await getDb()
      .from('member_submissions')
      .update({
        status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
        reviewed_by: operator.email,
        reviewed_at: nowIso,
        review_notes: reviewNotes
      })
      .eq('id', submissionId)
      .select()
      .single();
    if (subUpdErr) throw new Error(subUpdErr.message);

    await logAudit({
      user: operator.name,
      userEmail: operator.email,
      action: 'EDIT_USER',
      description:
        decision === 'APPROVE'
          ? `${operator.name} approved ${String(sub.submitted_name)}'s profile update.`
          : `${operator.name} rejected ${String(sub.submitted_name)}'s profile update.`
    });

    return ok({
      success: true,
      message:
        decision === 'APPROVE'
          ? `Approved and synced ${String(sub.submitted_name)}'s details. They can now sign in at /me.`
          : `Rejected update request from ${String(sub.submitted_name)}.`,
      data: mapSubmissionRow(updatedSub)
    });
  } catch (err) {
    return errorResult(err);
  }
};

// POST /api/admin/members/reconcile-ledger
export const reconcileLedger = async (ctx: HandlerCtx): Promise<HandlerResult> => {
  try {
    const auth = await requireMemberEditor(
      ctx,
      'Unauthorized: You do not have permission to edit or add member details.'
    );
    if (auth.ok === false) return auth.response;
    const operator = auth.user;

    const summary = await recomputeMembersFromLedger();

    await logAudit({
      user: operator.name,
      userEmail: operator.email,
      action: 'LEGACY_SYNC_SUCCEEDED',
      description: `${operator.name} reconciled the member ledger (${summary.coveredReceiptCount} pre-CSV receipts deduplicated).`
    });

    return ok({
      success: true,
      message: `Cleaned & reconciled ledger: ${summary.coveredReceiptCount} pre-CSV live receipts deduplicated (${summary.coveredAmountUgx.toLocaleString()} UGX), ${summary.realEmailsRecovered} real emails & ${summary.phonesRecovered} phones recovered, zero staff emails attached.`,
      data: summary
    });
  } catch (err) {
    return errorResult(err);
  }
};
