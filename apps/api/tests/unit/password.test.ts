import { hashPassword, verifyPassword } from '../../src/crypto/password';

describe('hashPassword / verifyPassword', () => {
  it('round-trips correctly for the right password', async () => {
    const hash = await hashPassword('correct-password');
    await expect(verifyPassword('correct-password', hash)).resolves.toBe(true);
  });

  it('returns false for the wrong password', async () => {
    const hash = await hashPassword('correct-password');
    await expect(verifyPassword('wrong-password', hash)).resolves.toBe(false);
  });
});
