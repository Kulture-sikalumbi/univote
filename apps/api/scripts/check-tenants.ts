import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { listTenants } from '../src/modules/superadmin/superadmin.service';

async function main() {
  const all = await listTenants();
  console.log('TENANTS_COUNT=' + all.length);
  for (const t of all) {
    console.log('- ' + t.SchoolName + ' | code=' + t.TenantCode + ' | schema=' + t.SchemaName);
  }
}

main()
  .then(() => prisma.$disconnect())
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('FAILED:', e);
    process.exit(1);
  });
