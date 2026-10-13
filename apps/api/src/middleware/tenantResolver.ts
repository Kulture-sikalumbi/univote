// src/middleware/tenantResolver.ts
// Resolves every tenant-scoped request from the institution code supplied by
// the login screen. Tenant-specific reads and writes must use req.tenantSchema.
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { toInstitutionCode } from '../lib/institutionCode';

/** Paths allowed even when the tenant Status is not ACTIVE (e.g. PENDING). */
function isPendingAllowed(req: Request): boolean {
  return req.method === 'GET' && req.path === '/api/v1/branding';
}

export async function tenantResolver(req: Request, res: Response, next: NextFunction) {
  const tenantCode = toInstitutionCode(req.header('X-Tenant-Code') ?? '');

  if (!tenantCode) {
    return res.status(400).json({ error: 'Institution code is required' });
  }

  try {
    const tenant = await prisma.tenant.findUnique({ where: { TenantCode: tenantCode } });
    if (!tenant) {
      return res.status(404).json({ error: 'Institution not found. Check the institution code.' });
    }

    req.tenantID = tenant.TenantID;
    req.tenantSchema = tenant.SchemaName;
    req.tenantStatus = tenant.Status;
    req.schoolName = tenant.SchoolName;
    req.logoURL = tenant.LogoURL;

    if (tenant.Status !== 'ACTIVE' && !isPendingAllowed(req)) {
      return res.status(403).json({
        error:
          tenant.Status === 'PENDING'
            ? 'This institution is awaiting Super Admin activation'
            : 'This institution is currently suspended',
      });
    }

    next();
  } catch (err) {
    next(err);
  }
}
