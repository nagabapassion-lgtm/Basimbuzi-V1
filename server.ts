/**
 * SC Basimbuzi — thin Express host for the shared Supabase-backed handlers.
 *
 * ALL business logic lives in lib/backend/handlers/*, which is the same code
 * the Vercel serverless functions in api/ run. No file-JSON persistence.
 *
 * - createApp() returns the configured Express app (used by tests & this main).
 * - `tsx server.ts` / `node dist/server.cjs` (see package.json) serves:
 *     - dev: Vite middleware with SPA + crawler-friendly OG HTML
 *     - prod: dist/ static + SPA fallback with dynamically resolved OG origin
 */
import './lib/backend/env'; // loads .env via dotenv (safe when absent)
import express, { Express, Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';

import { health, bootstrap, listAudit, addAudit, exportLedgerCsv } from './lib/backend/handlers/misc';
import { login, sendOtp, verifyOtpHandler, check } from './lib/backend/handlers/auth';
import {
  historicalTransactions,
  createTransaction,
  deleteTransaction,
  resendReceipt
} from './lib/backend/handlers/transactions';
import { listUsers, upsertUsers, patchUserStatus, deleteUser, setUserPassword } from './lib/backend/handlers/users';
import { getSettingsHandler, saveSettingsHandler, getConfig, postConfig, invalidateCache } from './lib/backend/handlers/settings';
import {
  listMembers,
  upsertMember,
  importCsv,
  mergeMembers,
  claimLink,
  reviewSubmission,
  reconcileLedger
} from './lib/backend/handlers/members';
import {
  getPublicSite,
  savePublicSite,
  uploadImage,
  submitInquiry,
  listInquiries,
  updateInquiryStatus
} from './lib/backend/handlers/publicSite';
import {
  meSendCode,
  meVerifyCode,
  mePayments,
  meVerifyReceipt,
  meClaimLookup,
  meClaimSubmit,
  meUpdateProfile
} from './lib/backend/handlers/me';
import type { HandlerCtx, HandlerResult } from './lib/backend/types';
import type { Handler } from './lib/backend/vercel';

/** Express request -> shared HandlerCtx. */
const toCtx = (req: Request): HandlerCtx => {
  const query: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.query || {})) {
    query[key] = Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '');
  }
  return {
    method: req.method.toUpperCase(),
    headers: req.headers as Record<string, string>,
    query,
    params: (req.params || {}) as Record<string, string>,
    body: req.body
  };
};

/** Shared HandlerResult -> Express response. */
const adapt =
  (handler: Handler) =>
  async (req: Request, res: Response): Promise<void> => {
    let result: HandlerResult;
    try {
      result = await handler(toCtx(req));
    } catch (err) {
      result = {
        status: 500,
        body: { success: false, error: err instanceof Error ? err.message : String(err) }
      };
    }
    if (result.headers) {
      for (const [key, value] of Object.entries(result.headers)) res.setHeader(key, value);
    }
    res.status(result.status);
    if (typeof result.body === 'string') {
      res.send(result.body);
    } else {
      res.json(result.body);
    }
  };

const renderDynamicOpenGraphHtml = (htmlContent: string, req: Request): string => {
  const proto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
  const host = req.headers['x-forwarded-host'] || req.get('host') || 'scbasimbuzi-v2.ai.studio';
  const origin = `${proto}://${host}`;

  return htmlContent
    .replace(/content="https:\/\/scbasimbuzi\.org\/logo\.png"/g, `content="${origin}/logo.png"`)
    .replace(/content="https:\/\/scbasimbuzi\.org"/g, `content="${origin}/"`);
};

export function createApp(): Express {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  // --- Health & bootstrap ---------------------------------------------------
  app.get('/api/health', adapt(health));
  app.get('/api/bootstrap', adapt(bootstrap));
  app.get('/api/export/ledger.csv', adapt(exportLedgerCsv));
  app.get('/api/audit', adapt(listAudit));
  app.post('/api/audit', adapt(addAudit));

  // --- Auth -----------------------------------------------------------------
  app.post('/api/auth/login', adapt(login));
  app.post('/api/auth/send-otp', adapt(sendOtp));
  app.post('/api/auth/verify-otp', adapt(verifyOtpHandler));
  app.post('/api/auth/check', adapt(check));

  // --- Users admin ------------------------------------------------------------
  app.get('/api/users', adapt(listUsers));
  app.post('/api/users', adapt(upsertUsers));
  app.patch('/api/users', adapt(patchUserStatus));
  app.delete('/api/users', adapt(deleteUser));
  app.post('/api/users/password', adapt(setUserPassword));

  // --- Settings & legacy keep-alive no-ops ------------------------------------
  app.get('/api/settings', adapt(getSettingsHandler));
  app.post('/api/settings', adapt(saveSettingsHandler));
  app.get('/api/config', adapt(getConfig));
  app.post('/api/config', adapt(postConfig));
  app.post('/api/gas/invalidate-cache', adapt(invalidateCache));

  // --- Ledger -----------------------------------------------------------------
  app.get('/api/historical-transactions', adapt(historicalTransactions));
  app.delete('/api/historical-transactions/:receiptNumber', adapt(deleteTransaction));
  app.post('/api/transactions', adapt(createTransaction));
  app.delete('/api/transactions/:receiptNumber', adapt(deleteTransaction));
  app.post('/api/transactions/:receiptNumber/resend', adapt(resendReceipt));

  // --- Members admin ------------------------------------------------------------
  app.get('/api/admin/members', adapt(listMembers));
  app.post('/api/admin/members', adapt(upsertMember));
  app.post('/api/admin/members/import-csv', adapt(importCsv));
  app.post('/api/admin/members/merge', adapt(mergeMembers));
  app.post('/api/admin/members/reconcile-ledger', adapt(reconcileLedger));
  app.post('/api/admin/members/:id/claim-link', adapt(claimLink));
  app.post('/api/admin/members/submissions/:submissionId/review', adapt(reviewSubmission));

  // --- Public club website -------------------------------------------------------
  app.get('/api/public-site', adapt(getPublicSite));
  app.post('/api/public-site', adapt(savePublicSite));
  app.post('/api/public-site/upload-image', adapt(uploadImage));
  app.post('/api/public-inquiries', adapt(submitInquiry));
  app.get('/api/public-inquiries', adapt(listInquiries));
  app.patch('/api/public-inquiries/:id', adapt(updateInquiryStatus));

  // --- Member self-service portal (/me) -------------------------------------------
  app.post('/api/me/send-code', adapt(meSendCode));
  app.post('/api/me/verify-code', adapt(meVerifyCode));
  app.get('/api/me/payments', adapt(mePayments));
  app.post('/api/me/verify-receipt', adapt(meVerifyReceipt));
  app.get('/api/me/claim/:token', adapt(meClaimLookup));
  app.post('/api/me/claim/:token', adapt(meClaimSubmit));
  app.patch('/api/me/profile', adapt(meUpdateProfile));

  // Legacy /uploads/:filename fallback (safely serves previously uploaded CMS images)
  app.get('/uploads/:filename', (req, res) => {
    try {
      const rawName = String(req.params.filename || '').trim();
      if (!/^[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp|gif)$/.test(rawName)) {
        res.status(404).end();
        return;
      }
      const dirs = [
        path.join(process.cwd(), 'data', 'uploads'),
        path.join(process.cwd(), 'public', 'uploads'),
        path.join(process.cwd(), 'dist', 'uploads')
      ];
      for (const dir of dirs) {
        const resolvedPath = path.resolve(dir, rawName);
        if (resolvedPath.startsWith(dir + path.sep) && fs.existsSync(resolvedPath)) {
          res.setHeader('Cache-Control', 'public, max-age=604800');
          res.sendFile(resolvedPath);
          return;
        }
      }
      res.status(404).end();
    } catch {
      res.status(404).end();
    }
  });

  // Permissive CORS for static brand images (link-preview crawlers)
  app.use((req, res, next) => {
    if (
      req.path.startsWith('/logo.') ||
      req.path.startsWith('/favicon.') ||
      req.path.endsWith('.png') ||
      req.path.endsWith('.jpg') ||
      req.path.endsWith('.svg')
    ) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    }
    next();
  });

  return app;
}

/** Attaches Vite dev middleware (dev only). Await before listening. */
export async function attachViteDevMiddleware(app: Express): Promise<void> {
  if (process.env.NODE_ENV === 'production') return;
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa'
  });

  // Intercept crawler or root HTML requests to inject dynamically resolved origin
  app.use(async (req: Request, res: Response, next: NextFunction) => {
    const isHtmlRequest =
      req.method === 'GET' &&
      (req.path === '/' ||
        req.path === '/index.html' ||
        ((req.headers.accept || '').includes('text/html') && !req.path.includes('.')) ||
        /whatsapp|telegrambot|facebookexternalhit|facebot|twitterbot|slackbot|discordbot|applebot/i.test(
          String(req.headers['user-agent'] || '')
        ));

    if (isHtmlRequest && !req.path.startsWith('/api') && !req.path.includes('.')) {
      try {
        const indexHtmlPath = path.join(process.cwd(), 'index.html');
        let html = fs.readFileSync(indexHtmlPath, 'utf-8');
        html = await vite.transformIndexHtml(req.originalUrl, html);
        html = renderDynamicOpenGraphHtml(html, req);
        res.status(200).set({ 'Content-Type': 'text/html; charset=utf-8' }).end(html);
        return;
      } catch (e) {
        console.error('Error transforming index.html:', e);
      }
    }
    next();
  });

  app.use(vite.middlewares);
}

/** Production SPA fallback: dist/ static + index.html with dynamic OG origin. */
export function attachProductionStatic(app: Express): void {
  if (process.env.NODE_ENV !== 'production') return;
  const distPath = path.join(process.cwd(), 'dist');
  const indexHtmlPath = path.join(distPath, 'index.html');
  app.use(express.static(distPath, { index: false }));
  app.get('*', (req, res) => {
    try {
      if (fs.existsSync(indexHtmlPath)) {
        let html = fs.readFileSync(indexHtmlPath, 'utf-8');
        html = renderDynamicOpenGraphHtml(html, req);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
        return;
      }
    } catch (err) {
      console.warn('Fallback sending index.html:', err);
    }
    res.sendFile(indexHtmlPath);
  });
}

/**
 * "Launched directly" detection that works in BOTH runtimes:
 * - dev/AI-Studio: `tsx server.ts` runs this file as ESM (no `require`/`module`)
 * - prod: `node dist/server.cjs` runs the esbuild CJS bundle
 */
const isMainModule = (() => {
  try {
    const argvPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
    if (argvPath && (argvPath === path.resolve('server.ts') || argvPath.endsWith('dist/server.cjs'))) {
      return true;
    }
  } catch {
    // fall through to the CJS check
  }
  try {
    return typeof require !== 'undefined' && require.main === module;
  } catch {
    return false;
  }
})();

if (isMainModule) {
  void (async () => {
    const app = createApp();
    await attachViteDevMiddleware(app);
    attachProductionStatic(app);
    const PORT = Number(process.env.PORT) || 3000;
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://0.0.0.0:${PORT}`);
    });
  })();
}
