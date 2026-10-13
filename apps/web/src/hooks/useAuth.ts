import { useCallback, useEffect, useMemo, useState } from 'react';

export type Role = 'STUDENT' | 'SCHOOL_ADMIN' | 'SUPER_ADMIN';

export interface SessionClaims {
  voterID: string;
  tenantID: string;
  tenantSchema: string;
  role: Role;
  mustChangePassword?: boolean;
  exp?: number;
  iat?: number;
}

const STORAGE_KEY = 'univote.session.token';

function base64UrlDecode(input: string): string {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return atob(padded);
}

function decodeSessionToken(token: string): SessionClaims | null {
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    return JSON.parse(base64UrlDecode(payload)) as SessionClaims;
  } catch {
    return null;
  }
}

function isExpired(claims: SessionClaims | null): boolean {
  if (!claims?.exp) return false;
  return claims.exp * 1000 <= Date.now();
}

/**
 * Reads/writes the session JWT (from POST /auth/login) and decodes its
 * claims client-side to determine which portal to render. This project's
 * scope treats localStorage as an acceptable place to keep the session
 * token; the short-lived ballot token used during voting is kept separately
 * in memory only (see StudentPortal).
 */
export function useAuth() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));

  const claims = useMemo(() => (token ? decodeSessionToken(token) : null), [token]);
  const expired = isExpired(claims);

  const login = useCallback((newToken: string) => {
    localStorage.setItem(STORAGE_KEY, newToken);
    setToken(newToken);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setToken(null);
  }, []);

  useEffect(() => {
    if (token && expired) {
      logout();
    }
  }, [token, expired, logout]);

  const valid = Boolean(token) && !expired;

  return {
    token: valid ? token : null,
    role: valid ? claims?.role ?? null : null,
    voterID: valid ? claims?.voterID ?? null : null,
    tenantID: valid ? claims?.tenantID ?? null : null,
    tenantSchema: valid ? claims?.tenantSchema ?? null : null,
    mustChangePassword: valid ? Boolean(claims?.mustChangePassword) : false,
    isAuthenticated: valid,
    login,
    logout,
  };
}
