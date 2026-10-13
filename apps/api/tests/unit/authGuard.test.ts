import type { Request, Response, NextFunction } from 'express';
import { authGuard } from '../../src/middleware/authGuard';
import { issueSessionToken } from '../../src/modules/auth/jwt.service';

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
