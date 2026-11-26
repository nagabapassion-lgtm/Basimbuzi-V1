import type { VercelRequest, VercelResponse } from '@vercel/node';
import { routeApiRequest } from './router';
import type { HandlerCtx, HandlerResult } from './types';

/**
 * Vercel Serverless Function entrypoint — DO NOT DELETE.
 *
 * This file is NOT deployed directly. `npm run build` compiles it with esbuild
 * (--bundle) into a single self-contained plain-JavaScript file at
 * `api/router.js`, and THAT generated file is the one Vercel Function.
 *
 * Why the indirection? The Vercel Node builder compiles each TypeScript file
 * one-by-one and preserves import specifiers verbatim. With ESM output that
 * breaks at runtime ("ERR_MODULE_NOT_FOUND: Cannot find module
 * '/var/task/lib/backend/router' imported from '/var/task/api/router.js'")
 * because Node's ESM loader never infers file extensions. Pre-bundling here
 * removes every relative import from the deployed artifact, so nothing is left
 * for the lambda to resolve: one file, node_modules only.
 *
 * If you edit this handler, re-run `npm run build` (or just push — Vercel runs
 * the same build command in the cloud).
 */

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // Vercel kills an invocation that exceeds the plan timeout (10s on Hobby) and
  // shows the visitor an opaque FUNCTION_INVOCATION_FAILED page. We answer
  // ourselves just before that, so the cause stays visible in JSON.
  const INVOCATION_TIMEOUT_MS = 8_500;
  const withTimeout = (work: Promise<HandlerResult>): Promise<HandlerResult> =>
    new Promise<HandlerResult>(resolve => {
      const timer = setTimeout(
        () =>
          resolve({
            status: 503,
            body: {
              success: false,
              error:
                'The request took too long. Check SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in Vercel → Settings → Environment Variables, and that the Supabase project is active (not paused).'
            }
          }),
        INVOCATION_TIMEOUT_MS
      );
      work.then(
        r => {
          clearTimeout(timer);
          resolve(r);
        },
        e => {
          clearTimeout(timer);
          resolve({
            status: 500,
            body: { success: false, error: e instanceof Error ? e.message : String(e) }
          });
        }
      );
    });

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  // Original query string, excluding the routing helper param.
  const query: Record<string, string> = {};
  for (const [k, v] of url.searchParams.entries()) {
    if (k !== '_route') query[k] = v;
  }

  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === 'string') headers[k.toLowerCase()] = v;
    else if (Array.isArray(v) && v.length > 0) headers[k.toLowerCase()] = v[0];
  }

  // Resolve the original API path: prefer _route (from the rewrite), fall
  // back to req.url directly (works without the rewrite too).
  const raw = url.searchParams.get('_route') || url.pathname || '/';
  let apiPath = '';
  try {
    apiPath = decodeURIComponent(raw);
  } catch {
    apiPath = raw;
  }
  apiPath = apiPath
    .replace(/^\/+api\/+/i, '')
    .replace(/^\/+api$/i, '')
    .replace(/^router\/+/i, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');

  const ctx: HandlerCtx = {
    method: String(req.method || 'GET').toUpperCase(),
    headers,
    query,
    params: {},
    body: req.body
  };

  let result: HandlerResult;
  try {
    result = await withTimeout(routeApiRequest(apiPath, ctx));
  } catch (err) {
    result = {
      status: 500,
      body: { success: false, error: err instanceof Error ? err.message : String(err) }
    };
  }

  if (result.headers) {
    for (const [k, v] of Object.entries(result.headers)) res.setHeader(k, v);
  }
  res.status(result.status);
  if (typeof result.body === 'string') {
    res.send(result.body);
  } else {
    res.json(result.body);
  }
}
