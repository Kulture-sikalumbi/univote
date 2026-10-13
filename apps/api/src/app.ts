// src/app.ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'node:path';
import { tenantResolver } from './middleware/tenantResolver';
import { authGuard } from './middleware/authGuard';
import { defaultRateLimiter } from './middleware/rateLimiter';
import { prisma } from './lib/prisma';
import { UPLOAD_ROOT } from './lib/uploads';
import { authRouter } from './modules/auth/auth.routes';
import { eligibilityRouter } from './modules/eligibility/eligibility.routes';
import { ballotRouter } from './modules/ballot/ballot.routes';
import { electionRouter } from './modules/election/election.routes';
import { publicElectionRouter } from './modules/election/publicElection.routes';
import { schoolAdminRouter } from './modules/schooladmin/schooladmin.routes';
import { superAdminRouter } from './modules/superadmin/superadmin.routes';
import { schoolsPublicRouter } from './modules/schools/schools.routes';
import { brandingRouter } from './modules/branding/branding.routes';
import { mockSisRouter } from './modules/eligibility/mockSis';

export function createApp() {
  const app = express();

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );
  app.use(cors());
  app.use(express.json());
  app.use(defaultRateLimiter);

  // Legacy local-disk uploads (fallback when Supabase Storage is not configured).
  app.use('/uploads', express.static(UPLOAD_ROOT));

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/ready', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ready' });
    } catch {
      res.status(503).json({ status: 'not_ready' });
    }
  });

  // Dev-only SIS mock — never mounted in production.
  if (process.env.NODE_ENV !== 'production') {
    app.use('/mock-sis', mockSisRouter);
  }

  // Public school self-registration (creates PENDING tenants) — before
  // tenantResolver so it does not depend on an existing institution code.
  app.use('/api/v1/schools', schoolsPublicRouter);

  // Super Admin operates purely on the public schema — mounted BEFORE
  // tenantResolver so it never depends on a resolved tenant. The router
  // itself applies authGuard internally to every route except /login,
  // which must stay public.
  app.use('/api/v1/superadmin', superAdminRouter);

  // Everything below this line is tenant-scoped.
  app.use(tenantResolver);

  app.use('/api/v1/branding', brandingRouter);
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/eligibility', authGuard('SESSION'), eligibilityRouter);
  app.use('/api/v1/ballot', authGuard('BALLOT'), ballotRouter);
  // Order matters: the public "active election" read is checked first (any
  // authenticated role), falling through to the admin-only router below
  // for every other /elections path.
  app.use('/api/v1/elections', authGuard('SESSION'), publicElectionRouter);
  app.use('/api/v1/elections', authGuard('SESSION', ['SCHOOL_ADMIN']), electionRouter);
  app.use('/api/v1/voters', authGuard('SESSION', ['SCHOOL_ADMIN']), schoolAdminRouter);

  // In production the API and web app share one hostname. Serving the SPA here
  // makes Azure App Service a viable single-service deployment; tenant routing
  // uses the institution code header.
  if (process.env.NODE_ENV === 'production') {
    const webDist = path.resolve(process.cwd(), 'apps/web/dist');
    app.use(express.static(webDist));
    app.get('*', (req, res, next) => {
      if (
        req.path.startsWith('/api/') ||
        req.path.startsWith('/uploads/') ||
        req.path === '/health' ||
        req.path === '/ready'
      ) {
        return next();
      }
      res.sendFile(path.join(webDist, 'index.html'), (err) => {
        if (err) next(err);
      });
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    if (
      err.message?.includes('Only JPEG') ||
      err.message?.includes('File too large') ||
      err.message?.includes('Storage upload failed') ||
      err.message?.includes('Empty upload buffer')
    ) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
