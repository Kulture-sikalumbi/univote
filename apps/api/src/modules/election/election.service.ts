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
  const now = new Date();
  await db.election.updateMany({
    where: { Status: 'ACTIVE', EndTime: { lte: now } },
    data: { Status: 'CLOSED' },
  });
  const elections = await db.election.findMany({
    orderBy: { CreatedAt: 'desc' },
    include: {
      offices: { orderBy: { SortOrder: 'asc' } },
      affiliations: { orderBy: { Name: 'asc' } },
      candidates: { orderBy: [{ Position: 'asc' }, { FullName: 'asc' }] },
    },
  });
  return elections.map((election) => presentElectionStatus(election, now));
}

function presentElectionStatus<T extends { Status: string; StartTime: Date; EndTime: Date }>(election: T, now: Date): T {
  if (election.Status === 'ACTIVE' && election.StartTime > now) {
    return { ...election, Status: 'SCHEDULED' };
  }
  return election;
}

// Not in the Section 7 contract table, which has no student-facing "which
// election is open right now" endpoint even though Section 9's voter flow
// requires an electionID before ELIGIBILITY_CHECK can run. Exposed as a
// narrow, any-authenticated-role read (see publicElection.routes.ts) rather
// than widening the admin-only /elections list to students.
export async function getActiveElection(tenantSchema: string) {
  const db = await getPrismaForTenant(tenantSchema);
  const now = new Date();
  await db.election.updateMany({
    where: { Status: 'ACTIVE', EndTime: { lte: now } },
    data: { Status: 'CLOSED' },
  });
  const active = await db.election.findFirst({
    where: { Status: 'ACTIVE', StartTime: { lte: now }, EndTime: { gt: now } },
    orderBy: { CreatedAt: 'desc' },
    include: { offices: { orderBy: { SortOrder: 'asc' } } },
  });
  if (active) return active;

  const upcoming = await db.election.findFirst({
    where: { Status: 'ACTIVE', StartTime: { gt: now }, EndTime: { gt: now } },
    orderBy: { StartTime: 'asc' },
    include: { offices: { orderBy: { SortOrder: 'asc' } } },
  });
  return upcoming ? { ...upcoming, Status: 'SCHEDULED' } : null;
}

export async function createElection(
  tenantSchema: string,
  tenantID: string,
  title: string,
  startTime: Date,
  endTime: Date
) {
  if (!title.trim()) throw new ElectionConfigurationError('Enter an election title.', 400);
  if (!Number.isFinite(startTime.getTime()) || !Number.isFinite(endTime.getTime())) {
    throw new ElectionConfigurationError('Enter valid election start and end times.', 400);
  }
  if (startTime <= new Date()) {
    throw new ElectionConfigurationError('The scheduled start time must be in the future.', 400);
  }
  if (endTime <= startTime) {
    throw new ElectionConfigurationError('The election end time must be after its start time.', 400);
  }
  const db = await getPrismaForTenant(tenantSchema);
  return db.election.create({
    data: { TenantID: tenantID, Title: title, StartTime: startTime, EndTime: endTime, Status: 'DRAFT' },
  });
}

export async function setElectionStatus(tenantSchema: string, electionID: string, status: ElectionStatus) {
  const db = await getPrismaForTenant(tenantSchema);
  const now = new Date();
  await db.election.updateMany({
    where: { Status: 'ACTIVE', EndTime: { lte: now } },
    data: { Status: 'CLOSED' },
  });
  const current = await db.election.findUnique({ where: { ElectionID: electionID } });
  if (!current) throw new ElectionConfigurationError('Election not found.', 404);

  if (current.Status === 'CLOSED' && status !== 'CLOSED') {
    throw new ElectionConfigurationError('A closed election cannot be reopened.');
  }
  if (current.Status === 'ACTIVE' && status === 'DRAFT' && current.StartTime <= now) {
    throw new ElectionConfigurationError('A started election cannot return to draft.');
  }
  if (status === 'ACTIVE') {
    if (current.EndTime <= now) {
      throw new ElectionConfigurationError('This election has already passed its scheduled end time.');
    }
    if (current.StartTime >= current.EndTime) {
      throw new ElectionConfigurationError('The election end time must be after its start time.', 400);
    }
    const overlap = await db.election.findFirst({
      where: {
        ElectionID: { not: electionID },
        Status: 'ACTIVE',
        StartTime: { lt: current.EndTime },
        EndTime: { gt: current.StartTime },
      },
      select: { ElectionID: true, Title: true },
    });
    if (overlap) {
      throw new ElectionConfigurationError(`This schedule overlaps with "${overlap.Title}".`);
    }
  }

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
  electionID: string;
  electionTitle: string;
  endTime: Date;
  tally: TallyEntry[];
  totalParticipants: number;
}

export class ResultsNotPublishedError extends Error {
  constructor(readonly endTime: Date) {
    super('Final results will be available after the election has ended.');
    this.name = 'ResultsNotPublishedError';
  }
}

/**
 * Final result tally. Deliberately joins Candidate -> count(Ballot) only
 * — never joins through ElectionParticipant, which would be the only way to
 * (incorrectly) associate a specific voter with a specific candidate. The
 * two tables must never be joined together (Section 6.4).
 */
export async function getResults(tenantSchema: string, electionID: string, now = new Date()): Promise<ResultsResponse> {
  const db = await getPrismaForTenant(tenantSchema);

  const election = await db.election.findUnique({ where: { ElectionID: electionID } });
  if (!election) throw new ElectionConfigurationError('Election not found.', 404);
  if (election.Status === 'DRAFT' || (election.Status !== 'CLOSED' && election.EndTime > now)) {
    throw new ResultsNotPublishedError(election.EndTime);
  }

  const candidates = await db.candidate.findMany({
    where: { ElectionID: electionID },
    include: { _count: { select: { ballots: true } } },
  });

  const totalParticipants = await db.electionParticipant.count({ where: { ElectionID: electionID } });

  return {
    electionID,
    electionTitle: election.Title,
    endTime: election.EndTime,
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

export async function getPublishedResults(tenantSchema: string, now = new Date()): Promise<ResultsResponse[]> {
  const db = await getPrismaForTenant(tenantSchema);
  await db.election.updateMany({
    where: { Status: 'ACTIVE', EndTime: { lte: now } },
    data: { Status: 'CLOSED' },
  });
  const elections = await db.election.findMany({
    where: {
      OR: [
        { Status: 'CLOSED' },
        { Status: 'ACTIVE', EndTime: { lte: now } },
      ],
    },
    orderBy: { EndTime: 'desc' },
    select: { ElectionID: true },
  });
  return Promise.all(elections.map(({ ElectionID }) => getResults(tenantSchema, ElectionID, now)));
}
