import type { NextFunction, Request, Response } from 'express';
import { tenantResolver } from '../../src/middleware/tenantResolver';
import { authGuard } from '../../src/middleware/authGuard';
import { issueSessionToken } from '../../src/modules/auth/jwt.service';
import { prisma } from '../../src/lib/prisma';

jest.mock('../../src/lib/prisma', () => ({
  prisma: { tenant: { findUnique: jest.fn() } },
}));

function responseMock() {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as Response & { status: jest.Mock; json: jest.Mock };
}

describe('tenant API boundary', () => {
  it('blocks a School A admin token when the request selects School B', async () => {
    (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({
      TenantID: 'school-b-id',
      TenantCode: 'school-b',
      SchemaName: 'school_b',
      Status: 'ACTIVE',
      SchoolName: 'School B',
      LogoURL: null,
    });

    const token = issueSessionToken({
      voterID: 'school-a-admin',
      tenantID: 'school-a-id',
      tenantSchema: 'school_a',
      role: 'SCHOOL_ADMIN',
    });
    const req = {
      method: 'GET',
      path: '/api/v1/voters',
      headers: { authorization: `Bearer ${token}` },
      header: (name: string) => name.toLowerCase() === 'x-tenant-code' ? 'school-b' : undefined,
    } as unknown as Request;
    const res = responseMock();
    const resolved = jest.fn() as jest.MockedFunction<NextFunction>;

    await tenantResolver(req, res, resolved);
    expect(resolved).toHaveBeenCalledTimes(1);
    expect(req.tenantID).toBe('school-b-id');
    expect(req.tenantSchema).toBe('school_b');

    const routeRead = jest.fn() as jest.MockedFunction<NextFunction>;
    authGuard('SESSION', ['SCHOOL_ADMIN'])(req, res, routeRead);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Token does not belong to this institution' });
    expect(routeRead).not.toHaveBeenCalled();
  });
});
