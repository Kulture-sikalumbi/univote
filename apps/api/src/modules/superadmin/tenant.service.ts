// src/modules/superadmin/tenant.service.ts
//
// Institution onboarding — calls the provision_tenant stored procedure
// (sql/provision_tenant.sql) which atomically registers the tenant in
// public.Tenant and creates its isolated schema + tables.
import { prisma } from '../../lib/prisma';
import { generateTenantIdentity } from './tenantIdentity';

export async function listTenants() {
  return prisma.tenant.findMany({ orderBy: { CreatedAt: 'desc' } });
}

export async function provisionTenant(schoolName: string) {
  const { tenantCode, schemaName } = await generateTenantIdentity(schoolName);

  await prisma.$executeRawUnsafe(
    'CALL provision_tenant($1, $2, $3, $4)',
    schoolName,
    null,
    schemaName,
    tenantCode
  );

  return prisma.tenant.findUnique({ where: { SchemaName: schemaName } });
}

export async function decommissionTenant(tenantID: string) {
  // Deliberately does NOT drop the tenant's schema/data automatically —
  // decommissioning an institution with live election data should be a
  // reviewed, manual step. This only removes it from the active registry.
  return prisma.tenant.delete({ where: { TenantID: tenantID } });
}
