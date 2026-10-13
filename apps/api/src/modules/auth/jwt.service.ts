// src/modules/auth/jwt.service.ts
//
// Two token types (Section 6.6):
//   SESSION — issued after credential login, 30 min TTL, used for all
//             authenticated calls (eligibility check, elections, voters...).
//   BALLOT  — issued after a successful biometric handshake, 15 min TTL,
//             single-use (invalidated via the jti blocklist on cast).
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

export type Role = 'STUDENT' | 'SCHOOL_ADMIN' | 'SUPER_ADMIN';

export interface SessionPayload {
  voterID: string;
  tenantID: string;
  tenantSchema: string;
  role: Role;
  mustChangePassword?: boolean;
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
