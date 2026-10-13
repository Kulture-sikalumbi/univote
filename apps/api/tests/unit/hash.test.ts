import { computeBallotHash, sha256Hex } from '../../src/crypto/hash';

describe('computeBallotHash', () => {
  it('computes a deterministic SHA-256 hash from candidate, ballot id and timestamp', () => {
    const expected = sha256Hex('candidate-1:ballot-1:2026-09-08T00:00:00.000Z');
    const actual = computeBallotHash('candidate-1', 'ballot-1', '2026-09-08T00:00:00.000Z');
    expect(actual).toBe(expected);
    expect(actual).toHaveLength(64); // hex-encoded SHA-256
  });

  it('produces a different hash if any component changes', () => {
    const a = computeBallotHash('candidate-1', 'ballot-1', '2026-09-08T00:00:00.000Z');
    const b = computeBallotHash('candidate-2', 'ballot-1', '2026-09-08T00:00:00.000Z');
    expect(a).not.toBe(b);
  });
});
