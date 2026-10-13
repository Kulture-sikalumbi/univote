// src/modules/schooladmin/schooladmin.routes.ts
import { Router } from 'express';
import {
  addVoter,
  getSisIntegrationSettings,
  listVoters,
  saveSisIntegrationSettings,
  SchoolAdminError,
  setVoterActive,
  syncVoterRoll,
} from './schooladmin.service';

export const schoolAdminRouter = Router();

schoolAdminRouter.get('/', async (req, res, next) => {
  try {
    const voters = await listVoters(req.session!.tenantSchema);
    res.json(voters);
  } catch (err) {
    next(err);
  }
});

schoolAdminRouter.post('/', async (req, res, next) => {
  try {
    const { studentID, password } = req.body ?? {};
    const voter = await addVoter(req.session!.tenantSchema, req.session!.tenantID, studentID, password);
    res.status(201).json(voter);
  } catch (err) {
    next(err);
  }
});

schoolAdminRouter.get('/sis-integration', async (req, res, next) => {
  try {
    res.json(await getSisIntegrationSettings(req.session!.tenantID));
  } catch (err) {
    next(err);
  }
});

schoolAdminRouter.put('/sis-integration', async (req, res, next) => {
  try {
    const { sisBaseURL, sisApiKey, clear } = req.body ?? {};
    if (typeof clear !== 'undefined' && typeof clear !== 'boolean') {
      return res.status(400).json({ error: 'clear must be a boolean' });
    }
    if (typeof sisBaseURL !== 'undefined' && typeof sisBaseURL !== 'string') {
      return res.status(400).json({ error: 'sisBaseURL must be a string' });
    }
    if (typeof sisApiKey !== 'undefined' && typeof sisApiKey !== 'string') {
      return res.status(400).json({ error: 'sisApiKey must be a string' });
    }
    res.json(await saveSisIntegrationSettings(req.session!.tenantID, { sisBaseURL, sisApiKey, clear }));
  } catch (err) {
    next(err);
  }
});

schoolAdminRouter.post('/sync', async (req, res, next) => {
  try {
    res.json(await syncVoterRoll(req.session!.tenantSchema, req.session!.tenantID));
  } catch (err) {
    next(err);
  }
});

schoolAdminRouter.put('/:voterID/active', async (req, res, next) => {
  try {
    const { isActive } = req.body ?? {};
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'isActive must be a boolean' });
    }
    const voter = await setVoterActive(req.session!.tenantSchema, req.params.voterID, isActive);
    res.json(voter);
  } catch (err) {
    next(err);
  }
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
schoolAdminRouter.use((err: Error, _req: any, res: any, _next: any) => {
  if (err instanceof SchoolAdminError) {
    return res.status(err.status).json({ error: err.message });
  }
  return res.status(500).json({ error: 'Internal server error' });
});
