const { config } = require('dotenv');
const bcrypt = require('bcrypt');

config({ path: '.env' });

const schemaName = 'univote_e2e';
const adminUsername = 'e2e-admin';
const adminPassword = 'E2E_Admin_Pass_123!';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed E2E fixtures in production.');
  process.exit(2);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL must point to a dedicated test database.');
  process.exit(2);
}

let databaseName;
try {
  databaseName = decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//, ''));
} catch {
  console.error('DATABASE_URL is not a valid URL.');
  process.exit(2);
}

if (!/(^|[_-])test([_-]|$)/i.test(databaseName) && process.env.UNIVOTE_TEST_DATABASE_CONFIRMED !== 'true') {
  console.error(
    'Use a database with "test" in its name, or set UNIVOTE_TEST_DATABASE_CONFIRMED=true after confirming this is a disposable test database.'
  );
  process.exit(2);
}

const { PrismaClient: PublicPrismaClient } = require('../node_modules/.prisma/public-client');
const { PrismaClient: TenantPrismaClient } = require('../node_modules/.prisma/tenant-client');
const publicDb = new PublicPrismaClient();

function tenantDatabaseUrl() {
  const url = new URL(databaseUrl);
  url.searchParams.set('schema', schemaName);
  return url.toString();
}

async function main() {
  await publicDb.tenant.deleteMany({ where: { SchemaName: schemaName } });
  await publicDb.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  await publicDb.$executeRawUnsafe(
    'CALL provision_tenant($1, $2, $3)',
    'UniVote E2E Test School',
    null,
    schemaName
  );

  const tenant = await publicDb.tenant.findUniqueOrThrow({ where: { SchemaName: schemaName } });
  const tenantDb = new TenantPrismaClient({ datasources: { db: { url: tenantDatabaseUrl() } } });

  try {
    await tenantDb.schoolAdmin.create({
      data: {
        TenantID: tenant.TenantID,
        Username: adminUsername,
        PasswordHash: await bcrypt.hash(adminPassword, 12),
      },
    });

    const election = await tenantDb.election.create({
      data: {
        TenantID: tenant.TenantID,
        Title: 'E2E Test Election',
        StartTime: new Date(Date.now() - 60_000),
        EndTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        Status: 'ACTIVE',
      },
    });
    await tenantDb.candidate.create({
      data: { ElectionID: election.ElectionID, FullName: 'E2E Candidate', Position: 'President' },
    });

    console.log(`Prepared disposable E2E tenant ${tenant.SchoolName} with one active election.`);
    console.log(`Institution code: ${tenant.TenantCode}`);
    console.log(`School Admin username: ${adminUsername}`);
    console.log('The E2E test imports student accounts from the configured SIS roster.');
  } finally {
    await tenantDb.$disconnect();
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'E2E seeding failed.');
    process.exitCode = 1;
  })
  .finally(async () => {
    await publicDb.$disconnect();
  });
