import jwt from 'jsonwebtoken';
import { issueSessionToken, issueLoginToken, issueBallotToken } from '../../src/modules/auth/jwt.service';

describe('issueSessionToken', () => {
  it('embeds the correct payload structure', () => {
    const token = issueSessionToken({
      voterID: 'voter-1',
      tenantID: 'tenant-1',
      tenantSchema: 'zut',
      role: 'STUDENT',
      webauthnVerified: true,
    });
    const decoded = jwt.decode(token) as Record<string, unknown>;
    expect(decoded).toMatchObject({
      voterID: 'voter-1',
      tenantID: 'tenant-1',
      tenantSchema: 'zut',
      role: 'STUDENT',
    });
    expect(decoded.exp).toBeDefined();
  });

  it('sets a 30 minute expiry', () => {
    const token = issueSessionToken({
      voterID: 'v',
      tenantID: 't',
      tenantSchema: 'zut',
      role: 'STUDENT',
      webauthnVerified: true,
    });
    const decoded = jwt.decode(token) as { iat: number; exp: number };
    expect(decoded.exp - decoded.iat).toBe(30 * 60);
  });
});

describe('issueLoginToken', () => {
  it('marks student password-login tokens as restricted login tokens', () => {
    const token = issueLoginToken({
      voterID: 'voter-1',
      tenantID: 'tenant-1',
      tenantSchema: 'zut',
      mustChangePassword: true,
    });
    const decoded = jwt.decode(token) as Record<string, unknown>;

    expect(decoded).toMatchObject({
      voterID: 'voter-1',
      tenantID: 'tenant-1',
      tenantSchema: 'zut',
      role: 'STUDENT',
      type: 'LOGIN',
      mustChangePassword: true,
    });
    expect(decoded.exp).toBeDefined();
  });
});

describe('issueBallotToken', () => {
  it('embeds type: BALLOT and a unique jti', () => {
    const { token, jti } = issueBallotToken('voter-1', 'election-1', 'tenant-1', 'zut');
    const decoded = jwt.decode(token) as Record<string, unknown>;
    expect(decoded.type).toBe('BALLOT');
    expect(decoded.jti).toBe(jti);
  });

  it('sets a 15 minute expiry', () => {
    const { token } = issueBallotToken('voter-1', 'election-1', 'tenant-1', 'zut');
    const decoded = jwt.decode(token) as { iat: number; exp: number };
    expect(decoded.exp - decoded.iat).toBe(15 * 60);
  });
});
