require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { PrismaClient } = require('../node_modules/.prisma/public-client');

async function main() {
  const db = new PrismaClient();
  try {
    await db.$executeRawUnsafe(
      'ALTER TABLE public."Tenant" ADD COLUMN IF NOT EXISTS "Status" VARCHAR(20) NOT NULL DEFAULT \'ACTIVE\''
    );
    await db.$executeRawUnsafe('ALTER TABLE public."Tenant" ADD COLUMN IF NOT EXISTS "LogoURL" TEXT');

    const tenants = await db.tenant.findMany({ select: { SchemaName: true } });
    for (const tenant of tenants) {
      await db.$executeRawUnsafe(
        `ALTER TABLE "${tenant.SchemaName}"."Candidate" ADD COLUMN IF NOT EXISTS "ImageURL" TEXT`
      );
    }

    console.log(JSON.stringify({ migrated: true, tenantCount: tenants.length }, null, 2));
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
