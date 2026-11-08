import type { NextFunction, Request, Response } from 'express';
import { getPrismaForTenant } from '../../src/lib/tenantPrisma';
import { authGuard } from '../../src/middleware/authGuard';
import { issueBallotToken } from '../../src/modules/auth/jwt.service';
import { castBallot } from '../../src/modules/ballot/ballot.service';

jest.mock('../../src/lib/tenantPrisma', () => ({ getPrismaForTenant: jest.fn() }));

describe('ballot JWT single-use behavior', () => {
  it('blocks the ballot JWT after a successful ballot write', async () => {
    const transaction = {
      election: { findFirst: jest.fn().mockResolvedValue({ ElectionID: 'election-1' }) },
      ballot: { create: jest.fn().mockResolvedValue({}) },
      electionParticipant: { create: jest.fn().mockResolvedValue({}) },
    };
    const database = {
      $transaction: jest.fn(async (callback: (tx: typeof transaction) => Promise<void>) => callback(transaction)),
    };
    (getPrismaForTenant as jest.Mock).mockResolvedValue(database);
    const { token, jti } = issueBallotToken('voter-1', 'election-1', 'tenant-1', 'zut');

    await castBallot('zut', 'election-1', 'candidate-1', 'voter-1', jti);

    const req = { headers: { authorization: `Bearer ${token}` } } as unknown as Request;
    const res = { status: jest.fn(), json: jest.fn() };
    res.status.mockReturnValue(res);
    const next = jest.fn() as jest.MockedFunction<NextFunction>;
    authGuard('BALLOT')(req, res as unknown as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Ballot token already used' });
    expect(next).not.toHaveBeenCalled();
  });
});
