import { prisma } from '../../lib/prisma';
import { toInstitutionCode } from '../../lib/institutionCode';

/** Allocate the same readable slug as both institution code and schema name. */
export async function generateTenantIdentity(schoolName: string): Promise<{ tenantCode: string; schemaName: string }> {
  const base = toInstitutionCode(schoolName) || 'school';

  for (let suffix = 1; suffix <= 100_000; suffix += 1) {
    const suffixText = suffix === 1 ? '' : `_${suffix}`;
    const tenantCode = `${base.slice(0, 63 - suffixText.length).replace(/_+$/g, '')}${suffixText}`;
    const schemaName = tenantCode;
    const [existingCode, existingSchema] = await Promise.all([
      prisma.tenant.findUnique({ where: { TenantCode: tenantCode } }),
      prisma.tenant.findUnique({ where: { SchemaName: schemaName } }),
    ]);

    if (!existingCode && !existingSchema) {
      return { tenantCode, schemaName };
    }
  }

  throw new Error('Could not allocate a unique school name code. Please retry.');
}
