// src/modules/eligibility/mockSis.ts
//
// Dev-only stand-in for a real institutional Student Information System.
// Mounted at /mock-sis in app.ts, and ONLY outside production. Each real
// tenant is expected to configure its own SisBaseURL/SisApiKey (see the
// Tenant model) pointing at its actual SIS; this mock lets the eligibility
// flow (Section 6.3) and the integration tests run end-to-end without one.
//
// Status is derived deterministically from the Student ID so tests are
// reproducible without any seed data:
//   contains "HOLD"      -> ACTIVE enrollment, financial hold
//   contains "INACTIVE"  -> INACTIVE enrollment, no hold
//   contains "NOTFOUND"  -> 404 (simulates an unknown student)
//   anything else        -> ACTIVE enrollment, no hold
import { Router } from 'express';

export const mockSisRouter = Router();

mockSisRouter.get('/students/:studentID/status', (req, res) => {
  const studentID = req.params.studentID.toUpperCase();

  if (studentID.includes('NOTFOUND')) {
    return res.status(404).json({ error: 'Student not found' });
  }

  if (studentID.includes('INACTIVE')) {
    return res.json({ enrollmentStatus: 'INACTIVE', financialHold: false });
  }

  if (studentID.includes('HOLD')) {
    return res.json({ enrollmentStatus: 'ACTIVE', financialHold: true });
  }

  return res.json({ enrollmentStatus: 'ACTIVE', financialHold: false });
});

// Used by the School Admin "sync voter roll" action (Section 7's
// POST /voters/sync) to bulk-refresh enrollment status.
mockSisRouter.get('/roster', (_req, res) => {
  res.json({
    students: [
      { studentID: 'STU-ACTIVE-1', enrollmentStatus: 'ACTIVE', financialHold: false },
      { studentID: 'STU-HOLD-1', enrollmentStatus: 'ACTIVE', financialHold: true },
    ],
  });
});
