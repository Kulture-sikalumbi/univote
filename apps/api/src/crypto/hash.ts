// src/crypto/hash.ts
// SHA-256 ballot hashing (FR-05).
import crypto from 'crypto';

export function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function computeBallotHash(candidateID: string, ballotID: string, timestamp: string): string {
  return sha256Hex(`${candidateID}:${ballotID}:${timestamp}`);
}
