// src/modules/ballot/ballot.routes.ts
import { Router } from 'express';
import { getPrismaForTenant } from '../../lib/tenantPrisma';
import { castBallot } from './ballot.service';

export const ballotRouter = Router();

/** Defense in depth: the ballot token is scoped to one election and one
 * tenant schema; reject anything that doesn't match the URL/host it's
 * being used against, even though the JWT signature already guarantees
 * the token wasn't forged. */
function assertBallotScopeMatches(req: import('express').Request, res: import('express').Response): boolean {
  const ballot = req.ballot!;
  if (ballot.electionID !== req.params.electionID) {
    res.status(403).json({ error: 'This ballot token is not valid for this election' });
    return false;
  }
  if (ballot.tenantSchema !== req.tenantSchema) {
    res.status(403).json({ error: 'This ballot token is not valid for this institution' });
    return false;
  }
  return true;
}

ballotRouter.get('/:electionID', async (req, res, next) => {
  try {
    if (!assertBallotScopeMatches(req, res)) return;

    const { tenantSchema } = req.ballot!;
    const { electionID } = req.params;

    const db = await getPrismaForTenant(tenantSchema);
    const election = await db.election.findUnique({
      where: { ElectionID: electionID },
      include: {
        offices: { orderBy: { SortOrder: 'asc' } },
        candidates: true,
      },
    });

    if (!election) {
      return res.status(404).json({ error: 'Election not found' });
    }
    if (election.Status !== 'ACTIVE') {
      return res.status(403).json({ error: 'This election is not currently open for voting' });
    }

    res.json({
      election: {
        title: election.Title,
        status: election.Status,
        offices: election.offices.map((office) => office.Name),
      },
      candidates: election.candidates
        .sort((a, b) => a.Position.localeCompare(b.Position) || a.FullName.localeCompare(b.FullName))
        .map((c) => ({
        CandidateID: c.CandidateID,
        FullName: c.FullName,
        Position: c.Position,
        Party: c.Party,
        ManifestoURL: c.ManifestoURL,
        ImageURL: c.ImageURL,
      })),
    });
  } catch (err) {
    next(err);
  }
});

ballotRouter.post('/:electionID/cast', async (req, res, next) => {
  try {
    if (!assertBallotScopeMatches(req, res)) return;

    const { voterID, electionID: tokenElectionID, tenantSchema, jti } = req.ballot!;
    const { candidateID, candidateIDs } = req.body ?? {};
    const selectedIDs: unknown = candidateIDs ?? (candidateID ? [candidateID] : []);

    if (!Array.isArray(selectedIDs) || selectedIDs.length === 0 || selectedIDs.some((id) => typeof id !== 'string')) {
      return res.status(400).json({ error: 'candidateIDs must contain one selected candidate for each office' });
    }

    const db = await getPrismaForTenant(tenantSchema);
    const electionCandidates = await db.candidate.findMany({ where: { ElectionID: tokenElectionID } });
    const uniqueIDs = new Set(selectedIDs as string[]);
    const selections = electionCandidates.filter((candidate) => uniqueIDs.has(candidate.CandidateID));
    const configuredOffices = await db.electionOffice.findMany({
      where: { ElectionID: tokenElectionID },
      select: { Name: true },
    });
    const allOffices = new Set(configuredOffices.map((office) => office.Name));
    const selectedOffices = new Set(selections.map((candidate) => candidate.Position));

    if (selections.length !== uniqueIDs.size || selections.length !== selectedIDs.length) {
      return res.status(400).json({ error: 'One or more selected candidates are not valid for this election' });
    }
    if (selectedOffices.size !== selections.length) {
      return res.status(400).json({ error: 'Select only one candidate for each office' });
    }
    if (selectedOffices.size !== allOffices.size) {
      return res.status(400).json({ error: 'Select one candidate for every office before submitting your ballot' });
    }

    const result = await castBallot(
      tenantSchema,
      tokenElectionID,
      selections.map((candidate) => candidate.CandidateID),
      voterID,
      jti
    );
    res.status(201).json(result);
  } catch (err) {
    if (err instanceof Error && err.message.includes('already cast a ballot')) {
      return res.status(409).json({ error: err.message });
    }
    next(err);
  }
});
