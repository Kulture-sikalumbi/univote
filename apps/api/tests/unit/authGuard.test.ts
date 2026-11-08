import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authGuard } from '../../src/middleware/authGuard';
import { issueLoginToken, issueSessionToken } from '../../src/modules/auth/jwt.service';

function requestWithToken(token: string): Request {
  return { headers: { authorization: `Bearer ${token}` } } as unknown as Request;
}

function responseMock() {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as Response & { status: jest.Mock; json: jest.Mock };
}

describe('authGuard first-login password gate', () => {
  const token = issueSessionToken({
    voterID: 'voter-1',
    tenantID: 'tenant-1',
    tenantSchema: 'zut',
    role: 'STUDENT',
    webauthnVerified: true,
    mustChangePassword: true,
  });

  it('blocks normal session routes until the password is changed', () => {
    const req = requestWithToken(token);
    const res = responseMock();
    const next = jest.fn() as jest.MockedFunction<NextFunction>;

    authGuard('SESSION', ['STUDENT'])(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Set a new password before continuing' });
    expect(next).not.toHaveBeenCalled();
  });

  it('allows the password setup endpoint through the gate', () => {
    const req = requestWithToken(token);
    const res = responseMock();
    const next = jest.fn() as jest.MockedFunction<NextFunction>;

    authGuard('SESSION', ['STUDENT'], true)(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('authGuard student login-token restrictions', () => {
  const token = issueLoginToken({
    voterID: 'voter-1',
    tenantID: 'tenant-1',
    tenantSchema: 'zut',
  });

  it('accepts a login token only on login-verification routes', () => {
    const req = requestWithToken(token);
    const res = responseMock();
    const next = jest.fn() as jest.MockedFunction<NextFunction>;

    authGuard('LOGIN', ['STUDENT'])(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.session).toMatchObject({ voterID: 'voter-1', role: 'STUDENT' });
  });

  it('rejects a login token from normal authenticated routes', () => {
    const res = responseMock();
    const next = jest.fn() as jest.MockedFunction<NextFunction>;

    authGuard('SESSION', ['STUDENT'])(requestWithToken(token), res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Session token required' });
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a normal session token from login-verification routes', () => {
    const sessionToken = issueSessionToken({
      voterID: 'voter-1',
      tenantID: 'tenant-1',
      tenantSchema: 'zut',
      role: 'STUDENT',
      webauthnVerified: true,
    });
    const res = responseMock();
    const next = jest.fn() as jest.MockedFunction<NextFunction>;

    authGuard('LOGIN', ['STUDENT'])(requestWithToken(sessionToken), res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Login token required' });
    expect(next).not.toHaveBeenCalled();
  });

  it('requires password setup before allowing WebAuthn login', () => {
    const token = issueLoginToken({
      voterID: 'voter-1',
      tenantID: 'tenant-1',
      tenantSchema: 'zut',
      mustChangePassword: true,
    });
    const res = responseMock();
    const next = jest.fn() as jest.MockedFunction<NextFunction>;

    authGuard('LOGIN', ['STUDENT'])(requestWithToken(token), res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Set a new password before continuing' });
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects password-only student sessions', () => {
    const token = jwt.sign(
      { voterID: 'voter-1', tenantID: 'tenant-1', tenantSchema: 'zut', role: 'STUDENT' },
      process.env.JWT_SECRET!
    );
    const res = responseMock();
    const next = jest.fn() as jest.MockedFunction<NextFunction>;

    authGuard('SESSION', ['STUDENT'])(requestWithToken(token), res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'WebAuthn verification required' });
    expect(next).not.toHaveBeenCalled();
  });
});

describe('authGuard ballot token enforcement', () => {
  it('rejects an expired ballot JWT', () => {
    const token = jwt.sign(
      { voterID: 'voter-1', electionID: 'election-1', tenantID: 'tenant-1', tenantSchema: 'zut', type: 'BALLOT' },
      process.env.JWT_SECRET!,
      { expiresIn: -1, jwtid: 'expired-ballot-token' }
    );
    const res = responseMock();
    const next = jest.fn() as jest.MockedFunction<NextFunction>;

    authGuard('BALLOT')(requestWithToken(token), res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
    expect(next).not.toHaveBeenCalled();
  });
});
