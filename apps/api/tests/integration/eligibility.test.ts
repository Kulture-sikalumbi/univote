// tests/integration/eligibility.test.ts
//
// Requires a real Postgres instance + the mock SIS router mounted (see
// src/modules/eligibility/mockSis.ts). Run the API locally first:
//   NODE_ENV=development npm run dev --workspace=apps/api
import { checkEligibility } from '../../src/modules/eligibility/eligibility.service';
import { prisma } from '../../src/lib/prisma';
import { disconnectAllTenantClients, getPrismaForTenant } from '../../src/lib/tenantPrisma';

const RUN_INTEGRATION = process.env.RUN_INTEGRATION_TESTS === 'true';
const describeIfDb = RUN_INTEGRATION ? describe : describe.skip;

describeIfDb('Eligibility Engine', () => {
  const schemaName = 'univote_test_elig';
  const sisBaseURL = process.env.SIS_BASE_URL ?? 'http://localhost:3001/mock-sis';

  beforeAll(async () => {
    await prisma.$executeRawUnsafe('CALL provision_tenant($1, $2, $3)', 'Test Elig School', 'elig.univote.test', schemaName);
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { SchemaName: schemaName } });
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await disconnectAllTenantClients();
    await prisma.$disconnect();
  });

  it('SIS ACTIVE + no hold + open election -> eligible', async () => {
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { SchemaName: schemaName } });
    const db = await getPrismaForTenant(schemaName);
    const election = await db.election.create({
      data: { TenantID: tenant.TenantID, Title: 'SRC 2026', StartTime: new Date(), EndTime: new Date(), Status: 'ACTIVE' },
    });
    const voter = await db.voter.create({
      data: { TenantID: tenant.TenantID, StudentID: 'STU-ACTIVE-1', PasswordHash: 'x', IsActive: true },
    });

    const result = await checkEligibility(
      schemaName,
      'STU-ACTIVE-1',
      voter.VoterID,
      election.ElectionID,
      sisBaseURL,
      'dev-key'
    );
    expect(result).toEqual({ eligible: true });
  });

  it('SIS financial hold -> FINANCIAL_HOLD', async () => {
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { SchemaName: schemaName } });
    const db = await getPrismaForTenant(schemaName);
    const election = await db.election.create({
      data: { TenantID: tenant.TenantID, Title: 'SRC 2026 B', StartTime: new Date(), EndTime: new Date(), Status: 'ACTIVE' },
    });
    const voter = await db.voter.create({
      data: { TenantID: tenant.TenantID, StudentID: 'STU-HOLD-1', PasswordHash: 'x' },
    });

    const result = await checkEligibility(
      schemaName,
      'STU-HOLD-1',
      voter.VoterID,
      election.ElectionID,
      sisBaseURL,
      'dev-key'
    );
    expect(result).toEqual({ eligible: false, reasonCode: 'FINANCIAL_HOLD' });
  });
});
