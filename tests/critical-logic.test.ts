import { test, describe } from 'node:test';
import assert from 'node:assert';
import { 
  escapeHtml, 
  isValidEmail, 
  isValidPhone, 
  isValidAmount, 
  isValidReceiptNumber, 
  isValidGasUrl,
  resolveSafeMediaUrl
} from '../src/utils/security';
import { resolveUserPermissions, getDefaultPermissions, User } from '../src/types';

describe('Security & Data Validation Tests', () => {
  test('escapeHtml prevents XSS and template injection', () => {
    assert.strictEqual(
      escapeHtml('<script>alert("hack")</script>'),
      '&lt;script&gt;alert(&quot;hack&quot;)&lt;/script&gt;'
    );
    assert.strictEqual(
      escapeHtml('John & Sons <img src=x onerror=alert(1)>'),
      'John &amp; Sons &lt;img src=x onerror=alert(1)&gt;'
    );
    assert.strictEqual(escapeHtml("O'Connor"), 'O&#039;Connor');
    assert.strictEqual(escapeHtml(null), '');
    assert.strictEqual(escapeHtml(undefined), '');
  });

  test('isValidEmail handles valid and invalid emails', () => {
    assert.strictEqual(isValidEmail('nagabapassion@gmail.com'), true);
    assert.strictEqual(isValidEmail('member.test@scbasimbuzi.org'), true);
    assert.strictEqual(isValidEmail('invalid-email'), false);
    assert.strictEqual(isValidEmail('@missinguser.com'), false);
    assert.strictEqual(isValidEmail('user@missingtld'), false);
    assert.strictEqual(isValidEmail(''), false);
    assert.strictEqual(isValidEmail(null), false);
  });

  test('isValidPhone handles international and Ugandan phone formats', () => {
    assert.strictEqual(isValidPhone('+256 700 123456'), true);
    assert.strictEqual(isValidPhone('0772123456'), true);
    assert.strictEqual(isValidPhone('+1 (555) 234-5678'), true);
    assert.strictEqual(isValidPhone(''), true); // Optional field
    assert.strictEqual(isValidPhone('abc12345'), false);
    assert.strictEqual(isValidPhone('123'), false); // Too short
  });

  test('isValidAmount rejects negative numbers, zero, and out-of-range values', () => {
    assert.strictEqual(isValidAmount(50000), true);
    assert.strictEqual(isValidAmount(100), true);
    assert.strictEqual(isValidAmount(1000000), true);
    assert.strictEqual(isValidAmount(0), false);
    assert.strictEqual(isValidAmount(-500), false);
    assert.strictEqual(isValidAmount(NaN), false);
    assert.strictEqual(isValidAmount(Infinity), false);
    assert.strictEqual(isValidAmount(99999999999), false); // Exceeds upper threshold
  });

  test('isValidReceiptNumber verifies expected format PREFIX-YYYY-00001', () => {
    assert.strictEqual(isValidReceiptNumber('SB-2026-00001'), true);
    assert.strictEqual(isValidReceiptNumber('SB-2026-99999'), true);
    assert.strictEqual(isValidReceiptNumber('SB-2025-00123'), true);
    assert.strictEqual(isValidReceiptNumber('INVALID-NUM'), false);
    assert.strictEqual(isValidReceiptNumber('SB-26-001'), false);
    assert.strictEqual(isValidReceiptNumber('XX-2026-00001', 'SB'), false);
  });

  test('isValidGasUrl enforces valid Google Apps Script Web App endpoints', () => {
    assert.strictEqual(isValidGasUrl('https://script.google.com/macros/s/AKfycbytest123456/exec'), true);
    assert.strictEqual(isValidGasUrl(''), true); // Empty disconnect is valid
    assert.strictEqual(isValidGasUrl('javascript:alert(1)'), false);
    assert.strictEqual(isValidGasUrl('https://malicious-site.com/exec'), false);
    assert.strictEqual(isValidGasUrl('http://insecure-site.com'), false);
  });
});

describe('User Permissions & RBAC Tests', () => {
  test('Owner has full permissions', () => {
    const owner: User = {
      name: 'Nagaba Passion',
      email: 'nagabapassion@gmail.com',
      role: 'OWNER',
      status: 'ACTIVE',
      createdAt: '2026-01-01'
    };
    const perms = resolveUserPermissions(owner);
    assert.strictEqual(perms.canIssueReceipts, true);
    assert.strictEqual(perms.canDeleteTransactions, true);
    assert.strictEqual(perms.canViewReports, true);
    assert.strictEqual(perms.canManageUsers, true);
    assert.strictEqual(perms.canEditSettings, true);
    assert.strictEqual(perms.canEditMembers, true);
  });

  test('Admin can view reports and delete transactions but cannot edit settings or manage users by default', () => {
    const admin: User = {
      name: 'Admin User',
      email: 'admin@scbasimbuzi.org',
      role: 'ADMIN',
      status: 'ACTIVE',
      createdAt: '2026-01-01'
    };
    const perms = resolveUserPermissions(admin);
    assert.strictEqual(perms.canIssueReceipts, true);
    assert.strictEqual(perms.canDeleteTransactions, true);
    assert.strictEqual(perms.canViewReports, true);
    assert.strictEqual(perms.canManageUsers, false);
    assert.strictEqual(perms.canEditSettings, false);
    assert.strictEqual(perms.canEditMembers, true);
  });

  test('Issuer can only issue receipts and search; cannot edit settings/backend or member details by default', () => {
    const issuer: User = {
      name: 'Cashier',
      email: 'cashier@scbasimbuzi.org',
      role: 'ISSUER',
      status: 'ACTIVE',
      createdAt: '2026-01-01'
    };
    const perms = resolveUserPermissions(issuer);
    assert.strictEqual(perms.canIssueReceipts, true);
    assert.strictEqual(perms.canDeleteTransactions, false);
    assert.strictEqual(perms.canViewReports, false);
    assert.strictEqual(perms.canManageUsers, false);
    assert.strictEqual(perms.canEditSettings, false);
    assert.strictEqual(perms.canEditMembers, false);
  });

  test('Issuer with custom permission capability can be granted member edit privileges', () => {
    const customIssuer: User = {
      name: 'Senior Cashier',
      email: 'seniorcashier@scbasimbuzi.org',
      role: 'ISSUER',
      status: 'ACTIVE',
      permissions: {
        canIssueReceipts: true,
        canDeleteTransactions: false,
        canViewReports: false,
        canManageUsers: false,
        canEditSettings: false,
        canEditMembers: true
      },
      createdAt: '2026-01-01'
    };
    const perms = resolveUserPermissions(customIssuer);
    assert.strictEqual(perms.canIssueReceipts, true);
    assert.strictEqual(perms.canEditSettings, false);
    assert.strictEqual(perms.canEditMembers, true);
  });

  test('Unauthenticated user has zero permissions', () => {
    const perms = resolveUserPermissions(null);
    assert.strictEqual(perms.canIssueReceipts, false);
    assert.strictEqual(perms.canDeleteTransactions, false);
    assert.strictEqual(perms.canViewReports, false);
    assert.strictEqual(perms.canManageUsers, false);
    assert.strictEqual(perms.canEditSettings, false);
    assert.strictEqual(perms.canEditMembers, false);
  });
});

import {
  cleanPhoneNumber,
  isStaffOrPlaceholderEmail,
  resolveCanonicalMemberNameKey,
  PRE_CSV_COVERED_GAS_RECEIPTS,
  PRE_CSV_COVERED_RECEIPT_SET,
  UNRECORDED_LIVE_GAS_RECEIPTS,
  computeLedgerMetrics,
  compareTransactions
} from '../src/utils/ledgerReconciliation';
import {
  MALE_STANDARD_TARGET_UGX,
  FEMALE_STANDARD_TARGET_UGX,
  getStandardTargetForGender,
  resolveMemberExpectedTarget,
  computeDuesStatus,
  parseUgxAmount,
  NTARE_SCHOOL,
  BWERANYAGYI_SCHOOL,
  HOUSE_OPTIONS,
  isHouseEligibleSchool,
  normalizeMemberGender,
  normalizeMemberSchool,
  resolveSchoolFormState,
  normalizeMemberHouse,
  mergeMemberDirectories
} from '../src/utils/memberImport';

describe('Financial Ledger & Member Reconciliation Tests', () => {
  test('computeLedgerMetrics separates inflows, outflows, opening balance, and ignores CANCELLED rows', () => {
    const metrics = computeLedgerMetrics(
      [
        { receiptNumber: 'HIST-0001', type: 'INFLOW', amount: 100000, paymentStatus: 'COMPLETED', syncStatus: 'SYNCED' },
        { receiptNumber: 'SB-2026-00070', type: 'INFLOW', amount: 50000, paymentStatus: 'COMPLETED', syncStatus: 'PENDING' },
        { receiptNumber: 'EXP-2026-00001', type: 'OUTFLOW', amount: 35000, paymentStatus: 'COMPLETED', syncStatus: 'SYNCED' },
        { receiptNumber: 'SB-2026-00071', type: 'INFLOW', amount: 999999, paymentStatus: 'CANCELLED', syncStatus: 'FAILED' }
      ],
      250000
    );

    assert.strictEqual(metrics.openingBalance, 250000);
    assert.strictEqual(metrics.totalInflow, 150000);
    assert.strictEqual(metrics.totalOutflow, 35000);
    assert.strictEqual(metrics.netBalance, 365000);
    assert.strictEqual(metrics.inflowCount, 2);
    assert.strictEqual(metrics.outflowCount, 1);
    assert.strictEqual(metrics.syncedCount, 2);
    assert.strictEqual(metrics.pendingSyncCount, 1);
    assert.strictEqual(metrics.failedSyncCount, 0);
  });

  test('Mission NLL covered GAS receipts dedup invariant matches exact 38 receipts and 629,000 UGX', () => {
    assert.strictEqual(PRE_CSV_COVERED_GAS_RECEIPTS.length, 38);
    assert.strictEqual(PRE_CSV_COVERED_RECEIPT_SET.size, 38);
    const coveredTotal = PRE_CSV_COVERED_GAS_RECEIPTS.reduce((sum, r) => sum + r.amount, 0);
    assert.strictEqual(coveredTotal, 629000);

    // Ensure zero overlap between covered and unrecorded live receipts
    for (const unrec of UNRECORDED_LIVE_GAS_RECEIPTS) {
      assert.strictEqual(PRE_CSV_COVERED_RECEIPT_SET.has(unrec.receiptNumber.toUpperCase()), false);
    }
  });

  test('cleanPhoneNumber removes bidi marks and normalizes Ugandan numbers', () => {
    assert.strictEqual(cleanPhoneNumber('\u202A0772123456\u202C'), '+256772123456');
    assert.strictEqual(cleanPhoneNumber('256 700 123-456'), '+256700123456');
    assert.strictEqual(cleanPhoneNumber('755432109'), '+256755432109');
    assert.strictEqual(cleanPhoneNumber('+254113952273'), '+254113952273');
    assert.strictEqual(cleanPhoneNumber(''), '');
  });

  test('isStaffOrPlaceholderEmail strips synthetic and misattributed staff emails while allowing owner own payments', () => {
    assert.strictEqual(isStaffOrPlaceholderEmail('noreply@whatsapp.direct', 'Sarah Namubiru'), true);
    assert.strictEqual(isStaffOrPlaceholderEmail('no-reply@scbasimbuzi.org', 'Sarah Namubiru'), true);
    assert.strictEqual(isStaffOrPlaceholderEmail('jotham.itubgo@gmail.com', 'Reagan Lutakome'), true);
    assert.strictEqual(isStaffOrPlaceholderEmail('nagabapassion@gmail.com', 'Ssenyange Eriya'), true);
    assert.strictEqual(isStaffOrPlaceholderEmail('nagabapassion@gmail.com', 'Nagaba Passion'), false);
    assert.strictEqual(isStaffOrPlaceholderEmail('sarah.real@gmail.com', 'Sarah Namubiru'), false);
    assert.strictEqual(isStaffOrPlaceholderEmail('custom.admin@club.org', 'John Doe', ['custom.admin@club.org']), true);
  });

  test('resolveCanonicalMemberNameKey unifies inverted & alias payer names', () => {
    assert.strictEqual(resolveCanonicalMemberNameKey('Atweta Ben'), 'atweeta ben');
    assert.strictEqual(resolveCanonicalMemberNameKey('Shadrack   Asiimwe'), 'asiimwe shadrack');
    assert.strictEqual(resolveCanonicalMemberNameKey('Brason'), 'ahamya brason');
    assert.strictEqual(resolveCanonicalMemberNameKey('Grace Mpora'), 'mpora grace');
  });

  test('computeDuesStatus & parseUgxAmount handle member balance edge cases', () => {
    assert.strictEqual(parseUgxAmount('UGX 125,000'), 125000);
    assert.strictEqual(parseUgxAmount('—'), 0);
    assert.strictEqual(computeDuesStatus(100000, 100000), 'Paid');
    assert.strictEqual(computeDuesStatus(150000, 100000), 'Paid');
    assert.strictEqual(computeDuesStatus(50000, 100000), 'Partial');
    assert.strictEqual(computeDuesStatus(0, 100000), 'Overdue');
    assert.strictEqual(computeDuesStatus(0, 0), 'Pending Target');
    assert.strictEqual(computeDuesStatus(50000, 0), 'Pending Target');
  });

  test('compareTransactions orders latest receipts ahead regardless of input order or single-digit times', () => {
    const manzi = { receiptNumber: 'SB-2026-00065', date: '2026-11-21', time: '22:22:20' };
    const earlierExp = { receiptNumber: 'EXP-2026-00007', date: '2026-11-21', time: '22:15:42' };
    const morning = { receiptNumber: 'SB-2026-00064', date: '2026-11-21', time: '9:05:00' };
    const midMorning = { receiptNumber: 'SB-2026-00063', date: '2026-11-21', time: '10:00:00' };

    const sortedDesc = [earlierExp, morning, manzi, midMorning].sort((a, b) => compareTransactions(a, b, 'desc'));
    assert.deepStrictEqual(
      sortedDesc.map(r => r.receiptNumber),
      ['SB-2026-00065', 'EXP-2026-00007', 'SB-2026-00063', 'SB-2026-00064']
    );

    const sortedAsc = [manzi, earlierExp].sort((a, b) => compareTransactions(a, b, 'asc'));
    assert.deepStrictEqual(
      sortedAsc.map(r => r.receiptNumber),
      ['EXP-2026-00007', 'SB-2026-00065']
    );
  });
});

describe('Expanded Membership Profile Helpers (Gender, School & Conditional House)', () => {
  test('normalizeMemberGender accepts Male/Female variants and rejects invalid values', () => {
    assert.strictEqual(normalizeMemberGender('Male'), 'Male');
    assert.strictEqual(normalizeMemberGender('m'), 'Male');
    assert.strictEqual(normalizeMemberGender('Female'), 'Female');
    assert.strictEqual(normalizeMemberGender('F'), 'Female');
    assert.strictEqual(normalizeMemberGender('unknown'), '');
    assert.strictEqual(normalizeMemberGender(''), '');
  });

  test('normalizeMemberSchool & resolveSchoolFormState handle Ntare, Bweranyagyi, and Other schools', () => {
    assert.strictEqual(normalizeMemberSchool('Ntare School'), NTARE_SCHOOL);
    assert.strictEqual(normalizeMemberSchool('ntare'), NTARE_SCHOOL);
    assert.strictEqual(normalizeMemberSchool("Bweranyagyi Girls\u2019 Secondary School"), BWERANYAGYI_SCHOOL);
    assert.strictEqual(normalizeMemberSchool('Other', 'Makerere College School'), 'Makerere College School');
    assert.strictEqual(normalizeMemberSchool('Other', ''), '');
    assert.strictEqual(normalizeMemberSchool('30000'), '');
    assert.strictEqual(normalizeMemberSchool('100,000'), '');
    assert.strictEqual(normalizeMemberSchool('Supporter'), '');
    assert.strictEqual(normalizeMemberSchool('INCOMPLETE'), '');

    assert.deepStrictEqual(resolveSchoolFormState(NTARE_SCHOOL), {
      schoolChoice: NTARE_SCHOOL,
      otherSchool: ''
    });
    assert.deepStrictEqual(resolveSchoolFormState(BWERANYAGYI_SCHOOL), {
      schoolChoice: BWERANYAGYI_SCHOOL,
      otherSchool: ''
    });
    assert.deepStrictEqual(resolveSchoolFormState('Makerere College School'), {
      schoolChoice: 'Other',
      otherSchool: 'Makerere College School'
    });
  });

  test('normalizeMemberHouse enforces official 11-house list only for Ntare and Bweranyagyi schools', () => {
    assert.strictEqual(HOUSE_OPTIONS.length, 11);
    assert.strictEqual(isHouseEligibleSchool(NTARE_SCHOOL), true);
    assert.strictEqual(isHouseEligibleSchool(BWERANYAGYI_SCHOOL), true);
    assert.strictEqual(isHouseEligibleSchool('Makerere College School'), false);
    assert.strictEqual(isHouseEligibleSchool('Other'), false);

    assert.strictEqual(normalizeMemberHouse('Africa House', NTARE_SCHOOL), 'Africa House');
    assert.strictEqual(normalizeMemberHouse('aggrey', NTARE_SCHOOL), 'Aggrey House');
    assert.strictEqual(normalizeMemberHouse('Bangizi Jed', BWERANYAGYI_SCHOOL), 'Bangizi Jed');
    assert.strictEqual(normalizeMemberHouse('Kamugungunu', BWERANYAGYI_SCHOOL), 'Kamugungunu');
    assert.strictEqual(normalizeMemberHouse('Unlisted House', NTARE_SCHOOL), '');
    assert.strictEqual(normalizeMemberHouse('Aggrey House', 'Makerere College School'), '');
    assert.strictEqual(normalizeMemberHouse('Aggrey House', 'Other'), '');
    assert.strictEqual(normalizeMemberHouse('Aggrey House', ''), '');
  });

  test('mergeMemberDirectories recovers saved Google Sheets details over stale local JSON and keeps newer local edits', () => {
    const localMembers = [
      {
        id: 'SB-M-0200',
        memberId: 'SB-M-0200',
        name: 'Nagaba Passion',
        phone: '',
        email: '',
        address: '',
        tier: 'Supporter',
        preNllPaid: 30000,
        spotPaid: 50000,
        paidAfter: 20000,
        historicalPaid: 100000,
        livePaid: 0,
        totalContributed: 100000,
        expectedTargetUgx: 100000,
        profileStatus: 'INCOMPLETE',
        updatedAt: '2026-11-21T18:17:00.000Z'
      },
      {
        id: 'SB-M-0201',
        memberId: 'SB-M-0201',
        name: 'John Doe',
        phone: '+256772111222',
        email: 'john.new@gmail.com',
        address: 'Ntare',
        gender: 'Male',
        school: NTARE_SCHOOL,
        house: 'Aggrey House',
        historicalPaid: 100000,
        expectedTargetUgx: 100000,
        profileStatus: 'COMPLETE',
        updatedAt: '2026-11-22T10:00:00.000Z'
      }
    ];

    const remoteMembers = [
      {
        id: 'SB-M-0200',
        memberId: 'SB-M-0200',
        name: 'Nagaba Passion',
        phone: '+256703643759',
        email: 'nagabapassion@gmail.com',
        address: 'Kampala road',
        gender: 'Male',
        school: NTARE_SCHOOL,
        house: 'Pioneer House',
        historicalPaid: 100000,
        profileStatus: 'COMPLETE',
        updatedAt: '2026-11-22T08:26:33.987Z'
      },
      {
        id: 'SB-M-0201',
        memberId: 'SB-M-0201',
        name: 'John Doe',
        phone: '+256772111222',
        email: 'john.old@gmail.com',
        address: 'Old Town',
        gender: '',
        school: '',
        house: '',
        historicalPaid: 100000,
        profileStatus: 'COMPLETE',
        updatedAt: '2026-11-21T12:00:00.000Z'
      }
    ];

    const result = mergeMemberDirectories(localMembers, remoteMembers, 0);
    assert.strictEqual(result.changed, true);
    assert.strictEqual(result.contactUpdatedMemberIds.includes('SB-M-0200'), true);

    const nagaba = result.members.find(m => m.id === 'SB-M-0200');
    assert.strictEqual(nagaba.phone, '+256703643759');
    assert.strictEqual(nagaba.email, 'nagabapassion@gmail.com');
    assert.strictEqual(nagaba.address, 'Kampala road');
    assert.strictEqual(nagaba.gender, 'Male');
    assert.strictEqual(nagaba.expectedTargetUgx, MALE_STANDARD_TARGET_UGX);
    assert.strictEqual(nagaba.school, NTARE_SCHOOL);
    assert.strictEqual(nagaba.house, 'Pioneer House');
    assert.strictEqual(nagaba.profileStatus, 'COMPLETE');
    assert.strictEqual('tier' in nagaba, false);

    const john = result.members.find(m => m.id === 'SB-M-0201');
    assert.strictEqual(john.email, 'john.new@gmail.com');
    assert.strictEqual(john.address, 'Ntare');
    assert.strictEqual(john.house, 'Aggrey House');
    assert.strictEqual(john.expectedTargetUgx, MALE_STANDARD_TARGET_UGX);
  });

  test('gender-based standard expected target assigns 50,000 for Male, 30,000 for Female, and 0 until gender is filled', () => {
    assert.strictEqual(MALE_STANDARD_TARGET_UGX, 50000);
    assert.strictEqual(FEMALE_STANDARD_TARGET_UGX, 30000);
    assert.strictEqual(getStandardTargetForGender('Male'), 50000);
    assert.strictEqual(getStandardTargetForGender('Female'), 30000);
    assert.strictEqual(getStandardTargetForGender(''), 0);

    // Legacy 100,000 with empty gender clears to 0 until gender is filled
    assert.strictEqual(resolveMemberExpectedTarget(100000, ''), 0);
    // Filling gender inserts standard target automatically
    assert.strictEqual(resolveMemberExpectedTarget(0, 'Male', ''), 50000);
    assert.strictEqual(resolveMemberExpectedTarget(0, 'Female', ''), 30000);
    // Switching gender updates standard target
    assert.strictEqual(resolveMemberExpectedTarget(50000, 'Female', 'Male'), 30000);
    assert.strictEqual(resolveMemberExpectedTarget(30000, 'Male', 'Female'), 50000);

    const local = [
      {
        id: 'SB-M-0301',
        name: 'Pending Gender Member',
        gender: '',
        expectedTargetUgx: 100000,
        historicalPaid: 10000,
        updatedAt: '2026-11-22T09:00:00.000Z'
      },
      {
        id: 'SB-M-0302',
        name: 'Female Member Updated',
        gender: '',
        expectedTargetUgx: 0,
        historicalPaid: 30000,
        updatedAt: '2026-11-22T09:00:00.000Z'
      }
    ];
    const remote = [
      {
        id: 'SB-M-0301',
        name: 'Pending Gender Member',
        gender: '',
        expectedTargetUgx: 100000,
        historicalPaid: 10000,
        updatedAt: '2026-11-22T10:00:00.000Z'
      },
      {
        id: 'SB-M-0302',
        name: 'Female Member Updated',
        gender: 'Female',
        expectedTargetUgx: 0,
        historicalPaid: 30000,
        updatedAt: '2026-11-22T10:00:00.000Z'
      }
    ];

    const merged = mergeMemberDirectories(local, remote, 0);
    const pending = merged.members.find(m => m.id === 'SB-M-0301');
    const female = merged.members.find(m => m.id === 'SB-M-0302');
    assert.strictEqual(pending.expectedTargetUgx, 0);
    assert.strictEqual(female.expectedTargetUgx, 30000);
  });

  test('mergeMemberDirectories blocks corrupted shifted Google Sheets rows from injecting Supporter/amounts into gender/school', () => {
    const local = [
      {
        id: 'SB-M-0400',
        name: 'Shifted Protection Test',
        phone: '',
        email: '',
        address: '',
        gender: '',
        school: '',
        house: '',
        preNllPaid: 30000,
        spotPaid: 0,
        paidAfter: 0,
        historicalPaid: 30000,
        expectedTargetUgx: 0,
        updatedAt: '2026-11-21T17:35:21.895Z'
      }
    ];
    const corruptedRemote = [
      {
        id: 'SB-M-0400',
        name: 'Shifted Protection Test',
        phone: '+256700111222',
        email: '',
        address: '',
        gender: 'Supporter',
        school: '30000',
        house: '',
        preNllPaid: 0,
        spotPaid: 30000,
        paidAfter: 30000,
        historicalPaid: 2026,
        expectedTargetUgx: 100000,
        updatedAt: '2026-11-22T18:00:00.000Z'
      }
    ];

    const res = mergeMemberDirectories(local, corruptedRemote, 0);
    const rec = res.members[0];
    assert.strictEqual(rec.phone, '+256700111222');
    assert.strictEqual(rec.gender, '');
    assert.strictEqual(rec.school, '');
    assert.strictEqual(rec.house, '');
    assert.strictEqual(rec.preNllPaid, 30000);
    assert.strictEqual(rec.spotPaid, 0);
    assert.strictEqual(rec.paidAfter, 0);
    assert.strictEqual(rec.historicalPaid, 30000);
    assert.strictEqual(rec.expectedTargetUgx, 0);
  });

  test('isStaffOrPlaceholderEmail & mergeMemberDirectories preserve registered staff users own member emails', () => {
    const owners = { 'treasurer.member@club.org': 'Kato Emmanuel' };
    assert.strictEqual(
      isStaffOrPlaceholderEmail('treasurer.member@club.org', 'Kato Emmanuel', ['treasurer.member@club.org'], owners),
      false
    );
    assert.strictEqual(
      isStaffOrPlaceholderEmail('treasurer.member@club.org', 'Other Member', ['treasurer.member@club.org'], owners),
      true
    );

    const local = [
      {
        id: 'SB-M-0280',
        name: 'Kato Emmanuel',
        email: 'treasurer.member@club.org',
        phone: '+256772000111',
        address: 'Kampala',
        updatedAt: '2026-11-22T12:00:00.000Z'
      }
    ];
    const remote = [
      {
        id: 'SB-M-0280',
        name: 'Kato Emmanuel',
        email: 'treasurer.member@club.org',
        phone: '+256772000111',
        updatedAt: '5000'
      }
    ];
    const res = mergeMemberDirectories(local, remote, 100000, ['treasurer.member@club.org'], owners);
    assert.strictEqual(res.members[0].email, 'treasurer.member@club.org');
  });
});

describe('CMS Media URL Persistence & XSS Guard Tests', () => {
  test('resolveSafeMediaUrl allows compact raster base64 data URIs while blocking SVG and script schemes', () => {
    const validWebp = 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=';
    const validPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const unsafeSvg = 'data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+PC9zdmc+';
    const unsafeJs = 'javascript:alert(1)';
    const fallback = '/fallback.jpg';

    assert.strictEqual(resolveSafeMediaUrl(validWebp, fallback), validWebp);
    assert.strictEqual(resolveSafeMediaUrl(validPng, fallback), validPng);
    assert.strictEqual(resolveSafeMediaUrl('https://cdn.example.org/hero.jpg', fallback), 'https://cdn.example.org/hero.jpg');
    assert.strictEqual(resolveSafeMediaUrl('/uploads/club-123.jpg', fallback), '/uploads/club-123.jpg');
    assert.strictEqual(resolveSafeMediaUrl(unsafeSvg, fallback), fallback);
    assert.strictEqual(resolveSafeMediaUrl(unsafeJs, fallback), fallback);
  });
});


