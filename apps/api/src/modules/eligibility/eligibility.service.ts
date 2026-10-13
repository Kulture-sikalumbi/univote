// src/modules/eligibility/eligibility.service.ts
//
// Simplified by design: most institutions using this system won't have a
// real SIS to integrate with, so the default path just trusts the school
// admin's own IsActive flag on the Voter record (set directly when they add
// a voter, or toggled from the voter list). A real SIS integration is still
// supported as an *optional* upgrade — pass sisBaseURL/sisApiKey (from the
// Tenant row) and it takes over enrolment/financial-hold checks — but it is
// never required.
import { getPrismaForTenant } from '../../lib/tenantPrisma';

export type EligibilityReasonCode = 'NOT_ENROLLED' | 'FINANCIAL_HOLD' | 'ALREADY_VOTED' | 'ELECTION_CLOSED';

export interface EligibilityResult {
  eligible: boolean;
  reasonCode?: EligibilityReasonCode;
}

interface SisStatusResponse {
  enrollmentStatus: string;
  financialHold: boolean;
}

export async function checkEligibility(
  tenantSchema: string,
  studentID: string,
  voterID: string,
  electionID: string,
  sisBaseURL?: string | null,
  sisApiKey?: string | null
): Promise<EligibilityResult> {
  const db = await getPrismaForTenant(tenantSchema);
  const voter = await db.voter.findUnique({ where: { VoterID: voterID } });
  if (!voter) {
    return { eligible: false, reasonCode: 'NOT_ENROLLED' };
  }

  if (sisBaseURL && sisApiKey) {
    // Optional path: a real institutional SIS integration.
    let sisResponse: Response;
    try {
      sisResponse = await fetch(`${sisBaseURL.replace(/\/+$/, '')}/students/${encodeURIComponent(studentID)}/status`, {
        headers: { Authorization: `Bearer ${sisApiKey}` },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      return { eligible: false, reasonCode: 'NOT_ENROLLED' };
    }

    if (!sisResponse.ok) {
      return { eligible: false, reasonCode: 'NOT_ENROLLED' };
    }

    const sisData = (await sisResponse.json()) as SisStatusResponse;

    if (sisData.enrollmentStatus !== 'ACTIVE') {
      return { eligible: false, reasonCode: 'NOT_ENROLLED' };
    }
    if (sisData.financialHold === true) {
      return { eligible: false, reasonCode: 'FINANCIAL_HOLD' };
    }
  }

  // The institution's local active flag remains an administrative veto even
  // when the SIS says the student is enrolled.
  if (!voter.IsActive) {
    return { eligible: false, reasonCode: 'NOT_ENROLLED' };
  }

  const election = await db.election.findUnique({ where: { ElectionID: electionID } });
  if (!election || election.Status !== 'ACTIVE') {
    return { eligible: false, reasonCode: 'ELECTION_CLOSED' };
  }

  // One-student-one-vote, enforced via the anonymity-preserving
  // ElectionParticipant table (Section 6.4) rather than the Ballot table,
  // which intentionally carries no VoterID.
  const existingParticipation = await db.electionParticipant.findUnique({
    where: { ElectionID_VoterID: { ElectionID: electionID, VoterID: voterID } },
  });
  if (existingParticipation) {
    return { eligible: false, reasonCode: 'ALREADY_VOTED' };
  }

  return { eligible: true };
}
