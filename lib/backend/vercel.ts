import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { HandlerCtx, HandlerResult } from './types';

export type Handler = (ctx: HandlerCtx) => Promise<HandlerResult>;

/**
 * Adapts a Vercel serverless request into the shared HandlerCtx and applies
 * the HandlerResult onto the response. Keeps api/*.ts wrappers tiny.
 */
export const handleVercel = (handler: Handler) =>
  async (req: VercelRequest, res: VercelResponse): Promise<void> => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const query: Record<string, string> = {};
    for (const [k, v] of url.searchParams.entries()) query[k] = v;

    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === 'string') headers[k.toLowerCase()] = v;
      else if (Array.isArray(v) && v.length > 0) headers[k.toLowerCase()] = v[0];
    }

    const ctx: HandlerCtx = {
      method: String(req.method || 'GET').toUpperCase(),
      headers,
      query,
      params: (req.query || {}) as Record<string, string>,
      body: req.body
    };

    let result: HandlerResult;
    try {
      result = await handler(ctx);
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
  };
