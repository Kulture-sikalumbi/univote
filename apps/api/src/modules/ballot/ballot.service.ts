// src/modules/ballot/ballot.service.ts
//
// Ballot Integrity Engine (Section 6.5). The Ballot row NEVER carries a
// VoterID — anonymity is a hard constraint — so "who voted" is recorded
// only in ElectionParticipant (Section 6.4), in the same transaction as
// the ballot write. The DB's UNIQUE(ElectionID, VoterID) constraint on
// ElectionParticipant is the actual one-vote-per-student enforcement
// mechanism; if it fires, the whole transaction (including the Ballot
// insert) rolls back, so a rejected second vote never leaves a partial
// ballot behind.
import crypto from 'crypto';
import { encryptTimestamp } from '../../crypto/encrypt';
import { computeBallotHash } from '../../crypto/hash';
import { getPrismaForTenant } from '../../lib/tenantPrisma';
import { blockToken } from '../../lib/tokenBlocklist';

export interface CastBallotResult {
  ballotID: string;
  confirmation: string;
}

export async function castBallot(
  tenantSchema: string,
  electionID: string,
  candidateIDs: string | string[],
  voterID: string,
  ballotTokenJti: string
): Promise<CastBallotResult> {
  const db = await getPrismaForTenant(tenantSchema);

  const selections = Array.isArray(candidateIDs) ? candidateIDs : [candidateIDs];
  const ballotRows = selections.map((candidateID) => {
    const ballotID = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    return {
      BallotID: ballotID,
      ElectionID: electionID,
      CandidateID: candidateID,
      Ballot_Hash: computeBallotHash(candidateID, ballotID, timestamp),
      Encrypted_Timestamp: encryptTimestamp(timestamp),
    };
  });

  try {
    await db.$transaction([
      ...ballotRows.map((data) => db.ballot.create({ data })),
      db.electionParticipant.create({
        data: { ElectionID: electionID, VoterID: voterID },
      }),
    ]);
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      throw new Error('You have already cast a ballot in this election.');
    }
    throw err;
  }

  // Single-use enforcement (Section 16): invalidate the ballot token in the
  // same operation as the ballot write.
  if (ballotTokenJti) {
    blockToken(ballotTokenJti);
  }

  // Partial hash as a human-readable receipt — never the full hash, so the
  // receipt alone can't be used to look up the vote in a leaked table dump.
  return {
    ballotID: ballotRows[0].BallotID,
    confirmation: ballotRows[0].Ballot_Hash.substring(0, 16),
  };
}

function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}
