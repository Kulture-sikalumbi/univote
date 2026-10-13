require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const bcrypt = require('bcrypt');
const { PrismaClient: PublicPrismaClient } = require('../node_modules/.prisma/public-client');
const { PrismaClient: TenantPrismaClient } = require('../node_modules/.prisma/tenant-client');

const schemaName = 'cbu_demo';
const schoolName = 'Copperbelt University Demo';
const adminUsername = 'mwape.admin';
const adminPassword = 'CopperbeltAdmin2026!';
const studentID = 'CBU2026001';
const studentPassword = 'MwambaVote2026!';

function tenantDatabaseURL() {
  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.set('schema', schemaName);
  return url.toString();
}

async function main() {
  const publicDb = new PublicPrismaClient();
  let tenantDb;

  try {
    let tenant = await publicDb.tenant.findUnique({ where: { SchemaName: schemaName } });
    if (!tenant) {
      await publicDb.$executeRawUnsafe(
        'CALL provision_tenant($1, $2, $3)',
        schoolName,
        null,
        schemaName,
      );
      tenant = await publicDb.tenant.findUniqueOrThrow({ where: { SchemaName: schemaName } });
    }

    tenantDb = new TenantPrismaClient({ datasources: { db: { url: tenantDatabaseURL() } } });

    await tenantDb.schoolAdmin.upsert({
      where: { Username_TenantID: { Username: adminUsername, TenantID: tenant.TenantID } },
      update: { PasswordHash: await bcrypt.hash(adminPassword, 12) },
      create: {
        TenantID: tenant.TenantID,
        Username: adminUsername,
        PasswordHash: await bcrypt.hash(adminPassword, 12),
      },
    });

    const voter = await tenantDb.voter.upsert({
      where: { StudentID_TenantID: { StudentID: studentID, TenantID: tenant.TenantID } },
      update: { PasswordHash: await bcrypt.hash(studentPassword, 12), IsActive: true },
      create: {
        TenantID: tenant.TenantID,
        StudentID: studentID,
        PasswordHash: await bcrypt.hash(studentPassword, 12),
        IsActive: true,
      },
    });

    let election = await tenantDb.election.findFirst({ where: { Title: 'CBU Student Council Elections 2026' } });
    if (!election) {
      const start = new Date(Date.now() - 60 * 60 * 1000);
      const end = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      election = await tenantDb.election.create({
        data: {
          TenantID: tenant.TenantID,
          Title: 'CBU Student Council Elections 2026',
          StartTime: start,
          EndTime: end,
          Status: 'ACTIVE',
        },
      });
    } else if (election.Status !== 'ACTIVE') {
      election = await tenantDb.election.update({ where: { ElectionID: election.ElectionID }, data: { Status: 'ACTIVE' } });
    }

    const candidates = [
      { FullName: 'Chanda Mwape', Position: 'Guild President', ManifestoURL: null },
      { FullName: 'Thandiwe Banda', Position: 'Guild President', ManifestoURL: null },
    ];
    for (const candidate of candidates) {
      const existing = await tenantDb.candidate.findFirst({
        where: { ElectionID: election.ElectionID, FullName: candidate.FullName, Position: candidate.Position },
      });
      if (!existing) {
        await tenantDb.candidate.create({ data: { ElectionID: election.ElectionID, ...candidate } });
      }
    }

    const candidateCount = await tenantDb.candidate.count({ where: { ElectionID: election.ElectionID } });
    console.log(JSON.stringify({
      seeded: true,
      school: schoolName,
      institutionCode: tenant.TenantCode,
      schema: schemaName,
      admin: { username: adminUsername, password: adminPassword },
      student: { studentID, password: studentPassword, voterID: voter.VoterID },
      election: { id: election.ElectionID, title: election.Title, status: election.Status, candidateCount },
    }, null, 2));
  } finally {
    await tenantDb?.$disconnect();
    await publicDb.$disconnect();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
