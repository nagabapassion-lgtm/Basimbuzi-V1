/**
 * Server-side environment access for the Supabase-backed backend.
 * These variables MUST never reach the browser bundle.
 */
import { config as loadDotenv } from 'dotenv';

// Safe to call in every runtime (Vercel functions, AI Studio container, local dev).
// Missing .env files are fine — Vercel injects env vars via the platform.
loadDotenv({ quiet: true });

const clean = (value: string | undefined): string => String(value || '').trim();

export const env = {
  get SUPABASE_URL(): string {
    return clean(process.env.SUPABASE_URL);
  },
  get SUPABASE_SERVICE_ROLE_KEY(): string {
    return clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  },
  get SESSION_SECRET(): string {
    return clean(process.env.SESSION_SECRET);
  }
};

export const isBackendConfigured = (): boolean =>
  Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
