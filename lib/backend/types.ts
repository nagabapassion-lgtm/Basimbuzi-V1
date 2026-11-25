import type { UserPermissions } from '../../src/types';

export interface HandlerCtx {
  method: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  params: Record<string, string>;
  body: any;
}

/** Reads a path parameter accepting alternative spellings (Express vs Vercel dir names). */
export const getParam = (ctx: HandlerCtx, ...keys: string[]): string => {
  for (const key of keys) {
    const value = ctx.params[key];
    if (value !== undefined && value !== null && String(value).length > 0) return String(value);
  }
  return '';
};

export interface HandlerResult {
  status: number;
  body: any;
  headers?: Record<string, string>;
}

export const ok = (body: any, headers?: Record<string, string>): HandlerResult => ({
  status: 200,
  body,
  headers
});

export const fail = (status: number, body: any): HandlerResult => ({ status, body });

export const errorResult = (err: unknown): HandlerResult => ({
  status: 500,
  body: { success: false, error: err instanceof Error ? err.message : String(err) }
});

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  /** Role defaults merged with the fresh app_users.permissions overrides. */
  permissions: UserPermissions;
  /** Raw jsonb column value (may be undefined). */
  rawPermissions?: Partial<UserPermissions> | null;
  createdAt: string;
}

export interface MemberSession {
  email: string;
  memberId: string;
  name: string;
}

export type TokenKind = 'staff' | 'member';

export interface TokenPayload {
  sub: string;
  name?: string;
  role?: string;
  kind: TokenKind;
  memberId?: string;
  exp: number;
}
