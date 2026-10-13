import { encryptTimestamp, decryptTimestamp } from '../../src/crypto/encrypt';

describe('encryptTimestamp / decryptTimestamp', () => {
  it('round-trips correctly', () => {
    const original = new Date().toISOString();
    const encrypted = encryptTimestamp(original);
    expect(decryptTimestamp(encrypted)).toBe(original);
  });

  it('uses a random IV — two encryptions of the same string differ', () => {
    const value = '2026-09-08T12:00:00.000Z';
    const first = encryptTimestamp(value);
    const second = encryptTimestamp(value);
    expect(first).not.toBe(second);
  });
});
