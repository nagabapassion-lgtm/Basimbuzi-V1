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
