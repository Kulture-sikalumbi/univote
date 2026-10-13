import { Router } from 'express';
import { authRateLimiter } from '../../middleware/rateLimiter';
import { SuperAdminError } from '../superadmin/superadmin.service';
import { registerSchool } from './schools.service';

export const schoolsPublicRouter = Router();

/** Public school self-registration — creates a PENDING tenant. */
schoolsPublicRouter.post('/register', authRateLimiter, async (req, res, next) => {
  try {
    const result = await registerSchool(req.body ?? {});
    res.status(201).json({
      ...result,
      message: 'Registration received. A Super Admin must activate your school before staff can log in.',
    });
  } catch (err) {
    next(err);
  }
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
schoolsPublicRouter.use((err: Error, _req: any, res: any, _next: any) => {
  if (err instanceof SuperAdminError) {
    return res.status(err.status).json({ error: err.message });
  }
  return res.status(500).json({ error: 'Internal server error' });
});
