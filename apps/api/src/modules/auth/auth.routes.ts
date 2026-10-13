// src/modules/auth/auth.routes.ts
//
// Implements the Authentication API (Section 7) and the exact client
// sequence documented in Section 9's "Student Voter Flow":
//   CREDENTIAL_LOGIN -> ELIGIBILITY_CHECK (see eligibility.routes.ts)
//   -> BIOMETRIC_HANDSHAKE (register once, then login every time)
// A session token (issued by /login) only proves password knowledge; the
// webauthn/login/complete endpoint is the only place a BALLOT token is
// minted, and only after a verified biometric assertion.
import { Router } from 'express';
import { authGuard } from '../../middleware/authGuard';
import { authRateLimiter } from '../../middleware/rateLimiter';
import { prisma } from '../../lib/prisma';
import { getPrismaForTenant } from '../../lib/tenantPrisma';
import { consumeChallenge, saveChallenge } from '../../lib/challengeStore';
import { AuthError, changeVoterPassword, loginSchoolAdmin, loginVoter } from './auth.service';
import { issueBallotToken } from './jwt.service';
import { checkEligibility } from '../eligibility/eligibility.service';
import {
  generateAuthenticationChallenge,
  generateRegistrationChallenge,
  verifyAndStoreCredential,
  verifyBiometricAssertion,
  WebAuthnError,
} from './webauthn.service';

export const authRouter = Router();

authRouter.post('/login', authRateLimiter, async (req, res, next) => {
  try {
    const { studentID, password } = req.body ?? {};
    const result = await loginVoter(req.tenantSchema!, req.tenantID!, studentID, password);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Not in the Section 7 contract table (which only documents the student
// flow), but required for the School Admin portal to sign in against its
// own tenant-scoped SchoolAdmin table (see the schema note in
// prisma/tenant/schema.prisma).
authRouter.post('/admin/login', authRateLimiter, async (req, res, next) => {
  try {
    const { username, password } = req.body ?? {};
    const result = await loginSchoolAdmin(req.tenantSchema!, req.tenantID!, username, password);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

authRouter.post('/change-password', authGuard('SESSION', ['STUDENT'], true), async (req, res, next) => {
  try {
    const { voterID, tenantID, tenantSchema } = req.session!;
    const { newPassword } = req.body ?? {};
    const result = await changeVoterPassword(tenantSchema, tenantID, voterID, newPassword);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

authRouter.post('/webauthn/register/begin', authGuard('SESSION', ['STUDENT']), async (req, res, next) => {
  try {
    const { voterID, tenantSchema } = req.session!;
    const db = await getPrismaForTenant(tenantSchema);
    const voter = await db.voter.findUniqueOrThrow({ where: { VoterID: voterID } });

    const options = await generateRegistrationChallenge(tenantSchema, voterID, voter.StudentID);
    saveChallenge(voterID, 'register', options.challenge);
    res.json(options);
  } catch (err) {
    next(err);
  }
});

authRouter.post('/webauthn/register/complete', authGuard('SESSION', ['STUDENT']), async (req, res, next) => {
  try {
    const { voterID, tenantSchema } = req.session!;
    const challenge = consumeChallenge(voterID, 'register');
    if (!challenge) {
      return res.status(400).json({ error: 'Registration challenge expired or not found. Please retry.' });
    }

    const result = await verifyAndStoreCredential(tenantSchema, voterID, req.body?.credential, challenge);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

authRouter.post('/webauthn/login/begin', authGuard('SESSION', ['STUDENT']), async (req, res, next) => {
  try {
    const { voterID, tenantSchema } = req.session!;
    const options = await generateAuthenticationChallenge(tenantSchema, voterID);
    saveChallenge(voterID, 'authenticate', options.challenge);
    res.json(options);
  } catch (err) {
    next(err);
  }
});

authRouter.post('/webauthn/login/complete', authGuard('SESSION', ['STUDENT']), async (req, res, next) => {
  try {
    const { voterID, tenantID, tenantSchema } = req.session!;
    const { electionID, credential } = req.body ?? {};

    if (!electionID) {
      return res.status(400).json({ error: 'electionID is required' });
    }

    const challenge = consumeChallenge(voterID, 'authenticate');
    if (!challenge) {
      return res.status(400).json({ error: 'Authentication challenge expired or not found. Please retry.' });
    }

    await verifyBiometricAssertion(tenantSchema, voterID, credential, challenge);

    // Eligibility is checked by the UI before prompting for a biometric, but
    // the API must enforce it too: a client can call this endpoint directly.
    const [tenant, db] = await Promise.all([
      prisma.tenant.findUniqueOrThrow({ where: { TenantID: tenantID } }),
      getPrismaForTenant(tenantSchema),
    ]);
    const voter = await db.voter.findUniqueOrThrow({ where: { VoterID: voterID } });
    const eligibility = await checkEligibility(
      tenantSchema,
      voter.StudentID,
      voterID,
      electionID,
      tenant.SisBaseURL,
      tenant.SisApiKey
    );

    if (!eligibility.eligible) {
      return res.status(403).json({
        error: 'You are not eligible to vote in this election',
        reasonCode: eligibility.reasonCode,
      });
    }

    // Only a verified biometric handshake ever mints a ballot token — this
    // is the single point in the whole system where voting authorization
    // is granted (Section 6.6 / NFR checklist).
    const { token } = issueBallotToken(voterID, electionID, tenantID, tenantSchema);
    res.json({ ballotToken: token });
  } catch (err) {
    next(err);
  }
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
authRouter.use((err: Error, _req: any, res: any, _next: any) => {
  if (err instanceof AuthError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err instanceof WebAuthnError) {
    return res.status(401).json({ error: err.message });
  }
  return res.status(500).json({ error: 'Internal server error' });
});
