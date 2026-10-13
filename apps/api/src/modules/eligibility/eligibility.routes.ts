// src/modules/eligibility/eligibility.routes.ts
import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { getPrismaForTenant } from '../../lib/tenantPrisma';
import { checkEligibility } from './eligibility.service';
import { resolveSisConnection } from './sisConnection';

export const eligibilityRouter = Router();

eligibilityRouter.get('/check/:electionID', async (req, res, next) => {
  try {
    const { voterID, tenantID, tenantSchema } = req.session!;
    const { electionID } = req.params;

    // SIS integration is optional (see eligibility.service.ts) — only used
    // if this institution has configured one.
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { TenantID: tenantID } });

    const db = await getPrismaForTenant(tenantSchema);
    const voter = await db.voter.findUniqueOrThrow({ where: { VoterID: voterID } });

    const sisConnection = resolveSisConnection(tenant);
    const result = await checkEligibility(
      tenantSchema,
      voter.StudentID,
      voterID,
      electionID,
      sisConnection?.baseURL,
      sisConnection?.apiKey
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});
