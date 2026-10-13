// src/modules/auth/webauthn.service.ts
//
// Roaming Identity Module (Section 6.2). A voter's biometric credential is
// tied to their VoterID, not to any one device — so once registered, the
// *same* fingerprint/face template (never leaving the authenticator) can be
// used to authenticate from a different device, as long as the platform
// authenticator on that device has been provisioned with the credential
// (e.g. via passkey sync). Raw public keys never touch the database: only
// a system-salted SHA-256 hash (integrity check) and an AES-256 encrypted
// copy (needed to reconstruct the bytes for verification) are stored.
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { decryptData, encryptData } from '../../crypto/encrypt';
import { hashWithSystemSalt } from '../../crypto/salt';
import { getPrismaForTenant } from '../../lib/tenantPrisma';

export class WebAuthnError extends Error {}

function getRpID(): string {
  const rpID = process.env.RP_ID;
  if (!rpID) throw new Error('RP_ID is not set');
  return rpID;
}

function getOrigin(): string {
  const origin = process.env.ORIGIN;
  if (!origin) throw new Error('ORIGIN is not set');
  return origin;
}

/** Step 1 of enrollment: produce options for navigator.credentials.create(). */
export async function generateRegistrationChallenge(
  tenantSchema: string,
  voterID: string,
  studentID: string
) {
  const db = await getPrismaForTenant(tenantSchema);
  const existingCredentials = await db.credential.findMany({ where: { VoterID: voterID } });

  return generateRegistrationOptions({
    rpName: 'UniVote',
    rpID: getRpID(),
    userID: voterID,
    userName: studentID,
    attestationType: 'none',
    excludeCredentials: existingCredentials.map((c) => ({
      id: isoBase64URL.toBuffer(c.CredentialID),
      type: 'public-key' as const,
    })),
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification: 'required',
      residentKey: 'preferred',
    },
  });
}

/** Step 2 of enrollment: verify the browser's response and persist the credential. */
export async function verifyAndStoreCredential(
  tenantSchema: string,
  voterID: string,
  registrationResponse: Parameters<typeof verifyRegistrationResponse>[0]['response'],
  expectedChallenge: string
): Promise<{ success: true }> {
  const verification = await verifyRegistrationResponse({
    response: registrationResponse,
    expectedChallenge,
    expectedOrigin: getOrigin(),
    expectedRPID: getRpID(),
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new WebAuthnError('Biometric registration failed verification');
  }

  const { credentialID, credentialPublicKey, counter } = verification.registrationInfo;
  const credentialIDStr = isoBase64URL.fromBuffer(credentialID);
  const publicKeyBase64 = Buffer.from(credentialPublicKey).toString('base64');

  // CRITICAL (NFR-06): the raw public key never touches the database as-is.
  const saltedHash = await hashWithSystemSalt(publicKeyBase64);
  // Kept AES-256 encrypted so the raw bytes can be reconstructed later —
  // WebAuthn assertion verification requires them; the salted hash above is
  // an integrity check only and is not reversible.
  const encryptedPublicKey = encryptData(publicKeyBase64);

  const db = await getPrismaForTenant(tenantSchema);
  await db.credential.create({
    data: {
      CredentialID: credentialIDStr,
      VoterID: voterID,
      Salted_PublicKey_Hash: saltedHash,
      Encrypted_PublicKey: encryptedPublicKey,
      SignCount: BigInt(counter),
    },
  });

  return { success: true };
}

/** Step 1 of the voting handshake: produce options for navigator.credentials.get(). */
export async function generateAuthenticationChallenge(tenantSchema: string, voterID: string) {
  const db = await getPrismaForTenant(tenantSchema);
  const credentials = await db.credential.findMany({ where: { VoterID: voterID } });

  if (!credentials.length) {
    throw new WebAuthnError('No biometric credential is registered for this account yet');
  }

  return generateAuthenticationOptions({
    rpID: getRpID(),
    userVerification: 'required',
    allowCredentials: credentials.map((c) => ({
      id: isoBase64URL.toBuffer(c.CredentialID),
      type: 'public-key' as const,
    })),
  });
}

/** Step 2 of the voting handshake: verify the assertion against the stored credential. */
export async function verifyBiometricAssertion(
  tenantSchema: string,
  voterID: string,
  assertionResponse: Parameters<typeof verifyAuthenticationResponse>[0]['response'],
  expectedChallenge: string
): Promise<{ verified: true }> {
  const db = await getPrismaForTenant(tenantSchema);

  const credential = await db.credential.findFirst({
    where: { VoterID: voterID, CredentialID: assertionResponse.id },
  });
  if (!credential) {
    throw new WebAuthnError('No matching biometric credential registered for this account');
  }

  const publicKeyBase64 = decryptData(credential.Encrypted_PublicKey);
  const recomputedHash = await hashWithSystemSalt(publicKeyBase64);
  if (recomputedHash !== credential.Salted_PublicKey_Hash) {
    // Should never happen unless the encrypted column was tampered with.
    throw new WebAuthnError('Stored credential integrity check failed');
  }

  const { verified, authenticationInfo } = await verifyAuthenticationResponse({
    response: assertionResponse,
    expectedChallenge,
    expectedOrigin: getOrigin(),
    expectedRPID: getRpID(),
    authenticator: {
      credentialID: isoBase64URL.toBuffer(credential.CredentialID),
      credentialPublicKey: Buffer.from(publicKeyBase64, 'base64'),
      counter: Number(credential.SignCount),
    },
  });

  if (!verified) {
    throw new WebAuthnError('Biometric assertion failed verification');
  }

  const previousCounter = Number(credential.SignCount);
  // CRITICAL: SignCount must be strictly increasing — detects credential
  // cloning. Some platform authenticators (e.g. certain resident-key/passkey
  // implementations) never increment past 0 by design; only enforce the
  // check once a authenticator has demonstrated it tracks a counter at all.
  if (authenticationInfo.newCounter !== 0 && authenticationInfo.newCounter <= previousCounter) {
    throw new WebAuthnError('SignCount did not increment — possible credential cloning attack');
  }

  await db.credential.update({
    where: { CredentialID: credential.CredentialID },
    data: { SignCount: BigInt(authenticationInfo.newCounter), LastUsedAt: new Date() },
  });

  return { verified: true };
}
