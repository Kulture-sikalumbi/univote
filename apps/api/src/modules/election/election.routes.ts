// src/modules/election/election.routes.ts
import { Router } from 'express';
import {
  addCandidate,
  createElection,
  ElectionConfigurationError,
  getCandidate,
  getResults,
  isValidStatus,
  listElections,
  setElectionOptions,
  setCandidateImage,
  setElectionStatus,
} from './election.service';
import { candidateImageUpload, removeStoredImage, storeImage } from '../../lib/uploads';

export const electionRouter = Router();

function parseOptionList(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) return null;
  const options = value.map((entry: string) => entry.trim()).filter(Boolean);
  if (options.some((entry) => entry.length > 100)) return null;
  if (new Set(options.map((entry) => entry.toLocaleLowerCase())).size !== options.length) return null;
  return options;
}

electionRouter.get('/', async (req, res, next) => {
  try {
    const elections = await listElections(req.session!.tenantSchema);
    res.json(elections);
  } catch (err) {
    next(err);
  }
});

electionRouter.post('/', async (req, res, next) => {
  try {
    const { title, startTime, endTime } = req.body ?? {};
    if (!title || !startTime || !endTime) {
      return res.status(400).json({ error: 'title, startTime and endTime are required' });
    }

    const election = await createElection(
      req.session!.tenantSchema,
      req.session!.tenantID,
      title,
      new Date(startTime),
      new Date(endTime)
    );
    res.status(201).json(election);
  } catch (err) {
    next(err);
  }
});

electionRouter.put('/:id/options', async (req, res, next) => {
  try {
    const offices = parseOptionList(req.body?.offices);
    const affiliations = parseOptionList(req.body?.affiliations ?? []);
    if (!offices || offices.length === 0 || !affiliations) {
      return res.status(400).json({
        error: 'Add at least one office and provide unique office and affiliation names (up to 100 characters each).',
      });
    }

    const election = await setElectionOptions(req.session!.tenantSchema, req.params.id, offices, affiliations);
    if (!election) return res.status(404).json({ error: 'Election not found' });
    res.json(election);
  } catch (err) {
    if (err instanceof ElectionConfigurationError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    next(err);
  }
});

electionRouter.put('/:id/status', async (req, res, next) => {
  try {
    const { status } = req.body ?? {};
    if (!isValidStatus(status)) {
      return res.status(400).json({ error: 'status must be one of DRAFT, ACTIVE, CLOSED' });
    }

    const election = await setElectionStatus(req.session!.tenantSchema, req.params.id, status);
    res.json(election);
  } catch (err) {
    if (err instanceof ElectionConfigurationError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    next(err);
  }
});

electionRouter.get('/:id/results', async (req, res, next) => {
  try {
    const results = await getResults(req.session!.tenantSchema, req.params.id);
    res.json(results);
  } catch (err) {
    next(err);
  }
});

electionRouter.post(
  '/:id/candidates',
  candidateImageUpload.single('image'),
  async (req, res, next) => {
    try {
      // multipart fields land on req.body as strings; JSON callers still work
      // when Content-Type is application/json (multer is a no-op then).
      const fullName = req.body?.fullName;
      const position = req.body?.position;
      const party = typeof req.body?.party === 'string' ? req.body.party.trim() || undefined : undefined;
      const manifestoURL = req.body?.manifestoURL || undefined;
      if (!fullName || !position) {
        return res.status(400).json({ error: 'fullName and position are required' });
      }

      const imageURL = req.file
        ? await storeImage('candidates', req.file, `${req.session!.tenantSchema}_${req.params.id}`)
        : undefined;
      const candidate = await addCandidate(
        req.session!.tenantSchema,
        req.params.id,
        fullName,
        position,
        party,
        manifestoURL,
        imageURL
      );
      res.status(201).json(candidate);
    } catch (err) {
      if (err instanceof ElectionConfigurationError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      next(err);
    }
  }
);

/** Replace (or clear) a candidate photo after create. */
electionRouter.put(
  '/:id/candidates/:candidateId/image',
  candidateImageUpload.single('image'),
  async (req, res, next) => {
    try {
      const schema = req.session!.tenantSchema;
      const electionID = req.params.id;
      const candidateID = req.params.candidateId;

      const existing = await getCandidate(schema, electionID, candidateID);
      if (!existing) {
        return res.status(404).json({ error: 'Candidate not found' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'image file is required (field name: image)' });
      }

      const imageURL = await storeImage('candidates', req.file, `${schema}_${electionID}`);
      const candidate = await setCandidateImage(schema, electionID, candidateID, imageURL);
      await removeStoredImage(existing.ImageURL);
      res.json(candidate);
    } catch (err) {
      next(err);
    }
  }
);

electionRouter.delete('/:id/candidates/:candidateId/image', async (req, res, next) => {
  try {
    const schema = req.session!.tenantSchema;
    const electionID = req.params.id;
    const candidateID = req.params.candidateId;

    const existing = await getCandidate(schema, electionID, candidateID);
    if (!existing) {
      return res.status(404).json({ error: 'Candidate not found' });
    }

    const candidate = await setCandidateImage(schema, electionID, candidateID, null);
    await removeStoredImage(existing.ImageURL);
    res.json(candidate);
  } catch (err) {
    next(err);
  }
});
