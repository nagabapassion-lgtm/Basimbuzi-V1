import type { HandlerCtx, HandlerResult } from './types';
import type { Handler } from './vercel';
import { check, login, sendOtp, verifyOtpHandler } from './handlers/auth';
import { deleteUser, listUsers, patchUserStatus, setUserPassword, upsertUsers } from './handlers/users';
import { createTransaction, deleteTransaction, historicalTransactions, resendReceipt } from './handlers/transactions';
import { addAudit, bootstrap, exportLedgerCsv, health, listAudit } from './handlers/misc';
import { getConfig, getSettingsHandler, invalidateCache, postConfig, saveSettingsHandler } from './handlers/settings';
import { getPublicSite, listInquiries, savePublicSite, submitInquiry, updateInquiryStatus, uploadImage } from './handlers/publicSite';
import { claimLink, importCsv, listMembers, mergeMembers, reconcileLedger, reviewSubmission, upsertMember } from './handlers/members';
import { meClaimLookup, meClaimSubmit, mePayments, meSendCode, meUpdateProfile, meVerifyCode, meVerifyReceipt } from './handlers/me';

/**
 * Central API route table.
 *
 * Vercel's Hobby plan allows at most 12 Serverless Functions per deployment,
 * so instead of one function file per endpoint, ALL /api/* traffic is routed
 * to the single `api/router.ts` function via a rewrite in vercel.json
 * (`/api/(.*)` -> `/api/router?_route=$1`), and dispatched here.
 *
 * Each entry mirrors exactly the wrapper file it replaced (same handler, same
 * method branching, same parameter names), so request URLs and behavior are
 * unchanged for the browser client and for the Express server in server.ts.
 */
interface RouteDef {
  /** Path segments after /api/. ':name' captures a path parameter. */
  segments: string[];
  handle: Handler;
}

const routes: RouteDef[] = [
  // --- misc ---------------------------------------------------------------
  { segments: ['health'], handle: health },
  { segments: ['bootstrap'], handle: bootstrap },
  { segments: ['export', 'ledger.csv'], handle: exportLedgerCsv },
  { segments: ['audit'], handle: async ctx => (ctx.method === 'POST' ? addAudit(ctx) : listAudit(ctx)) },

  // --- legacy no-ops / config --------------------------------------------
  { segments: ['config'], handle: async ctx => (ctx.method === 'POST' ? postConfig(ctx) : getConfig(ctx)) },
  { segments: ['gas', 'invalidate-cache'], handle: invalidateCache },

  // --- auth ---------------------------------------------------------------
  { segments: ['auth', 'login'], handle: login },
  { segments: ['auth', 'check'], handle: check },
  { segments: ['auth', 'send-otp'], handle: sendOtp },
  { segments: ['auth', 'verify-otp'], handle: verifyOtpHandler },

  // --- staff users --------------------------------------------------------
  {
    segments: ['users'],
    handle: async ctx => {
      switch (ctx.method) {
        case 'POST':
          return upsertUsers(ctx);
        case 'PATCH':
          return patchUserStatus(ctx);
        case 'DELETE':
          return deleteUser(ctx);
        default:
          return listUsers(ctx);
      }
    }
  },
  { segments: ['users', 'password'], handle: setUserPassword },

  // --- transactions / ledger ----------------------------------------------
  { segments: ['transactions'], handle: createTransaction },
  { segments: ['transactions', ':receipt'], handle: deleteTransaction },
  { segments: ['transactions', ':receipt', 'resend'], handle: resendReceipt },
  { segments: ['historical-transactions'], handle: historicalTransactions },
  // Legacy alias kept for the pre-migration client: DELETE /api/historical-transactions/:receiptNumber
  { segments: ['historical-transactions', ':receipt'], handle: deleteTransaction },

  // --- settings ------------------------------------------------------------
  { segments: ['settings'], handle: async ctx => (ctx.method === 'POST' ? saveSettingsHandler(ctx) : getSettingsHandler(ctx)) },

  // --- members admin --------------------------------------------------------
  { segments: ['admin', 'members'], handle: async ctx => (ctx.method === 'POST' ? upsertMember(ctx) : listMembers(ctx)) },
  { segments: ['admin', 'members', 'import-csv'], handle: importCsv },
  { segments: ['admin', 'members', 'merge'], handle: mergeMembers },
  { segments: ['admin', 'members', 'reconcile-ledger'], handle: reconcileLedger },
  { segments: ['admin', 'members', ':id', 'claim-link'], handle: claimLink },
  { segments: ['admin', 'members', 'submissions', ':submissionId', 'review'], handle: reviewSubmission },

  // --- public website --------------------------------------------------------
  { segments: ['public-site'], handle: async ctx => (ctx.method === 'POST' ? savePublicSite(ctx) : getPublicSite(ctx)) },
  { segments: ['public-site', 'upload-image'], handle: uploadImage },
  { segments: ['public-inquiries'], handle: async ctx => (ctx.method === 'POST' ? submitInquiry(ctx) : listInquiries(ctx)) },
  { segments: ['public-inquiries', ':id'], handle: updateInquiryStatus },

  // --- member portal --------------------------------------------------------
  { segments: ['me', 'payments'], handle: mePayments },
  { segments: ['me', 'profile'], handle: meUpdateProfile },
  { segments: ['me', 'send-code'], handle: meSendCode },
  { segments: ['me', 'verify-code'], handle: meVerifyCode },
  { segments: ['me', 'verify-receipt'], handle: meVerifyReceipt },
  { segments: ['me', 'claim', ':token'], handle: async ctx => (ctx.method === 'POST' ? meClaimSubmit(ctx) : meClaimLookup(ctx)) }
];

export interface MatchedRoute {
  handle: Handler;
  params: Record<string, string>;
}

const safeDecode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/**
 * Pure path matcher — resolves `segments` against the route table.
 * Each segment is percent-decoded once before comparison (receipt numbers
 * and tokens may arrive URL-encoded). Literal segments take precedence over
 * ':param' captures at the same position, and parameter names match the
 * dynamic api directories they replaced ([receipt], [token], [id],
 * [submissionId]).
 */
export const matchRoute = (segments: string[]): MatchedRoute | null => {
  const decoded = segments.map(safeDecode);
  for (const route of routes) {
    if (route.segments.length !== decoded.length) continue;
    const params: Record<string, string> = {};
    let matched = true;
    for (let i = 0; i < route.segments.length; i++) {
      const pattern = route.segments[i];
      const actual = decoded[i];
      if (pattern.startsWith(':')) {
        params[pattern.slice(1)] = actual;
      } else if (pattern !== actual) {
        matched = false;
        break;
      }
    }
    if (matched) return { handle: route.handle, params };
  }
  return null;
};

/**
 * Full dispatch: match the raw api path and run the handler.
 * `apiPath` is the request path with the leading /api/ already removed.
 */
export const routeApiRequest = async (apiPath: string, ctx: HandlerCtx): Promise<HandlerResult> => {
  const matched = matchRoute(apiPath.split('/').filter(Boolean));
  if (!matched) {
    return {
      status: 404,
      body: { success: false, error: `API route not found: /api/${apiPath}` }
    };
  }
  ctx.params = matched.params;
  return matched.handle(ctx);
};
