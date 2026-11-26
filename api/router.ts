import type { VercelRequest, VercelResponse } from '@vercel/node';
import { routeApiRequest } from '../lib/backend/router';
import type { HandlerCtx, HandlerResult } from '../lib/backend/types';

/**
 * THE single Vercel Serverless Function for this project.
 *
 * Vercel's Hobby plan allows a maximum of 12 functions per deployment, so all
 * /api/* traffic is funneled here through the rewrite in vercel.json:
 *     source: "/api/(.*)"  destination: "/api/router?_route=$1"
 * The original request path arrives in the `_route` query parameter (and the
 * original query string is preserved alongside it). As a fallback we also
 * accept the path directly on req.url, so the function works with or without
 * the rewrite.
 *
 * Every endpoint previously had its own file (api/auth/login.ts, ...); the
 * same handlers now run through lib/backend/router.ts — same URLs, same
 * behavior, one function.
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
