// src/crypto/encrypt.ts
//
// Generic AES-256-CBC encryption used for:
//   1. Ballot timestamps (FR-05 — tamper-evident audit trail)
//   2. WebAuthn credential public keys at rest (needed to reconstruct the
//      raw public key bytes during assertion verification; the salted hash
//      in Credential.Salted_PublicKey_Hash is an integrity check only and
//      is NOT reversible).
import crypto from 'crypto';

const IV_LENGTH = 16;

function getKey(): Buffer {
  const hex = process.env.AES_KEY;
  if (!hex) throw new Error('AES_KEY is not set');
  const key = Buffer.from(hex, 'hex');
  if (key.length !== 32) {
    throw new Error('AES_KEY must be 32 bytes (64 hex characters) for AES-256');
  }
  return key;
}

export function encryptData(plainText: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decryptData(encryptedData: string): string {
  const [ivHex, encryptedHex] = encryptedData.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', getKey(), iv);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

// Named aliases matching the build guide's Section 8.2 API exactly.
export const encryptTimestamp = encryptData;
export const decryptTimestamp = decryptData;
