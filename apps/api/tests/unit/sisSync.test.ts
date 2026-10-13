jest.mock('../../src/lib/prisma', () => ({
  prisma: { tenant: { findUniqueOrThrow: jest.fn() } },
}));
jest.mock('../../src/lib/tenantPrisma', () => ({ getPrismaForTenant: jest.fn() }));
jest.mock('../../src/crypto/password', () => ({ hashPassword: jest.fn(async (value: string) => `hash:${value}`) }));

import { prisma } from '../../src/lib/prisma';
import { getPrismaForTenant } from '../../src/lib/tenantPrisma';
import { syncVoterRoll } from '../../src/modules/schooladmin/schooladmin.service';

const findTenant = prisma.tenant.findUniqueOrThrow as jest.Mock;
const getTenantDb = getPrismaForTenant as jest.Mock;

describe('syncVoterRoll', () => {
  const originalFetch = global.fetch;
  const create = jest.fn();
  const update = jest.fn();
  const findMany = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    findTenant.mockResolvedValue({ SisBaseURL: 'http://sis.test/api', SisApiKey: 'test-key' });
    findMany.mockResolvedValue([]);
    create.mockResolvedValue({});
    update.mockResolvedValue({});
    getTenantDb.mockResolvedValue({
      voter: { findMany, create, update },
      $transaction: async (work: (tx: unknown) => Promise<void>) =>
        work({ voter: { create, update } }),
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        students: [
          { studentID: 'STU-ACTIVE-1', enrollmentStatus: 'ACTIVE', financialHold: false },
          { studentID: 'STU-HOLD-1', enrollmentStatus: 'ACTIVE', financialHold: true },
        ],
      }),
    }) as jest.Mock;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('creates active and held accounts with one-time random passwords', async () => {
    const result = await syncVoterRoll('zut', 'tenant-1');

    expect(result.created).toBe(2);
    expect(result.updated).toBe(0);
    expect(result.students).toHaveLength(2);
    expect(result.students.every((student) => student.temporaryPassword)).toBe(true);
    expect(result.students.map((student) => student.isActive)).toEqual([true, false]);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ IsActive: true, MustChangePassword: true }),
      })
    );
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe('http://sis.test/api/roster');
  });

  it('updates eligibility for existing voters without changing their passwords', async () => {
    findMany.mockResolvedValue([
      { VoterID: 'voter-1', StudentID: 'STU-ACTIVE-1', PasswordHash: 'existing-hash' },
    ]);

    const result = await syncVoterRoll('zut', 'tenant-1');

    expect(result.created).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.students.find((student) => student.studentID === 'STU-ACTIVE-1')).toEqual({
      studentID: 'STU-ACTIVE-1',
      isActive: true,
    });
    expect(update).toHaveBeenCalledWith({ where: { VoterID: 'voter-1' }, data: { IsActive: true } });
  });
});
