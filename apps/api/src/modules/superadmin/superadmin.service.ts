// src/modules/superadmin/superadmin.service.ts
//
// Section 4.4's tenant provisioning, plus the Super Admin's own login. The
// Super Admin operates purely on the public schema (Section 1: "Onboard
// institutions, provision tenant schemas") and there is exactly one such
// operator per deployment, so credentials live in the environment rather
// than in a database table — there is nothing to multi-tenant here.
import crypto from 'crypto';
import { prisma } from '../../lib/prisma';
import { getPrismaForTenant } from '../../lib/tenantPrisma';
import { hashPassword } from '../../crypto/password';
import { issueSessionToken, Role } from '../auth/jwt.service';
import { generateTenantIdentity } from './tenantIdentity';

export class SuperAdminError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'SuperAdminError';
    this.status = status;
  }
}

// Single-operator account, bootstrapped straight from the environment
// (SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD — see .env.example) rather than a
// database table: there is exactly one of these per deployment, so there is
// nothing to multi-tenant, and it must be usable before any tenant exists.
export async function loginSuperAdmin(username: string, password: string): Promise<{ token: string }> {
  const expectedUsername = process.env.SUPERADMIN_EMAIL;
  const expectedPassword = process.env.SUPERADMIN_PASSWORD;

  if (!expectedUsername || !expectedPassword) {
    throw new SuperAdminError('Super Admin credentials are not configured on this server', 500);
  }
  if (!username || !password) {
    throw new SuperAdminError('username and password are required');
  }

  if (!timingSafeStringEqual(username, expectedUsername) || !timingSafeStringEqual(password, expectedPassword)) {
    throw new SuperAdminError('Invalid username or password', 401);
  }

  const token = issueSessionToken({
    voterID: 'superadmin',
    tenantID: 'GLOBAL',
    tenantSchema: 'GLOBAL',
    role: 'SUPER_ADMIN' as Role,
  });

  return { token };
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Still run a comparison of equal length to avoid leaking length via timing.
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export interface ProvisionTenantInput {
  schoolName: string;
  adminUsername: string;
  adminPassword: string;
  sisBaseURL?: string;
  sisApiKey?: string;
}

export async function provisionTenant(input: ProvisionTenantInput) {
  const { schoolName, adminUsername, adminPassword, sisBaseURL, sisApiKey } = input;

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

  const { tenantCode, schemaName } = await generateTenantIdentity(schoolName.trim());
  await prisma.$executeRawUnsafe(
    'CALL provision_tenant($1, $2, $3, $4)',
    schoolName.trim(),
    null,
    schemaName,
    tenantCode
  );

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { SchemaName: schemaName } });

  if (sisBaseURL || sisApiKey) {
    await prisma.tenant.update({
      where: { TenantID: tenant.TenantID },
      data: { SisBaseURL: sisBaseURL ?? null, SisApiKey: sisApiKey ?? null },
    });
  }

  // Seed the institution's first School Admin account so its staff can log
  // in immediately (no separate "invite" flow exists in this MVP scope).
  const db = await getPrismaForTenant(schemaName);
  await db.schoolAdmin.create({
    data: {
      TenantID: tenant.TenantID,
      Username: adminUsername.trim(),
      PasswordHash: await hashPassword(adminPassword),
    },
  });

  return tenant;
}

export async function listTenants() {
  return prisma.tenant.findMany({ orderBy: { CreatedAt: 'desc' } });
}

export async function activateTenant(tenantID: string) {
  const tenant = await prisma.tenant.findUnique({ where: { TenantID: tenantID } });
  if (!tenant) {
    throw new SuperAdminError('Institution not found', 404);
  }
  if (tenant.Status === 'ACTIVE') {
    return tenant;
  }
  return prisma.tenant.update({
    where: { TenantID: tenantID },
    data: { Status: 'ACTIVE' },
  });
}

export async function suspendTenant(tenantID: string) {
  const tenant = await prisma.tenant.findUnique({ where: { TenantID: tenantID } });
  if (!tenant) {
    throw new SuperAdminError('Institution not found', 404);
  }
  if (tenant.Status === 'SUSPENDED') {
    return tenant;
  }
  return prisma.tenant.update({
    where: { TenantID: tenantID },
    data: { Status: 'SUSPENDED' },
  });
}

export async function decommissionTenant(tenantID: string) {
  const tenant = await prisma.tenant.findUnique({ where: { TenantID: tenantID } });
  if (!tenant) {
    throw new SuperAdminError('Institution not found', 404);
  }
  if (!/^[a-z_][a-z0-9_]{0,62}$/i.test(tenant.SchemaName)) {
    // Defensive: should be unreachable since the same pattern is enforced at creation time.
    throw new SuperAdminError('Refusing to drop a schema with an unexpected name', 500);
  }

  await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${tenant.SchemaName}" CASCADE`);
  await prisma.tenant.delete({ where: { TenantID: tenantID } });
}
