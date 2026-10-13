import { blockToken, isTokenBlocked } from '../../src/lib/tokenBlocklist';

describe('tokenBlocklist (checkSignCount-adjacent single-use enforcement)', () => {
  it('is not blocked before being blocked', () => {
    expect(isTokenBlocked('fresh-jti')).toBe(false);
  });

  it('is blocked after blockToken is called', () => {
    blockToken('used-jti');
    expect(isTokenBlocked('used-jti')).toBe(true);
  });
});
