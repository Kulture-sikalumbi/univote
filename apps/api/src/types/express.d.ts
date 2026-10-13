// src/types/express.d.ts
import type { SessionPayload, BallotPayload } from '../modules/auth/jwt.service';

declare global {
  namespace Express {
    interface Request {
      tenantID?: string;
      tenantSchema?: string;
      tenantStatus?: string;
      schoolName?: string;
      logoURL?: string | null;
      /** Populated by authGuard('SESSION') */
      session?: SessionPayload;
      /** Populated by authGuard('BALLOT') */
      ballot?: BallotPayload;
    }
  }
}

export {};
