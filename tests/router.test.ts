/**
 * Tests for the central API router (lib/backend/router.ts).
 *
 * All /api/* traffic is dispatched through this table since the Vercel
 * Hobby-plan consolidation (one api/router.ts function). These tests are
 * hermetic: they verify path matching and parameter extraction only —
 * no handler is ever invoked, no database is contacted.
 *
 * Fake env values are set before the first import so that the (lazy)
 * Supabase client would fail cleanly rather than crash module loading.
 */
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret';

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchRoute, routeApiRequest } from '../lib/backend/router';

const seg = (path: string) => path.split('/').filter(Boolean);

test('static routes resolve without params', () => {
  const staticPaths = [
    'health',
    'bootstrap',
    'auth/login',
    'auth/check',
    'auth/send-otp',
    'auth/verify-otp',
    'users',
    'users/password',
    'transactions',
    'historical-transactions',
    'me/payments',
    'me/profile',
    'me/send-code',
    'me/verify-code',
    'me/verify-receipt',
    'admin/members',
    'admin/members/import-csv',
    'admin/members/merge',
    'admin/members/reconcile-ledger',
    'public-site',
    'public-site/upload-image',
    'public-inquiries',
    'settings',
    'audit',
    'export/ledger.csv',
    'gas/invalidate-cache'
  ];
  for (const p of staticPaths) {
    const m = matchRoute(seg(p));
    assert.ok(m, `expected route to match: ${p}`);
    assert.equal(Object.keys(m.params).length, 0, `expected no params for ${p}`);
  }
});

test('dynamic routes extract path parameters', () => {
  assert.equal(matchRoute(seg('transactions/SB-2026-00001'))?.params.receipt, 'SB-2026-00001');
  assert.equal(matchRoute(seg('transactions/HIST-NLL17-0001-SPOT'))?.params.receipt, 'HIST-NLL17-0001-SPOT');
  assert.equal(matchRoute(seg('transactions/SB-2026-00001/resend'))?.params.receipt, 'SB-2026-00001');
  assert.equal(matchRoute(seg('historical-transactions/HIST-NLL17-0002-PRE'))?.params.receipt, 'HIST-NLL17-0002-PRE');
  assert.equal(matchRoute(seg('me/claim/f1e2d3c4b5'))?.params.token, 'f1e2d3c4b5');
  assert.equal(matchRoute(seg('admin/members/M-014/claim-link'))?.params.id, 'M-014');
  assert.equal(matchRoute(seg('admin/members/submissions/42/review'))?.params.submissionId, '42');
  assert.equal(matchRoute(seg('public-inquiries/9'))?.params.id, '9');
});

test('literal segments win over parameter captures', () => {
  // 'admin/members/import-csv' must match the literal route, not ':id/claim-link'
  const m = matchRoute(seg('admin/members/import-csv'));
  assert.ok(m);
  assert.equal(Object.keys(m.params).length, 0);
});

test('unknown routes return null', () => {
  assert.equal(matchRoute(seg('nope')), null);
  assert.equal(matchRoute(seg('auth/nothing')), null);
  assert.equal(matchRoute(seg('transactions/ABC/extra/deep')), null);
  assert.equal(matchRoute([]), null);
});

test('routeApiRequest returns 404 JSON for unknown paths without touching handlers', async () => {
  const ctx = { method: 'GET', headers: {}, query: {}, params: {}, body: undefined };
  const result = await routeApiRequest('definitely/not/a/route', ctx as never);
  assert.equal(result.status, 404);
  assert.equal(result.body.success, false);
});

test('percent-encoded segments are decoded during matching', async () => {
  const m = matchRoute(seg('transactions/SL%2D2026%2D00999'));
  assert.ok(m);
  assert.equal(m.params.receipt, 'SL-2026-00999');
});
