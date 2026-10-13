// Student Voter Flow (Section 9 — strict sequence, do not deviate):
//   ELECTION LOOKUP -> ELIGIBILITY_CHECK -> BIOMETRIC_HANDSHAKE
//   -> BALLOT -> CONFIRM -> CAST -> DONE
//
// The credential (StudentID + password) session token is passed in from
// App.tsx once CredentialLogin has already run; everything below assumes
// that step is already complete.
import { useCallback, useEffect, useState } from 'react';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Spinner } from '../../components/Spinner';
import { api, ApiError } from '../../lib/api';
import { initials, mediaUrl } from '../../lib/media';
import { authenticateBiometricCredential, registerBiometricCredential } from '../../lib/webauthn';
import type {
  BallotLoginCompleteResponse,
  BallotResponse,
  Candidate,
  CastVoteResponse,
  Election,
  EligibilityResponse,
} from '../../lib/types';

type Step =
  | 'loading-election'
  | 'no-election'
  | 'checking-eligibility'
  | 'ineligible'
  | 'biometric-enroll'
  | 'biometric-verify'
  | 'biometric-verify-failed'
  | 'loading-ballot'
  | 'ballot'
  | 'confirm'
  | 'casting'
  | 'done'
  | 'fatal-error';

const REASON_MESSAGES: Record<string, string> = {
  NOT_ENROLLED: 'Our records show you are not currently enrolled as an active student.',
  FINANCIAL_HOLD:
    "Your account has a financial hold with the Bursar's office. Please clear it before voting.",
  ALREADY_VOTED: 'You have already cast your vote in this election. Thank you for participating!',
  ELECTION_CLOSED: 'This election is not currently open for voting.',
};

function eligibilityReasonFromError(err: unknown): string | null {
  if (!(err instanceof ApiError) || !err.body || typeof err.body !== 'object') return null;
  const reasonCode = (err.body as Record<string, unknown>).reasonCode;
  return typeof reasonCode === 'string' && REASON_MESSAGES[reasonCode] ? reasonCode : null;
}

interface StudentPortalProps {
  token: string;
  voterID: string;
}

export function StudentPortal({ token }: StudentPortalProps) {
  const [step, setStep] = useState<Step>('loading-election');
  const [error, setError] = useState<string | null>(null);
  const [election, setElection] = useState<Election | null>(null);
  const [ineligibleReason, setIneligibleReason] = useState<string | null>(null);
  const [ballotToken, setBallotToken] = useState<string | null>(null);
  const [ballot, setBallot] = useState<BallotResponse | null>(null);
  const [selectedCandidates, setSelectedCandidates] = useState<Record<string, Candidate>>({});
  const [receipt, setReceipt] = useState<CastVoteResponse | null>(null);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [retryAuthenticationOptions, setRetryAuthenticationOptions] =
    useState<PublicKeyCredentialRequestOptionsJSONLike | null>(null);

  const runEligibilityCheck = useCallback(async (electionID: string) => {
    setStep('checking-eligibility');
    try {
      const result = await api.get<EligibilityResponse>(`/eligibility/check/${electionID}`, token);
      if (!result.eligible) {
        setIneligibleReason(
          (result.reasonCode && REASON_MESSAGES[result.reasonCode]) ??
            'You are not eligible to vote in this election.'
        );
        setStep('ineligible');
        return;
      }
      // Eligible — proceed straight to the biometric handshake. We don't
      // know yet whether this voter has enrolled a credential; attempting
      // login/begin and falling back to registration on a specific error
      // avoids needing a separate "has credential" endpoint.
      await startBiometricLogin(electionID);
    } catch (err) {
      setError(describeError(err));
      setStep('fatal-error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    let cancelled = false;

    async function loadActiveElection() {
      try {
        const active = await api.get<Election>('/elections/active', token);
        if (cancelled) return;
        setElection(active);
        await runEligibilityCheck(active.ElectionID);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setStep('no-election');
        } else {
          setError(describeError(err));
          setStep('fatal-error');
        }
      }
    }

    loadActiveElection();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function startBiometricLogin(electionID: string) {
    setStep('biometric-verify');
    setError(null);
    try {
      const options = await api.post<PublicKeyCredentialRequestOptionsJSONLike>(
        '/auth/webauthn/login/begin',
        undefined,
        token
      );
      const assertion = await authenticateBiometricCredential(options);
      const { ballotToken: newBallotToken } = await api.post<BallotLoginCompleteResponse>(
        '/auth/webauthn/login/complete',
        { electionID, credential: assertion },
        token
      );
      setBallotToken(newBallotToken);
      await loadBallot(electionID, newBallotToken);
    } catch (err) {
      const reasonCode = eligibilityReasonFromError(err);
      if (reasonCode) {
        setIneligibleReason(REASON_MESSAGES[reasonCode]);
        setStep('ineligible');
        return;
      }
      if (err instanceof ApiError && err.status === 401 && err.message.includes('No biometric credential')) {
        setStep('biometric-enroll');
        return;
      }
      // Cancelled prompts, mismatched devices, failed assertions, etc. are
      // all recoverable — let the voter retry rather than dead-ending them.
      setError(describeError(err));
      setRetryAuthenticationOptions(null);
      setStep('biometric-verify-failed');
      // Prepare a fresh challenge before the next click. WebAuthn prompts
      // require a recent user gesture, so the retry handler must not fetch
      // options before calling navigator.credentials.get().
      try {
        const retryOptions = await api.post<PublicKeyCredentialRequestOptionsJSONLike>(
          '/auth/webauthn/login/begin',
          undefined,
          token
        );
        setRetryAuthenticationOptions(retryOptions);
      } catch {
        // Keep the original, useful biometric error visible. The user can
        // still retry from a fresh page/session if the API is unavailable.
      }
    }
  }

  async function retryBiometricLogin(electionID: string) {
    const options = retryAuthenticationOptions;
    if (!options) return;

    setRetryAuthenticationOptions(null);
    setError(null);
    setStep('biometric-verify');

    // Start the browser prompt synchronously in the click handler, before
    // any network await can consume the browser's transient user activation.
    const assertionPromise = authenticateBiometricCredential(options);
    try {
      const assertion = await assertionPromise;
      const { ballotToken: newBallotToken } = await api.post<BallotLoginCompleteResponse>(
        '/auth/webauthn/login/complete',
        { electionID, credential: assertion },
        token
      );
      setBallotToken(newBallotToken);
      await loadBallot(electionID, newBallotToken);
    } catch (err) {
      const reasonCode = eligibilityReasonFromError(err);
      if (reasonCode) {
        setIneligibleReason(REASON_MESSAGES[reasonCode]);
        setStep('ineligible');
        return;
      }

      setError(describeError(err));
      setStep('biometric-verify-failed');
      try {
        const freshOptions = await api.post<PublicKeyCredentialRequestOptionsJSONLike>(
          '/auth/webauthn/login/begin',
          undefined,
          token
        );
        setRetryAuthenticationOptions(freshOptions);
      } catch {
        // Retain the failure message; retry remains disabled until a fresh
        // challenge can be prepared.
      }
    }
  }

  async function enrollBiometricCredential(electionID: string) {
    setBusyLabel('Registering your device biometric…');
    setError(null);
    try {
      const options = await api.post<PublicKeyCredentialCreationOptionsJSONLike>(
        '/auth/webauthn/register/begin',
        undefined,
        token
      );
      const attestation = await registerBiometricCredential(options);
      await api.post('/auth/webauthn/register/complete', { credential: attestation }, token);
      await startBiometricLogin(electionID);
    } catch (err) {
      // Stay on the enrollment screen so the voter can retry immediately.
      setError(describeError(err));
    } finally {
      setBusyLabel(null);
    }
  }

  async function loadBallot(electionID: string, activeBallotToken: string) {
    setStep('loading-ballot');
    try {
      const result = await api.get<BallotResponse>(`/ballot/${electionID}`, activeBallotToken);
      setBallot(result);
      setStep('ballot');
    } catch (err) {
      setError(describeError(err));
      setStep('fatal-error');
    }
  }

  async function castVote() {
    if (!election || !ballotToken || !ballot || !hasCompleteSelections(ballot.election.offices, selectedCandidates)) return;
    setStep('casting');
    try {
      const result = await api.post<CastVoteResponse>(
        `/ballot/${election.ElectionID}/cast`,
        { candidateIDs: Object.values(selectedCandidates).map((candidate) => candidate.CandidateID) },
        ballotToken
      );
      setReceipt(result);
      setBallotToken(null); // single-use — never reused locally either.
      setStep('done');
    } catch (err) {
      setError(describeError(err));
      setStep('fatal-error');
    }
  }

  switch (step) {
    case 'loading-election':
    case 'checking-eligibility':
      return (
        <Card>
          <Spinner label={step === 'loading-election' ? 'Finding your election…' : 'Checking your eligibility…'} />
        </Card>
      );

    case 'no-election':
      return (
        <Card>
          <Alert variant="info" title="No election open right now">
            There is no active election at your institution at the moment. Please check back later.
          </Alert>
        </Card>
      );

    case 'ineligible':
      return (
        <Card>
          <Alert variant="warning" title="You can't vote in this election">
            {ineligibleReason}
          </Alert>
        </Card>
      );

    case 'biometric-enroll':
      return (
        <Card className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Set up biometric verification</h2>
          <p className="text-sm text-gray-600">
            This is your first time voting on this device. UniVote uses your device's fingerprint, face, or
            PIN unlock to confirm it's really you before you can cast a ballot — the same credential will
            work from any device you register it on.
          </p>
          {error && <Alert variant="error">{error}</Alert>}
          <Button fullWidth disabled={!!busyLabel} onClick={() => election && enrollBiometricCredential(election.ElectionID)}>
            {busyLabel ? <Spinner label={busyLabel} /> : 'Continue with biometric setup'}
          </Button>
        </Card>
      );

    case 'biometric-verify':
      return (
        <Card>
          <Spinner label="Waiting for biometric confirmation…" />
        </Card>
      );

    case 'biometric-verify-failed':
      return (
        <Card className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Biometric verification failed</h2>
          {error && <Alert variant="error">{error}</Alert>}
          <Button
            fullWidth
            disabled={!retryAuthenticationOptions}
            onClick={() => election && retryBiometricLogin(election.ElectionID)}
          >
            {retryAuthenticationOptions ? 'Try again' : 'Preparing secure retry…'}
          </Button>
        </Card>
      );

    case 'loading-ballot':
      return (
        <Card>
          <Spinner label="Loading your ballot…" />
        </Card>
      );

    case 'ballot':
      return ballot ? (
        <BallotStep
          ballot={ballot}
          selected={selectedCandidates}
          onSelect={(candidate) => setSelectedCandidates((current) => ({ ...current, [candidate.Position]: candidate }))}
          onConfirm={() => setStep('confirm')}
        />
      ) : null;

    case 'confirm':
      return ballot && hasCompleteSelections(ballot.election.offices, selectedCandidates) ? (
        <Card className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Confirm your vote</h2>
          <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-100 bg-slate-50 px-4">
            {Object.values(selectedCandidates).map((candidate) => (
              <li key={candidate.Position} className="py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{candidate.Position}</p>
                <p className="font-semibold text-gray-900">{candidate.FullName}</p>
                {candidate.Party && <p className="text-sm text-gray-600">{candidate.Party}</p>}
              </li>
            ))}
          </ul>
          <p className="text-sm text-gray-600">Your selections for all offices cannot be changed once submitted.</p>
          {error && <Alert variant="error">{error}</Alert>}
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setStep('ballot')}>
              Go back
            </Button>
            <Button fullWidth onClick={castVote}>
              Confirm &amp; cast vote
            </Button>
          </div>
        </Card>
      ) : null;

    case 'casting':
      return (
        <Card>
          <Spinner label="Casting your vote…" />
        </Card>
      );

    case 'done':
      return (
        <Card className="space-y-3 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-700">
            ✓
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Vote recorded</h2>
          <p className="text-sm text-gray-600">Thank you for participating in this election.</p>
          {receipt && (
            <p className="rounded-md bg-gray-50 px-3 py-2 font-mono text-xs text-gray-500">
              Receipt: {receipt.confirmation}…
            </p>
          )}
        </Card>
      );

    case 'fatal-error':
    default:
      return (
        <Card>
          <Alert variant="error" title="Something went wrong">
            {error ?? 'An unexpected error occurred. Please refresh and try again.'}
          </Alert>
        </Card>
      );
  }
}

function BallotStep({
  ballot,
  selected,
  onSelect,
  onConfirm,
}: {
  ballot: BallotResponse;
  selected: Record<string, Candidate>;
  onSelect: (c: Candidate) => void;
  onConfirm: () => void;
}) {
  const byPosition = groupByPosition(ballot.candidates, ballot.election.offices);

  return (
    <Card className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">{ballot.election.title}</h2>
        <p className="text-sm text-gray-500">Select one candidate for each office, then confirm your ballot.</p>
      </div>

      {Object.entries(byPosition).map(([position, candidates]) => (
        <div key={position} className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{position}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {candidates.map((candidate) => {
              const photo = mediaUrl(candidate.ImageURL);
              const isSelected = selected[position]?.CandidateID === candidate.CandidateID;
              return (
                <label
                  key={candidate.CandidateID}
                  className={[
                    'flex cursor-pointer gap-3 rounded-2xl border p-3 transition-all',
                    isSelected
                      ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/30'
                      : 'border-gray-200 bg-white hover:border-primary/40',
                  ].join(' ')}
                >
                  {photo ? (
                    <img src={photo} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
                  ) : (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-semibold text-primary">
                      {initials(candidate.FullName)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900">{candidate.FullName}</p>
                    {candidate.Party && <p className="text-sm text-gray-600">{candidate.Party}</p>}
                    {candidate.ManifestoURL && (
                      <a
                        href={candidate.ManifestoURL}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block text-xs font-medium text-primary underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Manifesto
                      </a>
                    )}
                  </div>
                  <input
                    type="radio"
                    name={`candidate-${position}`}
                    checked={isSelected}
                    onChange={() => onSelect(candidate)}
                    className="mt-1 h-4 w-4 shrink-0 text-primary"
                  />
                </label>
              );
            })}
          </div>
        </div>
      ))}

      <Button fullWidth disabled={!hasCompleteSelections(ballot.election.offices, selected)} onClick={onConfirm}>
        Review &amp; confirm
      </Button>
    </Card>
  );
}

function groupByPosition(candidates: Candidate[], offices: string[]): Record<string, Candidate[]> {
  const groups = Object.fromEntries(offices.map((office) => [office, [] as Candidate[]]));
  for (const candidate of candidates) {
    (groups[candidate.Position] ??= []).push(candidate);
  }
  return groups;
}

function hasCompleteSelections(offices: string[], selected: Record<string, Candidate>): boolean {
  return offices.length > 0 && offices.every((office) => selected[office]);
}

function describeError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'An unexpected error occurred.';
}

// Minimal local aliases — avoids depending on @simplewebauthn/browser's
// exported option types just to describe what api.post/get pass through.
type PublicKeyCredentialCreationOptionsJSONLike = Parameters<typeof registerBiometricCredential>[0];
type PublicKeyCredentialRequestOptionsJSONLike = Parameters<typeof authenticateBiometricCredential>[0];
