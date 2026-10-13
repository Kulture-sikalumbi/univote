// src/lib/challengeStore.ts
//
// Temporary storage for WebAuthn registration/authentication challenges
// between the "begin" and "complete" steps of the handshake (Section 6.2).
// In-memory with a short TTL is fine for a single instance; swap for Redis
// in a multi-instance deployment.
interface ChallengeEntry {
  challenge: string;
  expiresAt: number;
}

const TTL_MS = 5 * 60 * 1000; // 5 minutes
const store = new Map<string, ChallengeEntry>();

function key(voterID: string, purpose: 'register' | 'authenticate'): string {
  return `${purpose}:${voterID}`;
}

export function saveChallenge(voterID: string, purpose: 'register' | 'authenticate', challenge: string): void {
  store.set(key(voterID, purpose), { challenge, expiresAt: Date.now() + TTL_MS });
}

export function consumeChallenge(voterID: string, purpose: 'register' | 'authenticate'): string | null {
  const k = key(voterID, purpose);
  const entry = store.get(k);
  store.delete(k);
  if (!entry || entry.expiresAt < Date.now()) return null;
  return entry.challenge;
}
