// src/modules/auth/jwt.service.ts
//
// Token types:
//   LOGIN   — issued after the student's password, 10 min TTL, restricted
//             to password setup and the required WebAuthn login step.
//   SESSION — issued only after WebAuthn, 30 min TTL, used for authenticated
//             non-voting calls (eligibility check, elections, voters...).
//   BALLOT  — issued after a separate WebAuthn handshake, 15 min TTL,
//             single-use (invalidated via the jti blocklist on cast).
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

export type Role = 'STUDENT' | 'SCHOOL_ADMIN' | 'SUPER_ADMIN';

interface SessionClaims {
  voterID: string;
  tenantID: string;
  tenantSchema: string;
  mustChangePassword?: boolean;
}

export type SessionPayload =
  | (SessionClaims & { role: 'STUDENT'; webauthnVerified: true })
  | (SessionClaims & { role: 'SCHOOL_ADMIN' | 'SUPER_ADMIN'; webauthnVerified?: never });

export interface LoginPayload extends SessionClaims {
  role: 'STUDENT';
  type: 'LOGIN';
}

export interface BallotPayload {
  voterID: string;
  electionID: string;
  tenantID: string;
  tenantSchema: string;
  type: 'BALLOT';
  jti: string;
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set');
  return secret;
}

export function issueSessionToken(payload: SessionPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: '30m' });
}

export function issueLoginToken(payload: SessionClaims): string {
  return jwt.sign({ ...payload, role: 'STUDENT' as const, type: 'LOGIN' as const }, getSecret(), {
    expiresIn: '10m',
  });
}

export function issueBallotToken(
  voterID: string,
  electionID: string,
  tenantID: string,
  tenantSchema: string
): { token: string; jti: string } {
  const jti = crypto.randomUUID();
  const token = jwt.sign(
    { voterID, electionID, tenantID, tenantSchema, type: 'BALLOT' as const },
    getSecret(),
    { expiresIn: '15m', jwtid: jti }
  );
  return { token, jti };
}
