// src/crypto/salt.ts
import crypto from 'crypto';

// The SYSTEM_SALT is a single secret value unique to this UniVote deployment.
// It is stored in the environment / key management service — NEVER in the DB.
// It ensures biometric templates from UniVote cannot be replayed elsewhere.
// Generate once with: openssl rand -base64 64

function getSystemSalt(): string {
  const salt = process.env.UNIVOTE_BIOMETRIC_SALT;
  if (!salt) {
    throw new Error('UNIVOTE_BIOMETRIC_SALT is not set');
  }
  return salt;
}

export async function hashWithSystemSalt(value: string): Promise<string> {
  const saltedValue = getSystemSalt() + value;
  return crypto.createHash('sha256').update(saltedValue).digest('hex');
}
