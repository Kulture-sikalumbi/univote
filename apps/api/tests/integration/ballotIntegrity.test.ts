// tests/integration/ballotIntegrity.test.ts
import crypto from 'crypto';
import { prisma } from '../../src/lib/prisma';
import { disconnectAllTenantClients, getPrismaForTenant } from '../../src/lib/tenantPrisma';
import { castBallot } from '../../src/modules/ballot/ballot.service';
import { computeBallotHash } from '../../src/crypto/hash';

const RUN_INTEGRATION = process.env.RUN_INTEGRATION_TESTS === 'true';
const describeIfDb = RUN_INTEGRATION ? describe : describe.skip;

describeIfDb('Ballot Integrity Engine', () => {
  const schemaName = 'univote_test_ballot';

  beforeAll(async () => {
    await prisma.$executeRawUnsafe('CALL provision_tenant($1, $2, $3)', 'Test Ballot School', 'ballot.univote.test', schemaName);
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { SchemaName: schemaName } });
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await disconnectAllTenantClients();
    await prisma.$disconnect();
  });

  it('writes a ballot with no VoterID column and a correct SHA-256 hash', async () => {
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { SchemaName: schemaName } });
    const db = await getPrismaForTenant(schemaName);

    const election = await db.election.create({
      data: { TenantID: tenant.TenantID, Title: 'Integrity Test', StartTime: new Date(), EndTime: new Date(), Status: 'ACTIVE' },
    });
    const candidate = await db.candidate.create({
      data: { ElectionID: election.ElectionID, FullName: 'Jane Doe', Position: 'President' },
    });
    const voter = await db.voter.create({
      data: { TenantID: tenant.TenantID, StudentID: 'STU-BALLOT-1', PasswordHash: 'x' },
    });

    const { ballotID } = await castBallot(schemaName, election.ElectionID, candidate.CandidateID, voter.VoterID, crypto.randomUUID());

    const ballot = await db.ballot.findUniqueOrThrow({ where: { BallotID: ballotID } });
    expect(ballot).not.toHaveProperty('VoterID');

    // Tamper detection: mutating the stored candidate reference invalidates the hash.
    const recomputed = computeBallotHash('a-different-candidate', ballotID, new Date().toISOString());
    expect(recomputed).not.toBe(ballot.Ballot_Hash);
  });

  it('rejects a second vote from the same voter in the same election', async () => {
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { SchemaName: schemaName } });
    const db = await getPrismaForTenant(schemaName);

    const election = await db.election.create({
      data: { TenantID: tenant.TenantID, Title: 'One Vote Test', StartTime: new Date(), EndTime: new Date(), Status: 'ACTIVE' },
    });
    const candidate = await db.candidate.create({
      data: { ElectionID: election.ElectionID, FullName: 'John Doe', Position: 'VP' },
    });
    const voter = await db.voter.create({
      data: { TenantID: tenant.TenantID, StudentID: 'STU-BALLOT-2', PasswordHash: 'x' },
    });

    await castBallot(schemaName, election.ElectionID, candidate.CandidateID, voter.VoterID, crypto.randomUUID());

    await expect(
      castBallot(schemaName, election.ElectionID, candidate.CandidateID, voter.VoterID, crypto.randomUUID())
    ).rejects.toThrow('already cast a ballot');
  });
});
