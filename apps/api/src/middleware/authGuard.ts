// src/middleware/authGuard.ts
//
// Verifies the Authorization: Bearer <token> header and enforces the two
// token types described in Section 6.6:
//   - 'SESSION' tokens (30 min TTL) for all authenticated, non-voting calls
//   - 'BALLOT' tokens (15 min TTL, single-use) for the voting endpoints only
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { isTokenBlocked } from '../lib/tokenBlocklist';
import { SessionPayload, BallotPayload, Role } from '../modules/auth/jwt.service';

type TokenKind = 'SESSION' | 'BALLOT';

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set');
  return secret;
}

export function authGuard(kind: TokenKind, allowedRoles?: Role[], allowPasswordSetup = false) {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing bearer token' });
    }

    const token = header.slice('Bearer '.length);

    try {
      const decoded = jwt.verify(token, getSecret()) as (SessionPayload | BallotPayload) & {
        type?: 'BALLOT';
        jti?: string;
      };

      // A valid token for one institution must never authorize access under
      // another institution selected by X-Tenant-Code.
      if (
        req.tenantID &&
        (decoded.tenantID !== req.tenantID || decoded.tenantSchema !== req.tenantSchema)
      ) {
        return res.status(403).json({ error: 'Token does not belong to this institution' });
      }

      if (kind === 'BALLOT') {
        if (decoded.type !== 'BALLOT') {
          return res.status(401).json({ error: 'Ballot token required' });
        }
        if (decoded.jti && isTokenBlocked(decoded.jti)) {
          return res.status(401).json({ error: 'Ballot token already used' });
        }
        req.ballot = decoded as BallotPayload;
      } else {
        if ((decoded as BallotPayload).type === 'BALLOT') {
          return res.status(401).json({ error: 'Session token required' });
        }
        const session = decoded as SessionPayload;
        if (allowedRoles && !allowedRoles.includes(session.role)) {
          return res.status(403).json({ error: 'Insufficient role' });
        }
        if (session.mustChangePassword && !allowPasswordSetup) {
          return res.status(403).json({ error: 'Set a new password before continuing' });
        }
        req.session = session;
      }

      next();
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  };
}
