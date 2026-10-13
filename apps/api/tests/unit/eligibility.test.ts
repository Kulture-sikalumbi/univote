jest.mock('../../src/lib/tenantPrisma', () => ({ getPrismaForTenant: jest.fn() }));

import { getPrismaForTenant } from '../../src/lib/tenantPrisma';
import { checkEligibility } from '../../src/modules/eligibility/eligibility.service';

const getTenantDb = getPrismaForTenant as jest.Mock;

describe('checkEligibility', () => {
  const originalFetch = global.fetch;
  const voterFindUnique = jest.fn();
  const electionFindUnique = jest.fn();
  const participationFindUnique = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    voterFindUnique.mockResolvedValue({ IsActive: true });
    electionFindUnique.mockResolvedValue({ Status: 'ACTIVE' });
    participationFindUnique.mockResolvedValue(null);
    getTenantDb.mockResolvedValue({
      voter: { findUnique: voterFindUnique },
      election: { findUnique: electionFindUnique },
      electionParticipant: { findUnique: participationFindUnique },
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ enrollmentStatus: 'ACTIVE', financialHold: false }),
    }) as jest.Mock;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('allows an active SIS voter for an open election', async () => {
    await expect(checkEligibility('zut', 'STU-1', 'voter-1', 'election-1', 'http://sis.test', 'key'))
      .resolves.toEqual({ eligible: true });
  });

  it('keeps a school-admin deactivation as an eligibility veto', async () => {
    voterFindUnique.mockResolvedValue({ IsActive: false });

    await expect(checkEligibility('zut', 'STU-1', 'voter-1', 'election-1', 'http://sis.test', 'key'))
      .resolves.toEqual({ eligible: false, reasonCode: 'NOT_ENROLLED' });
    expect(participationFindUnique).not.toHaveBeenCalled();
  });

  it('returns the financial-hold reason from the SIS even when the local voter is inactive', async () => {
    voterFindUnique.mockResolvedValue({ IsActive: false });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ enrollmentStatus: 'ACTIVE', financialHold: true }),
    });

    await expect(checkEligibility('zut', 'STU-1', 'voter-1', 'election-1', 'http://sis.test', 'key'))
      .resolves.toEqual({ eligible: false, reasonCode: 'FINANCIAL_HOLD' });
  });
});
