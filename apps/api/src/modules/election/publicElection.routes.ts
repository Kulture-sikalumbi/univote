// src/modules/election/publicElection.routes.ts
//
// The one election-related read any authenticated role (in practice:
// students) needs before they even have a ballot token: "which election
// is open right now?". Mounted ahead of the admin-only electionRouter at
// the same /api/v1/elections prefix in app.ts; falls through (via next())
// for every other path so the admin routes still apply there.
import { Router } from 'express';
import { getActiveElection } from './election.service';

export const publicElectionRouter = Router();

publicElectionRouter.get('/active', async (req, res, next) => {
  try {
    const election = await getActiveElection(req.session!.tenantSchema);
    if (!election) {
      return res.status(404).json({ error: 'No election is currently open' });
    }
    res.json(election);
  } catch (err) {
    next(err);
  }
});
