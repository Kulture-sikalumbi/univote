import { prisma } from '../../lib/prisma';
import { getPrismaForTenant } from '../../lib/tenantPrisma';
import { hashPassword } from '../../crypto/password';
import { SuperAdminError } from '../superadmin/superadmin.service';
import { generateTenantIdentity } from '../superadmin/tenantIdentity';

export interface SchoolRegisterInput {
  schoolName: string;
  adminUsername: string;
  adminPassword: string;
}

/**
 * School self-registration: provision the tenant schema + first admin, but
 * leave Status=PENDING until a Super Admin activates the institution.
 */
export async function registerSchool(input: SchoolRegisterInput) {
  const { schoolName, adminUsername, adminPassword } = input;

  if (
    typeof schoolName !== 'string' || !schoolName.trim() ||
    typeof adminUsername !== 'string' || !adminUsername.trim() ||
    typeof adminPassword !== 'string' || !adminPassword
  ) {
    throw new SuperAdminError('schoolName, adminUsername and adminPassword are all required');
  }
  if (adminPassword.length < 8) {
    throw new SuperAdminError('adminPassword must be at least 8 characters');
  }

  const school = schoolName.trim();
  const { tenantCode, schemaName } = await generateTenantIdentity(school);

  await prisma.$executeRawUnsafe(
    'CALL provision_tenant($1, $2, $3, $4)',
    school,
    null,
    schemaName,
    tenantCode
  );

  const tenant = await prisma.tenant.update({
    where: { SchemaName: schemaName },
    data: { Status: 'PENDING' },
  });

  const db = await getPrismaForTenant(schemaName);
  await db.schoolAdmin.create({
    data: {
      TenantID: tenant.TenantID,
      Username: adminUsername.trim(),
      PasswordHash: await hashPassword(adminPassword),
    },
  });

  return {
    tenantID: tenant.TenantID,
    schoolName: tenant.SchoolName,
    tenantCode: tenant.TenantCode,
    status: tenant.Status,
  };
}
