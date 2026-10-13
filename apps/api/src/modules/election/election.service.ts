// src/modules/election/election.service.ts
import { getPrismaForTenant } from '../../lib/tenantPrisma';

export type ElectionStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED';
const VALID_STATUSES: ElectionStatus[] = ['DRAFT', 'ACTIVE', 'CLOSED'];

export function isValidStatus(status: unknown): status is ElectionStatus {
  return typeof status === 'string' && VALID_STATUSES.includes(status as ElectionStatus);
}

export class ElectionConfigurationError extends Error {
  constructor(message: string, readonly statusCode = 409) {
    super(message);
    this.name = 'ElectionConfigurationError';
  }
}

export async function listElections(tenantSchema: string) {
  const db = await getPrismaForTenant(tenantSchema);
  return db.election.findMany({
    orderBy: { CreatedAt: 'desc' },
    include: {
      offices: { orderBy: { SortOrder: 'asc' } },
      affiliations: { orderBy: { Name: 'asc' } },
      candidates: { orderBy: [{ Position: 'asc' }, { FullName: 'asc' }] },
    },
  });
}

// Not in the Section 7 contract table, which has no student-facing "which
// election is open right now" endpoint even though Section 9's voter flow
// requires an electionID before ELIGIBILITY_CHECK can run. Exposed as a
// narrow, any-authenticated-role read (see publicElection.routes.ts) rather
// than widening the admin-only /elections list to students.
export async function getActiveElection(tenantSchema: string) {
  const db = await getPrismaForTenant(tenantSchema);
  return db.election.findFirst({
    where: { Status: 'ACTIVE' },
    orderBy: { CreatedAt: 'desc' },
    include: { offices: { orderBy: { SortOrder: 'asc' } } },
  });
}

export async function createElection(
  tenantSchema: string,
  tenantID: string,
  title: string,
  startTime: Date,
  endTime: Date
) {
  const db = await getPrismaForTenant(tenantSchema);
  return db.election.create({
    data: { TenantID: tenantID, Title: title, StartTime: startTime, EndTime: endTime, Status: 'DRAFT' },
  });
}

export async function setElectionStatus(tenantSchema: string, electionID: string, status: ElectionStatus) {
  const db = await getPrismaForTenant(tenantSchema);

  if (status === 'ACTIVE') {
    const [offices, candidates] = await Promise.all([
      db.electionOffice.findMany({ where: { ElectionID: electionID }, orderBy: { SortOrder: 'asc' } }),
      db.candidate.findMany({ where: { ElectionID: electionID }, select: { Position: true } }),
    ]);
    if (offices.length === 0) {
      throw new ElectionConfigurationError('Add at least one office before opening this election.');
    }
    const candidateOffices = new Set(candidates.map((candidate) => candidate.Position));
    const missingOffice = offices.find((office) => !candidateOffices.has(office.Name));
    if (missingOffice) {
      throw new ElectionConfigurationError(`Add at least one candidate for ${missingOffice.Name} before opening this election.`);
    }
  }

  return db.election.update({ where: { ElectionID: electionID }, data: { Status: status } });
}

export async function setElectionOptions(
  tenantSchema: string,
  electionID: string,
  offices: string[],
  affiliations: string[]
) {
  const db = await getPrismaForTenant(tenantSchema);
  return db.$transaction(async (tx) => {
    const election = await tx.election.findUnique({
      where: { ElectionID: electionID },
      select: { Status: true },
    });
    if (!election) return null;
    if (election.Status !== 'DRAFT') {
      throw new ElectionConfigurationError('Election offices and affiliations can only be changed while the election is a draft.');
    }
    const existingCandidates = await tx.candidate.findMany({
      where: { ElectionID: electionID },
      select: { Position: true, Party: true },
    });
    const officeNames = new Set(offices);
    const affiliationNames = new Set(affiliations);
    if (existingCandidates.some((candidate) => !officeNames.has(candidate.Position))) {
      throw new ElectionConfigurationError('Keep every office already assigned to a candidate in the office list.');
    }
    if (existingCandidates.some((candidate) => candidate.Party && !affiliationNames.has(candidate.Party))) {
      throw new ElectionConfigurationError('Keep every affiliation already assigned to a candidate in the affiliation list.');
    }

    await tx.electionOffice.deleteMany({ where: { ElectionID: electionID } });
    await tx.electionAffiliation.deleteMany({ where: { ElectionID: electionID } });
    await tx.electionOffice.createMany({
      data: offices.map((Name, SortOrder) => ({ ElectionID: electionID, Name, SortOrder })),
    });
    if (affiliations.length > 0) {
      await tx.electionAffiliation.createMany({
        data: affiliations.map((Name) => ({ ElectionID: electionID, Name })),
      });
    }

    return tx.election.findUnique({
      where: { ElectionID: electionID },
      include: {
        offices: { orderBy: { SortOrder: 'asc' } },
        affiliations: { orderBy: { Name: 'asc' } },
      },
    });
  });
}

export async function addCandidate(
  tenantSchema: string,
  electionID: string,
  fullName: string,
  position: string,
  party?: string,
  manifestoURL?: string,
  imageURL?: string
) {
  const db = await getPrismaForTenant(tenantSchema);
  const election = await db.election.findUnique({
    where: { ElectionID: electionID },
    include: { offices: true, affiliations: true },
  });
  if (!election) throw new ElectionConfigurationError('Election not found.', 404);
  if (election.Status !== 'DRAFT') {
    throw new ElectionConfigurationError('Candidates can only be added while the election is a draft.');
  }
  if (!election.offices.some((office) => office.Name === position)) {
    throw new ElectionConfigurationError('Choose an office configured for this election.');
  }
  const normalizedParty = party?.trim() || null;
  if (normalizedParty && !election.affiliations.some((affiliation) => affiliation.Name === normalizedParty)) {
    throw new ElectionConfigurationError('Choose an affiliation configured for this election.');
  }

  return db.candidate.create({
    data: {
      ElectionID: electionID,
      FullName: fullName,
      Position: position,
      Party: normalizedParty,
      ManifestoURL: manifestoURL ?? null,
      ImageURL: imageURL ?? null,
    },
  });
}

export async function getCandidate(tenantSchema: string, electionID: string, candidateID: string) {
  const db = await getPrismaForTenant(tenantSchema);
  return db.candidate.findFirst({
    where: { CandidateID: candidateID, ElectionID: electionID },
  });
}

export async function setCandidateImage(
  tenantSchema: string,
  electionID: string,
  candidateID: string,
  imageURL: string | null
) {
  const db = await getPrismaForTenant(tenantSchema);
  const existing = await getCandidate(tenantSchema, electionID, candidateID);
  if (!existing) return null;
  return db.candidate.update({
    where: { CandidateID: candidateID },
    data: { ImageURL: imageURL },
  });
}

export interface TallyEntry {
  candidateID: string;
  fullName: string;
  position: string;
  party: string | null;
  votes: number;
}

export interface ResultsResponse {
  tally: TallyEntry[];
  totalParticipants: number;
}

/**
 * Real-time result tally. Deliberately joins Candidate -> count(Ballot) only
 * — never joins through ElectionParticipant, which would be the only way to
 * (incorrectly) associate a specific voter with a specific candidate. The
 * two tables must never be joined together (Section 6.4).
 */
export async function getResults(tenantSchema: string, electionID: string): Promise<ResultsResponse> {
  const db = await getPrismaForTenant(tenantSchema);

  const candidates = await db.candidate.findMany({
    where: { ElectionID: electionID },
    include: { _count: { select: { ballots: true } } },
  });

  const totalParticipants = await db.electionParticipant.count({ where: { ElectionID: electionID } });

  return {
    tally: candidates.map((c) => ({
      candidateID: c.CandidateID,
      fullName: c.FullName,
      position: c.Position,
      party: c.Party,
      votes: c._count.ballots,
    })),
    totalParticipants,
  };
}
