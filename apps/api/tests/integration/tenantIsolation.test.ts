// tests/integration/tenantIsolation.test.ts
//
// Requires a real Postgres instance reachable via DATABASE_URL, with the
// provision_tenant procedure installed (sql/provision_tenant.sql). Run via
// `npm run test:integration` after `docker compose up postgres -d` or
// against a Supabase test project.
import { prisma } from '../../src/lib/prisma';
import { disconnectAllTenantClients, getPrismaForTenant } from '../../src/lib/tenantPrisma';

const RUN_INTEGRATION = process.env.RUN_INTEGRATION_TESTS === 'true';
const describeIfDb = RUN_INTEGRATION ? describe : describe.skip;

describeIfDb('Tenant Isolation', () => {
  const schemaA = 'univote_test_a';
  const schemaB = 'univote_test_b';

  beforeAll(async () => {
    await prisma.$executeRawUnsafe('CALL provision_tenant($1, $2, $3)', 'Test School A', 'a.univote.test', schemaA);
    await prisma.$executeRawUnsafe('CALL provision_tenant($1, $2, $3)', 'Test School B', 'b.univote.test', schemaB);
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { SchemaName: { in: [schemaA, schemaB] } } });
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaA}" CASCADE`);
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaB}" CASCADE`);
    await disconnectAllTenantClients();
    await prisma.$disconnect();
  });

  it('a query scoped to schema A cannot see data created in schema B', async () => {
    const dbA = await getPrismaForTenant(schemaA);
    const dbB = await getPrismaForTenant(schemaB);

    const tenantA = await prisma.tenant.findUniqueOrThrow({ where: { SchemaName: schemaA } });
    const tenantB = await prisma.tenant.findUniqueOrThrow({ where: { SchemaName: schemaB } });

    await dbB.voter.create({
      data: { TenantID: tenantB.TenantID, StudentID: 'STU-B-1', PasswordHash: 'irrelevant' },
    });

    const foundInA = await dbA.voter.findFirst({ where: { StudentID: 'STU-B-1', TenantID: tenantA.TenantID } });
    expect(foundInA).toBeNull();

    const foundInB = await dbB.voter.findFirst({ where: { StudentID: 'STU-B-1', TenantID: tenantB.TenantID } });
    expect(foundInB).not.toBeNull();
  });
});
