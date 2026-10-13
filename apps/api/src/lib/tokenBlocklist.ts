// src/lib/tokenBlocklist.ts
//
// Single-use enforcement for ballot JWTs (Section 16: "Ballot tokens are
// single-use. Invalidate in the same transaction as ballot submission.").
//
// This in-memory implementation is sufficient for a single API instance /
// dev & demo deployments. For a horizontally-scaled production deployment,
// swap this for a shared store (Redis SETEX on the token's `jti`, with a
// TTL matching the ballot token's remaining lifetime).
const blocked = new Set<string>();

export function blockToken(jti: string): void {
  blocked.add(jti);
}

export function isTokenBlocked(jti: string): boolean {
  return blocked.has(jti);
}
