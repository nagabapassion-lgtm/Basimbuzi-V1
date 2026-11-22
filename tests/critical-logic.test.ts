import { test, describe } from 'node:test';
import assert from 'node:assert';
import { 
  escapeHtml, 
  isValidEmail, 
  isValidPhone, 
  isValidAmount, 
  isValidReceiptNumber, 
  isValidGasUrl 
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
  });

  test('Issuer can only issue receipts and search', () => {
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
  });

  test('Unauthenticated user has zero permissions', () => {
    const perms = resolveUserPermissions(null);
    assert.strictEqual(perms.canIssueReceipts, false);
    assert.strictEqual(perms.canDeleteTransactions, false);
    assert.strictEqual(perms.canViewReports, false);
    assert.strictEqual(perms.canManageUsers, false);
    assert.strictEqual(perms.canEditSettings, false);
  });
});
