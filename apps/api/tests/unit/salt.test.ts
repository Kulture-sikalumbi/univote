import { hashWithSystemSalt } from '../../src/crypto/salt';

describe('hashWithSystemSalt', () => {
  it('produces the same output for the same input and salt', async () => {
    const a = await hashWithSystemSalt('same-value');
    const b = await hashWithSystemSalt('same-value');
    expect(a).toBe(b);
  });

  it('produces a different output when the salt changes', async () => {
    const original = process.env.UNIVOTE_BIOMETRIC_SALT;
    const a = await hashWithSystemSalt('same-value');

    process.env.UNIVOTE_BIOMETRIC_SALT = 'a-different-salt';
    const b = await hashWithSystemSalt('same-value');

    process.env.UNIVOTE_BIOMETRIC_SALT = original;
    expect(a).not.toBe(b);
  });
});
