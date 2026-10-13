import { Router } from 'express';
import { authGuard } from '../../middleware/authGuard';
import { prisma } from '../../lib/prisma';
import { logoUpload, removeStoredImage, storeImage } from '../../lib/uploads';

export const brandingRouter = Router();

/** Public (tenant-resolved) branding for login + shell chrome. */
brandingRouter.get('/', async (req, res) => {
  res.json({
    schoolName: req.schoolName ?? null,
    logoURL: req.logoURL ?? null,
    status: req.tenantStatus ?? null,
  });
});

/** School Admin uploads / replaces the institution logo. */
brandingRouter.post(
  '/logo',
  authGuard('SESSION', ['SCHOOL_ADMIN']),
  logoUpload.single('logo'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'logo file is required (field name: logo)' });
      }

      const previous = await prisma.tenant.findUnique({
        where: { TenantID: req.tenantID! },
        select: { LogoURL: true },
      });

      const logoURL = await storeImage('logos', req.file, req.tenantID!);
      const tenant = await prisma.tenant.update({
        where: { TenantID: req.tenantID! },
        data: { LogoURL: logoURL },
        select: { SchoolName: true, LogoURL: true, Status: true },
      });

      await removeStoredImage(previous?.LogoURL);

      res.json(tenant);
    } catch (err) {
      next(err);
    }
  }
);

/** School Admin removes the institution logo. */
brandingRouter.delete('/logo', authGuard('SESSION', ['SCHOOL_ADMIN']), async (req, res, next) => {
  try {
    const previous = await prisma.tenant.findUnique({
      where: { TenantID: req.tenantID! },
      select: { LogoURL: true, SchoolName: true, Status: true },
    });

    const tenant = await prisma.tenant.update({
      where: { TenantID: req.tenantID! },
      data: { LogoURL: null },
      select: { SchoolName: true, LogoURL: true, Status: true },
    });

    await removeStoredImage(previous?.LogoURL);
    res.json(tenant);
  } catch (err) {
    next(err);
  }
});
