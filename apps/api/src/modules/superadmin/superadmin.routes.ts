// src/modules/superadmin/superadmin.routes.ts
//
// Mounted in app.ts BEFORE tenantResolver — the Super Admin operates
// purely on the public schema and must never depend on a resolved tenant
// (see the comment in app.ts). /login is intentionally public; every other
// route requires a SUPER_ADMIN session token.
import { Router } from 'express';
import { authGuard } from '../../middleware/authGuard';
import { authRateLimiter } from '../../middleware/rateLimiter';
import {
  activateTenant,
  decommissionTenant,
  listTenants,
  loginSuperAdmin,
  provisionTenant,
  suspendTenant,
  SuperAdminError,
} from './superadmin.service';

export const superAdminRouter = Router();

superAdminRouter.post('/login', authRateLimiter, async (req, res, next) => {
  try {
    const { username, password } = req.body ?? {};
    const result = await loginSuperAdmin(username, password);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

superAdminRouter.use(authGuard('SESSION', ['SUPER_ADMIN']));

superAdminRouter.get('/tenants', async (_req, res, next) => {
  try {
    const tenants = await listTenants();
    res.json(tenants.map(({ SisApiKey, ...rest }) => rest));
  } catch (err) {
    next(err);
  }
});

superAdminRouter.post('/tenants', async (req, res, next) => {
  try {
    const tenant = await provisionTenant(req.body ?? {});
    const { SisApiKey, ...rest } = tenant;
    res.status(201).json(rest);
  } catch (err) {
    next(err);
  }
});

superAdminRouter.post('/tenants/:id/activate', async (req, res, next) => {
  try {
    const tenant = await activateTenant(req.params.id);
    const { SisApiKey, ...rest } = tenant;
    res.json(rest);
  } catch (err) {
    next(err);
  }
});

superAdminRouter.post('/tenants/:id/suspend', async (req, res, next) => {
  try {
    const tenant = await suspendTenant(req.params.id);
    const { SisApiKey, ...rest } = tenant;
    res.json(rest);
  } catch (err) {
    next(err);
  }
});

superAdminRouter.delete('/tenants/:id', async (req, res, next) => {
  try {
    await decommissionTenant(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
superAdminRouter.use((err: Error, _req: any, res: any, _next: any) => {
  if (err instanceof SuperAdminError) {
    return res.status(err.status).json({ error: err.message });
  }
  return res.status(500).json({ error: 'Internal server error' });
});
