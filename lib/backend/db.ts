import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env, isBackendConfigured } from './env';

/**
 * ONE admin (service-role) client for the whole backend.
 * The service role key bypasses RLS; it must never leave the server.
 * Created lazily so importing this module never crashes at build time.
 */
let client: SupabaseClient | null = null;

export const getDb = (): SupabaseClient => {
  if (!client) {
    if (!isBackendConfigured()) {
      throw new Error(
        'Supabase backend is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
      );
    }
    client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return client;
};

/** Proxy so `import { db }` works like the contract sketch while staying lazy. */
export const db = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const real = getDb() as any;
    const value = Reflect.get(real, prop, receiver);
    return typeof value === 'function' ? value.bind(real) : value;
  }
});

/**
 * DEDICATED password-verification client — used ONLY for
 * `auth.signInWithPassword` in the login handler and for nothing else.
 *
 * Why a separate client? A supabase-js client that performs
 * signInWithPassword keeps the USER session in memory, and every later
 * `client.from(...)` query is then sent with the USER's access token
 * (role: `authenticated`) instead of the service-role key. Because the
 * serverless function caches `getDb()` in a module singleton, one login
 * attempt would silently poison EVERY later database call on that warm
 * instance: REST probes would fail with "permission denied for table ..."
 * (role authenticated has no table grants) until the instance cold-starts.
 * That was the exact cause of the flapping /api/health and the login 500s.
 *
 * The verifier client below may capture user sessions freely — it is never
 * used for table queries, so nothing else can be affected.
 */
let authVerifier: SupabaseClient | null = null;

export const getAuthVerifier = (): SupabaseClient => {
  if (!authVerifier) {
    if (!isBackendConfigured()) {
      throw new Error(
        'Supabase backend is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
      );
    }
    authVerifier = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return authVerifier;
};
