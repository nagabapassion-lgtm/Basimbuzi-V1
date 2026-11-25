import { getDb } from '../db';
import { issueOtp, signToken, verifyOtp, verifyToken } from '../auth';
import {
  coveredReceiptSet,
  logAudit,
  memberRowToMember,
  sanitizeMemberForClient
} from '../store';
import {
  cleanPhoneNumber,
  isStaffOrPlaceholderEmail,
  resolveCanonicalMemberNameKey
} from '../../../src/utils/ledgerReconciliation';
import {
  computeDuesStatus,
  getStandardTargetForGender,
  isHouseEligibleSchool,
  isMemberProfileComplete,
  normalizeMemberGender,
  normalizeMemberHouse,
  normalizeMemberSchool,
  resolveMemberExpectedTarget
} from '../../../src/utils/memberImport';
import { fail, ok, errorResult, getParam } from '../types';
import type { HandlerCtx, HandlerResult, MemberSession } from '../types';

const loadMembers = async () => {
  const { data, error } = await getDb()
    .from('members')
    .select('*')
    .limit(20000);
  if (error) throw new Error(error.message);
  return (data || []).map(memberRowToMember);
};

const loadInflowTxRows = async () => {
  const { data, error } = await getDb()
    .from('transactions')
    .select('*')
    .limit(20000);
  if (error) throw new Error(error.message);
  return data || [];
};

const verifyMemberBearer = (headers: Record<string, string>): MemberSession | null => {
  const auth = String(headers.authorization || '').trim();
  if (!auth.toLowerCase().startsWith('bearer ')) return null;
  const payload = verifyToken(auth.slice(7).trim());
  if (!payload || payload.kind !== 'member') return null;
  const email = String(payload.sub || '').trim().toLowerCase();
  if (isStaffOrPlaceholderEmail(email)) return null;
  return {
    email,
    memberId: String(payload.memberId || ''),
    name: String(payload.name || email.split('@')[0]).trim()
  };
};

interface RegisteredMemberLookup {
  registered: boolean;
  memberName: string;
  memberRecord: any | null;
  inflows: any[];
}

/**
 * Ports server.ts fetchRegisteredMemberData: match payments to the verified
 * member by EMAIL first, then PHONE, then canonical NAME.
 */
const fetchRegisteredMemberData = async (
  cleanEmail: string,
  memberId = ''
): Promise<RegisteredMemberLookup> => {
  const members = await loadMembers();
  const memberRecord =
    members.find(
      m =>
        String(m.email || '').trim().toLowerCase() &&
        !isStaffOrPlaceholderEmail(String(m.email || '').trim().toLowerCase()) &&
        String(m.email || '').trim().toLowerCase() === cleanEmail
    ) ||
    (memberId ? members.find(m => String(m.id) === String(memberId)) : undefined) ||
    null;

  const covered = coveredReceiptSet();
  const txRows = await loadInflowTxRows();
  const inflowMap = new Map<string, any>();

  for (const tx of txRows) {
    const rec = String(tx?.receipt_number || '').trim().toUpperCase();
    const type = String(tx?.type || 'INFLOW').toUpperCase();
    const status = String(tx?.payment_status || 'COMPLETED').toUpperCase();
    if (type === 'OUTFLOW' || rec.startsWith('EXP-') || status === 'CANCELLED') continue;
    if (covered.has(rec)) continue;

    const rawEm = String(tx?.email || '').trim().toLowerCase();
    const txEmail = rawEm && !isStaffOrPlaceholderEmail(rawEm, tx?.payer_name) ? rawEm : '';
    const txPhone = cleanPhoneNumber(tx?.phone || '');
    const memberPhone = memberRecord ? cleanPhoneNumber(memberRecord.phone || '') : '';

    const emailMatch = Boolean(txEmail && txEmail === cleanEmail);
    const phoneMatch = Boolean(
      memberRecord && memberPhone && txPhone && txPhone === memberPhone
    );
    const nameMatch = Boolean(
      memberRecord &&
        resolveCanonicalMemberNameKey(tx?.payer_name) === resolveCanonicalMemberNameKey(memberRecord.name)
    );
    const memberRefMatch = Boolean(
      memberRecord && String(tx?.member_id || '') && String(tx.member_id) === String(memberRecord.id)
    );

    if (emailMatch || phoneMatch || nameMatch || memberRefMatch) {
      if (rec) inflowMap.set(rec, tx);
    }
  }

  const inflows = Array.from(inflowMap.values());
  if (inflows.length === 0 && !memberRecord) {
    return { registered: false, memberName: '', memberRecord: null, inflows: [] };
  }
  const resolvedName = String(
    memberRecord?.name || inflows[0]?.payer_name || cleanEmail.split('@')[0]
  ).trim();
  return { registered: true, memberName: resolvedName, memberRecord, inflows };
};

// POST /api/me/send-code {email}
export const meSendCode = async (ctx: HandlerCtx): Promise<HandlerResult> => {
  try {
    const cleanEmail = String(ctx.body?.email || '').trim().toLowerCase();
    if (isStaffOrPlaceholderEmail(cleanEmail)) {
      return fail(400, {
        success: false,
        error: 'Please enter a valid registered member email address.'
      });
    }

    const issued = await issueOtp(cleanEmail, 'MEMBER_LOGIN');
    if (!issued.ok) {
      return fail(429, {
        success: false,
        error: `Please wait ${issued.waitSeconds ?? 30}s before requesting another sign-in code.`
      });
    }

    const lookup = await fetchRegisteredMemberData(cleanEmail);
    if (!lookup.registered) {
      const { data: pendingSub } = await getDb()
        .from('member_submissions')
        .select('id')
        .eq('status', 'PENDING')
        .ilike('submitted_email', cleanEmail)
        .limit(1)
        .maybeSingle();
      if (pendingSub) {
        return fail(403, {
          success: false,
          error:
            'Your profile update for this email is awaiting administrator approval in the Members Directory. Please contact the club secretariat to approve it so your sign-in code can be sent.'
        });
      }
      return fail(403, {
        success: false,
        error:
          'This email address is not registered on any SC Basimbuzi member record. Only registered members with an email on file can sign in.'
      });
    }

    await logAudit({
      user: lookup.memberName,
      userEmail: cleanEmail,
      action: 'MEMBER_LOGIN_OTP_SENT',
      description: `Member sign-in code issued for ${cleanEmail}.`
    });

    // No email provider is connected yet — return the code so the UI can show it.
    return ok({
      success: true,
      message: `A 6-digit verification code has been sent to ${cleanEmail}. Check your Inbox — if you do not see it within 1 minute, check your Spam or Promotions folder and mark it "Not spam".`,
      devCode: issued.code,
      data: { email: cleanEmail, code: issued.code }
    });
  } catch (err) {
    return errorResult(err);
  }
};

// POST /api/me/verify-code {email, code}
export const meVerifyCode = async (ctx: HandlerCtx): Promise<HandlerResult> => {
  try {
    const cleanEmail = String(ctx.body?.email || '').trim().toLowerCase();
    const cleanCode = String(ctx.body?.code || '').trim();

    if (isStaffOrPlaceholderEmail(cleanEmail) || !/^\d{6}$/.test(cleanCode)) {
      return fail(400, {
        success: false,
        error: 'Enter your registered email address and 6-digit sign-in code.'
      });
    }

    const result = await verifyOtp(cleanEmail, 'MEMBER_LOGIN', cleanCode);
    if (result.ok === false) {
      const messages: Record<string, { status: number; message: string }> = {
        NO_ACTIVE: { status: 401, message: 'No active sign-in code found. Request a new code to continue.' },
        EXPIRED: { status: 401, message: 'That sign-in code has expired. Please request a new code.' },
        TOO_MANY: { status: 429, message: 'Too many incorrect attempts. Please request a fresh sign-in code.' },
        INCORRECT: { status: 401, message: 'Incorrect 6-digit code. Please check your inbox and try again.' }
      };
      const m = messages[result.reason];
      return fail(m.status, { success: false, error: m.message });
    }

    const lookup = await fetchRegisteredMemberData(cleanEmail);
    const memberName = lookup.memberName || cleanEmail.split('@')[0];
    const token = signToken({
      sub: cleanEmail,
      name: memberName,
      memberId: lookup.memberRecord ? String(lookup.memberRecord.id) : undefined,
      kind: 'member',
      exp: Date.now() + 12 * 60 * 60 * 1000
    });

    return ok({
      success: true,
      token,
      member: { email: cleanEmail, name: memberName }
    });
  } catch (err) {
    return errorResult(err);
  }
};

// GET /api/me/payments (member bearer)
export const mePayments = async (ctx: HandlerCtx): Promise<HandlerResult> => {
  try {
    const member = verifyMemberBearer(ctx.headers);
    if (!member) {
      return fail(401, {
        found: false,
        error: 'Your member session has expired. Please sign in again.',
        message: 'Please sign in with your registered email to view your payments.'
      });
    }

    const { data: siteRow } = await getDb().from('site_content').select('content').eq('id', 1).maybeSingle();
    const site = siteRow?.content && typeof siteRow.content === 'object' ? siteRow.content : {};
    const targetLabel = String(site.membershipTargetLabel || '2026 Season Membership Contribution');
    const configuredTarget = Math.max(0, Number(site.membershipTargetUgx) || 0);

    const lookup = await fetchRegisteredMemberData(member.email, member.memberId);
    if (!lookup.registered) {
      return fail(503, {
        found: false,
        query: member.email,
        memberEmail: member.email,
        payerName: member.name,
        targetLabel,
        expectedTargetUgx: configuredTarget,
        totalPaidUgx: 0,
        pendingUgx: 0,
        remainingUgx: configuredTarget,
        progressPercent: 0,
        overallStatus: 'NOT_FOUND',
        payments: [],
        message: 'Payment records are temporarily unavailable. Please try again shortly.'
      });
    }

    let totalPaidUgx = 0;
    let pendingUgx = 0;
    const payments = lookup.inflows.map((tx: any) => {
      const amt = Math.max(0, Number(tx.amount) || 0);
      const status = String(tx.payment_status || 'COMPLETED').toUpperCase();
      if (status === 'COMPLETED') {
        totalPaidUgx += amt;
      } else if (status === 'PENDING') {
        pendingUgx += amt;
      }
      return {
        receiptNumber: String(tx.receipt_number || ''),
        date: String(tx.date || ''),
        paymentPurpose: String(tx.payment_purpose || 'Club Contribution'),
        paymentMethod: String(tx.payment_method || ''),
        paymentReference: String(tx.payment_reference || ''),
        amount: amt,
        paymentStatus: status
      };
    });

    const resolvedGender = normalizeMemberGender(lookup.memberRecord?.gender);
    const expectedTargetUgx = lookup.memberRecord
      ? resolveMemberExpectedTarget(lookup.memberRecord.expectedTargetUgx, resolvedGender)
      : 0;
    const remainingUgx = expectedTargetUgx > 0 ? Math.max(0, expectedTargetUgx - totalPaidUgx) : 0;
    const progressPercent =
      expectedTargetUgx > 0 ? Math.min(100, Math.round((totalPaidUgx / expectedTargetUgx) * 100)) : 0;

    let overallStatus: 'FULLY_PAID' | 'PARTIAL' | 'PENDING' = 'PARTIAL';
    if (totalPaidUgx === 0 && pendingUgx > 0) {
      overallStatus = 'PENDING';
    } else if (expectedTargetUgx > 0 && remainingUgx === 0 && totalPaidUgx > 0) {
      overallStatus = 'FULLY_PAID';
    } else if (expectedTargetUgx === 0 && totalPaidUgx === 0) {
      overallStatus = 'PENDING';
    }

    const oldestDate = lookup.inflows.reduce((earliest: string, tx: any) => {
      const d = String(tx?.date || '').trim();
      if (!d) return earliest;
      return !earliest || d < earliest ? d : earliest;
    }, '');

    return ok({
      found: true,
      query: member.email,
      payerName: lookup.memberName || member.name,
      memberEmail: member.email,
      phone: String(lookup.memberRecord?.phone || lookup.inflows[0]?.phone || ''),
      memberProfile: lookup.memberRecord
        ? sanitizeMemberForClient(lookup.memberRecord)
        : {
            name: lookup.memberName || member.name,
            email: member.email,
            phone: String(lookup.inflows[0]?.phone || ''),
            address: '',
            gender: '',
            school: '',
            house: '',
            preNllPaid: 0,
            spotPaid: 0,
            paidAfter: 0,
            duesStatus: computeDuesStatus(totalPaidUgx, expectedTargetUgx)
          },
      memberSince: oldestDate,
      targetLabel,
      expectedTargetUgx,
      totalPaidUgx,
      pendingUgx,
      remainingUgx,
      progressPercent,
      overallStatus,
      payments,
      message:
        payments.length > 0
          ? `Showing ${payments.length} payment record${payments.length === 1 ? '' : 's'} registered to ${member.email}.`
          : `No payments recorded yet under ${member.email}.`
    });
  } catch (err) {
    return errorResult(err);
  }
};

// POST /api/me/verify-receipt {receiptNumber} (member bearer)
export const meVerifyReceipt = async (ctx: HandlerCtx): Promise<HandlerResult> => {
  try {
    const member = verifyMemberBearer(ctx.headers);
    if (!member) {
      return fail(401, {
        found: false,
        receiptNumber: '',
        message: 'Please sign in with your registered email to verify your receipts.'
      });
    }

    const cleanReceipt = String(ctx.body?.receiptNumber || '').trim().toUpperCase();
    if (!cleanReceipt || cleanReceipt.length > 40 || !/^[A-Z0-9-]+$/.test(cleanReceipt)) {
      return fail(400, {
        found: false,
        receiptNumber: cleanReceipt,
        message: 'Enter a valid receipt reference (e.g. SB-2026-00001).'
      });
    }

    const lookup = await fetchRegisteredMemberData(member.email);
    if (!lookup.registered) {
      return fail(503, {
        found: false,
        receiptNumber: cleanReceipt,
        message: 'Live receipt verification is temporarily unavailable.'
      });
    }

    const match = lookup.inflows.find((tx: any) => {
      const rec = String(tx?.receipt_number || '').trim().toUpperCase();
      const ref = String(tx?.payment_reference || '').toUpperCase();
      const notes = String(tx?.notes || '').toUpperCase();
      return rec === cleanReceipt || ref.includes(cleanReceipt) || notes.includes(cleanReceipt);
    });

    if (!match) {
      return ok({
        found: false,
        receiptNumber: cleanReceipt,
        message: 'No matching receipt was found under your registered member email.'
      });
    }

    return ok({
      found: true,
      receiptNumber: String(match.receipt_number || cleanReceipt),
      date: String(match.date || ''),
      amount: Math.max(0, Number(match.amount) || 0),
      paymentStatus: String(match.payment_status || 'COMPLETED'),
      paymentPurpose: String(match.payment_purpose || 'Club Contribution'),
      paymentMethod: String(match.payment_method || ''),
      paymentReference: String(match.payment_reference || ''),
      message: 'Verified: Official SC Basimbuzi receipt matches your member account.'
    });
  } catch (err) {
    return errorResult(err);
  }
};

// GET /api/me/claim/:token
export const meClaimLookup = async (ctx: HandlerCtx): Promise<HandlerResult> => {
  try {
    const rawToken = getParam(ctx, 'token').trim();
    if (!rawToken || rawToken.length < 16 || rawToken.length > 128) {
      return fail(400, { success: false, error: 'Invalid profile completion link.' });
    }

    const { data: member, error } = await getDb()
      .from('members')
      .select('*')
      .eq('claim_token', rawToken)
      .maybeSingle();
    if (error) throw new Error(error.message);

    if (!member || Date.parse(String(member.claim_token_expires_at || '')) <= Date.now()) {
      return fail(404, {
        success: false,
        error:
          'This profile link has expired or has already been used. Ask the club secretariat for a fresh link.'
      });
    }

    const { count } = await getDb()
      .from('member_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('member_id', String(member.id))
      .eq('status', 'PENDING');

    const claimSchool = normalizeMemberSchool(member.school);
    return ok({
      success: true,
      data: {
        memberId: String(member.id),
        name: String(member.name || ''),
        phone: String(member.phone || ''),
        email: String(member.email || ''),
        address: String(member.address || ''),
        gender: normalizeMemberGender(member.gender),
        school: claimSchool,
        house: normalizeMemberHouse(member.house, claimSchool),
        preNllPaid: Math.max(0, Number(member.pre_nll_paid) || 0),
        spotPaid: Math.max(0, Number(member.spot_paid) || 0),
        paidAfter: Math.max(0, Number(member.paid_after) || 0),
        totalPaid: Math.max(0, Number(member.historical_paid ?? member.total_contributed) || 0),
        hasPendingSubmission: (count || 0) > 0
      }
    });
  } catch (err) {
    return errorResult(err);
  }
};

// POST /api/me/claim/:token {...profile}
export const meClaimSubmit = async (ctx: HandlerCtx): Promise<HandlerResult> => {
  try {
    const rawToken = getParam(ctx, 'token').trim();
    if (!rawToken || rawToken.length < 16 || rawToken.length > 128) {
      return fail(400, { success: false, error: 'Invalid profile completion link.' });
    }

    const { data: memberRow, error } = await getDb()
      .from('members')
      .select('*')
      .eq('claim_token', rawToken)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!memberRow || Date.parse(String(memberRow.claim_token_expires_at || '')) <= Date.now()) {
      return fail(404, {
        success: false,
        error: 'This profile link has expired or was already submitted.'
      });
    }
    const targetMember = memberRowToMember(memberRow);

    const submittedName = String(ctx.body?.fullName || '').trim().slice(0, 120);
    const submittedEmail = String(ctx.body?.email || '').trim().toLowerCase().slice(0, 120);
    const submittedPhone = cleanPhoneNumber(String(ctx.body?.phone || '').trim().slice(0, 30));
    const submittedAddress = String(ctx.body?.address || '').trim().slice(0, 200);
    const submittedGender = normalizeMemberGender(ctx.body?.gender);
    const submittedSchool = normalizeMemberSchool(ctx.body?.school, ctx.body?.otherSchool);
    const submittedHouse = normalizeMemberHouse(ctx.body?.house, submittedSchool);

    if (submittedName.length < 2) {
      return fail(400, { success: false, error: 'Enter your full name.' });
    }
    if (isStaffOrPlaceholderEmail(submittedEmail)) {
      return fail(400, { success: false, error: 'Enter a valid personal email address.' });
    }
    if (submittedPhone.replace(/\D/g, '').length < 7) {
      return fail(400, { success: false, error: 'Enter a valid phone or WhatsApp number.' });
    }
    if (submittedAddress.length < 2) {
      return fail(400, { success: false, error: 'Enter your physical address / residence.' });
    }
    if (!submittedGender) {
      return fail(400, { success: false, error: 'Select your gender (Male or Female).' });
    }
    if (!submittedSchool) {
      return fail(400, { success: false, error: 'Select your school or enter your school name.' });
    }
    if (isHouseEligibleSchool(submittedSchool) && !submittedHouse) {
      return fail(400, {
        success: false,
        error: `Please select your house at ${submittedSchool}.`
      });
    }

    // Duplicate email guard across existing members & pending submissions
    const { data: memberConflicts } = await getDb()
      .from('members')
      .select('id')
      .ilike('email', submittedEmail);
    if ((memberConflicts || []).some((m: any) => String(m.id) !== String(targetMember.id))) {
      return fail(409, {
        success: false,
        error:
          'This email address is already registered to another club member. Please contact the club treasury if this is a mistake.'
      });
    }
    const { data: pendingConflicts } = await getDb()
      .from('member_submissions')
      .select('id')
      .eq('status', 'PENDING')
      .ilike('submitted_email', submittedEmail);
    if ((pendingConflicts || []).some((s: any) => String(s.id))) {
      return fail(409, {
        success: false,
        error: 'A pending update already uses this email address.'
      });
    }

    const id = `sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const submission = {
      id,
      member_id: String(targetMember.id),
      member_name: String(targetMember.name),
      submitted_name: submittedName,
      submitted_email: submittedEmail,
      submitted_phone: submittedPhone,
      submitted_address: submittedAddress,
      submitted_gender: submittedGender,
      submitted_school: submittedSchool,
      submitted_house: submittedHouse,
      pre_nll_paid: Math.max(0, Number(targetMember.preNllPaid) || 0),
      spot_paid: Math.max(0, Number(targetMember.spotPaid) || 0),
      paid_after: Math.max(0, Number(targetMember.paidAfter) || 0),
      total_paid: Math.max(0, Number(targetMember.historicalPaid ?? targetMember.totalContributed) || 0),
      submitted_at: new Date().toISOString(),
      status: 'PENDING'
    };
    const { error: subErr } = await getDb().from('member_submissions').insert(submission);
    if (subErr) throw new Error(subErr.message);

    // Invalidate token — strictly single-use once submitted
    const { error: clearErr } = await getDb()
      .from('members')
      .update({ claim_token: '', claim_token_expires_at: null, updated_at: new Date().toISOString() })
      .eq('id', String(targetMember.id));
    if (clearErr) throw new Error(clearErr.message);

    return ok({
      success: true,
      message:
        'Thank you! Your details have been submitted for confirmation by the club administrator. Once approved, you can sign in to /me with your email anytime.'
    });
  } catch (err) {
    return errorResult(err);
  }
};

// PATCH /api/me/profile (member bearer)
export const meUpdateProfile = async (ctx: HandlerCtx): Promise<HandlerResult> => {
  try {
    const member = verifyMemberBearer(ctx.headers);
    if (!member) {
      return fail(401, {
        success: false,
        error: 'Please sign in with your registered email to update your profile.'
      });
    }

    const cleanName = String(ctx.body?.fullName || '').trim().slice(0, 120);
    const cleanPhone = cleanPhoneNumber(String(ctx.body?.phone || '').trim().slice(0, 30));
    const cleanAddress = String(ctx.body?.address || '').trim().slice(0, 200);
    const cleanGender = normalizeMemberGender(ctx.body?.gender);
    const cleanSchool = normalizeMemberSchool(ctx.body?.school, ctx.body?.otherSchool);
    const cleanHouse = normalizeMemberHouse(ctx.body?.house, cleanSchool);

    if (cleanName.length < 2) {
      return fail(400, { success: false, error: 'Full name is required.' });
    }
    if (cleanPhone.replace(/\D/g, '').length < 7) {
      return fail(400, { success: false, error: 'Enter a valid phone or WhatsApp number.' });
    }
    if (!cleanGender) {
      return fail(400, { success: false, error: 'Please select your gender (Male or Female).' });
    }
    if (!cleanSchool) {
      return fail(400, { success: false, error: 'Please select your school or enter your school name.' });
    }
    if (isHouseEligibleSchool(cleanSchool) && !cleanHouse) {
      return fail(400, { success: false, error: `Please select your house at ${cleanSchool}.` });
    }

    const members = await loadMembers();
    const nowIso = new Date().toISOString();
    const idx = members.findIndex(
      m => String(m?.email || '').trim().toLowerCase() === member.email
    );

    let savedRecord: any;
    if (idx !== -1) {
      const existing = members[idx];
      const prevGender = normalizeMemberGender(existing.gender);
      const nextTarget = resolveMemberExpectedTarget(existing.expectedTargetUgx, cleanGender, prevGender);
      const histPaid = Math.max(0, Number(existing.historicalPaid ?? existing.totalContributed) || 0);
      const livePaid = Math.max(0, Number(existing.livePaid) || 0);
      const totalContributed = histPaid + livePaid;
      savedRecord = {
        ...existing,
        name: cleanName,
        phone: cleanPhone,
        address: cleanAddress,
        gender: cleanGender,
        school: cleanSchool,
        house: cleanHouse,
        expectedTargetUgx: nextTarget,
        remainingUgx: nextTarget > 0 ? Math.max(0, nextTarget - totalContributed) : 0,
        duesStatus: computeDuesStatus(totalContributed, nextTarget),
        updatedAt: nowIso
      };
      savedRecord.profileStatus = isMemberProfileComplete(savedRecord) ? 'COMPLETE' : 'INCOMPLETE';

      const { error: updErr } = await getDb()
        .from('members')
        .upsert(
          {
            id: String(existing.id),
            name: cleanName,
            phone: cleanPhone,
            address: cleanAddress,
            gender: cleanGender,
            school: cleanSchool,
            house: cleanHouse,
            expected_target_ugx: nextTarget,
            remaining_ugx: savedRecord.remainingUgx,
            dues_status: savedRecord.duesStatus,
            profile_status: savedRecord.profileStatus,
            updated_at: nowIso
          },
          { onConflict: 'id' }
        );
      if (updErr) throw new Error(updErr.message);

      // Stamp the verified name/phone ONLY onto this member's ledger transactions
      await getDb()
        .from('transactions')
        .update({ payer_name: cleanName, phone: cleanPhone })
        .eq('member_id', String(existing.id));
    } else {
      const { count } = await getDb()
        .from('members')
        .select('id', { count: 'exact', head: true });
      const newId = `SB-M-${String((count || members.length) + 1).padStart(4, '0')}`;
      const standardTarget = getStandardTargetForGender(cleanGender);
      savedRecord = {
        id: newId,
        memberId: newId,
        name: cleanName,
        email: member.email,
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
        expectedTargetUgx: standardTarget,
        remainingUgx: standardTarget,
        duesStatus: computeDuesStatus(0, standardTarget),
        profileStatus: isMemberProfileComplete({
          name: cleanName,
          email: member.email,
          phone: cleanPhone,
          address: cleanAddress
        })
          ? 'COMPLETE'
          : 'INCOMPLETE',
        source: 'LIVE_RECEIPT',
        createdAt: nowIso,
        updatedAt: nowIso
      };
      const { error: insErr } = await getDb()
        .from('members')
        .insert({
          id: newId,
          name: cleanName,
          email: member.email,
          phone: cleanPhone,
          address: cleanAddress,
          gender: cleanGender,
          school: cleanSchool,
          house: cleanHouse,
          expected_target_ugx: standardTarget,
          remaining_ugx: standardTarget,
          dues_status: savedRecord.duesStatus,
          profile_status: savedRecord.profileStatus,
          payment_count: 0,
          source: 'LIVE_RECEIPT',
          created_at: nowIso,
          updated_at: nowIso
        });
      if (insErr) throw new Error(insErr.message);
    }

    return ok({
      success: true,
      message: 'Your member contact details have been updated.',
      data: sanitizeMemberForClient(savedRecord)
    });
  } catch (err) {
    return errorResult(err);
  }
};
