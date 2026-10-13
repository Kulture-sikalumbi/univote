// School Admin portal: manage branding, elections, and the voter roll.
import { useCallback, useEffect, useState } from 'react';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Spinner } from '../../components/Spinner';
import { TextField } from '../../components/TextField';
import { api, ApiError } from '../../lib/api';
import { initials, mediaUrl } from '../../lib/media';
import type {
  Branding,
  Candidate,
  Election,
  ElectionAffiliation,
  ElectionOffice,
  ElectionStatus,
  ResultsResponse,
  Voter,
} from '../../lib/types';

type Tab = 'elections' | 'voters' | 'branding';

interface SchoolAdminPortalProps {
  token: string;
}

export function SchoolAdminPortal({ token }: SchoolAdminPortalProps) {
  const [tab, setTab] = useState<Tab>('elections');

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap gap-2">
        <TabButton active={tab === 'elections'} onClick={() => setTab('elections')}>
          Elections
        </TabButton>
        <TabButton active={tab === 'voters'} onClick={() => setTab('voters')}>
          Voters
        </TabButton>
        <TabButton active={tab === 'branding'} onClick={() => setTab('branding')}>
          Branding
        </TabButton>
      </div>

      {tab === 'elections' && <ElectionsTab token={token} />}
      {tab === 'voters' && <VotersTab token={token} />}
      {tab === 'branding' && <BrandingTab token={token} />}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'rounded-md px-4 py-2 text-sm font-medium transition-colors',
        active ? 'bg-primary text-white' : 'bg-white text-gray-600 hover:bg-gray-100',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function describeError(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

// ---------------------------------------------------------------------------
// Elections
// ---------------------------------------------------------------------------

function ElectionsTab({ token }: { token: string }) {
  const [elections, setElections] = useState<Election[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedID, setExpandedID] = useState<string | null>(null);

  const reload = useCallback(async (openElectionID?: string) => {
    try {
      const list = await api.get<Election[]>('/elections', token);
      setElections(list);
      if (openElectionID) setExpandedID(openElectionID);
    } catch (err) {
      setError(describeError(err, 'Could not load elections.'));
    }
  }, [token]);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="mb-3 text-base font-semibold text-gray-900">Create election</h2>
        <CreateElectionForm token={token} onCreated={(electionID) => reload(electionID)} />
      </Card>

      {error && <Alert variant="error">{error}</Alert>}

      {elections === null ? (
        <Spinner label="Loading elections…" />
      ) : elections.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-500">No elections yet. Create one above.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {elections.map((election) => (
            <ElectionCard
              key={election.ElectionID}
              token={token}
              election={election}
              expanded={expandedID === election.ElectionID}
              onToggle={() => setExpandedID(expandedID === election.ElectionID ? null : election.ElectionID)}
              onChanged={reload}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CreateElectionForm({ token, onCreated }: { token: string; onCreated: (electionID: string) => void }) {
  const [title, setTitle] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const election = await api.post<Election>('/elections', { title, startTime, endTime }, token);
      setTitle('');
      setStartTime('');
      setEndTime('');
      onCreated(election.ElectionID);
    } catch (err) {
      setError(describeError(err, 'Could not create election.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && <Alert variant="error">{error}</Alert>}
      <TextField label="Title" name="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextField
          label="Start"
          name="startTime"
          type="datetime-local"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          required
        />
        <TextField
          label="End"
          name="endTime"
          type="datetime-local"
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
          required
        />
      </div>
      <Button type="submit" disabled={busy}>
        {busy ? <Spinner label="Creating…" /> : 'Create election'}
      </Button>
    </form>
  );
}

const STATUS_STYLES: Record<ElectionStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  ACTIVE: 'bg-green-100 text-green-700',
  CLOSED: 'bg-red-100 text-red-700',
};

function ElectionCard({
  token,
  election,
  expanded,
  onToggle,
  onChanged,
}: {
  token: string;
  election: Election;
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function setStatus(status: ElectionStatus) {
    setError(null);
    setBusy(true);
    try {
      await api.put(`/elections/${election.ElectionID}/status`, { status }, token);
      onChanged();
    } catch (err) {
      setError(describeError(err, 'Could not update status.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <button type="button" onClick={onToggle} className="text-left">
          <p className="font-medium text-gray-900">{election.Title}</p>
          <p className="text-xs text-gray-500">
            {new Date(election.StartTime).toLocaleString()} → {new Date(election.EndTime).toLocaleString()}
          </p>
        </button>
        <span className={['rounded-full px-3 py-1 text-xs font-medium', STATUS_STYLES[election.Status]].join(' ')}>
          {election.Status}
        </span>
      </div>

      {expanded && (
        <div className="mt-4 space-y-4 border-t border-gray-100 pt-4">
          {error && <Alert variant="error">{error}</Alert>}
          <div className="flex gap-2">
            {(['DRAFT', 'ACTIVE', 'CLOSED'] as ElectionStatus[]).map((status) => (
              <Button
                key={status}
                variant={election.Status === status ? 'primary' : 'secondary'}
                disabled={busy || election.Status === status}
                onClick={() => setStatus(status)}
              >
                {status}
              </Button>
            ))}
          </div>

          <ElectionOptionsForm token={token} election={election} onSaved={onChanged} />
          <CandidateList
            token={token}
            electionID={election.ElectionID}
            candidates={election.candidates ?? []}
            onChanged={onChanged}
          />
          {election.Status === 'DRAFT' && (election.offices?.length ?? 0) > 0 ? (
            <AddCandidateForm
              token={token}
              electionID={election.ElectionID}
              offices={election.offices ?? []}
              affiliations={election.affiliations ?? []}
              onAdded={onChanged}
            />
          ) : election.Status === 'DRAFT' ? (
            <p className="text-sm text-gray-500">Add at least one office above before adding candidates.</p>
          ) : (
            <p className="text-sm text-gray-500">Candidate entries are locked after the election leaves draft.</p>
          )}
          <ResultsPanel token={token} electionID={election.ElectionID} />
        </div>
      )}
    </Card>
  );
}

function ElectionOptionsForm({
  token,
  election,
  onSaved,
}: {
  token: string;
  election: Election;
  onSaved: () => void | Promise<void>;
}) {
  const [offices, setOffices] = useState((election.offices ?? []).map((office) => office.Name).join('\n'));
  const [affiliations, setAffiliations] = useState((election.affiliations ?? []).map((item) => item.Name).join('\n'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canEdit = election.Status === 'DRAFT';

  useEffect(() => {
    setOffices((election.offices ?? []).map((office) => office.Name).join('\n'));
    setAffiliations((election.affiliations ?? []).map((item) => item.Name).join('\n'));
  }, [election.ElectionID, election.offices, election.affiliations]);

  async function saveOptions(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const officeNames = offices.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
      const affiliationNames = affiliations.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
      await api.put(`/elections/${election.ElectionID}/options`, {
        offices: officeNames,
        affiliations: affiliationNames,
      }, token);
      await onSaved();
    } catch (err) {
      setError(describeError(err, 'Could not save election offices and affiliations.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={saveOptions} className="space-y-3 rounded-xl border border-gray-100 bg-slate-50 p-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-800">Ballot setup</h3>
        <p className="mt-1 text-xs text-gray-500">Add one item per line. Candidates will choose from these lists.</p>
      </div>
      {error && <Alert variant="error">{error}</Alert>}
      <label className="block space-y-1 text-sm font-medium text-gray-700">
        <span>Offices / positions</span>
        <textarea
          rows={3}
          value={offices}
          onChange={(e) => setOffices(e.target.value)}
          disabled={!canEdit || busy}
          placeholder={'President\nVice President\nSecretary'}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm disabled:bg-gray-100"
        />
      </label>
      <label className="block space-y-1 text-sm font-medium text-gray-700">
        <span>Party / affiliation options (optional)</span>
        <textarea
          rows={3}
          value={affiliations}
          onChange={(e) => setAffiliations(e.target.value)}
          disabled={!canEdit || busy}
          placeholder={'Student Union Party\nIndependent'}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm disabled:bg-gray-100"
        />
      </label>
      {(election.candidates?.length ?? 0) > 0 && (
        <p className="text-xs text-gray-500">Keep offices and affiliations already used by candidates in these lists.</p>
      )}
      {election.Status !== 'DRAFT' && <p className="text-xs text-gray-500">Ballot options are locked after the election leaves draft.</p>}
      <Button type="submit" variant="secondary" disabled={!canEdit || busy}>
        {busy ? <Spinner label="Saving…" /> : 'Save ballot setup'}
      </Button>
    </form>
  );
}

function CandidateList({
  token,
  electionID,
  candidates,
  onChanged,
}: {
  token: string;
  electionID: string;
  candidates: Candidate[];
  onChanged: () => void;
}) {
  if (candidates.length === 0) {
    return <p className="text-sm text-gray-500">No candidates yet.</p>;
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-700">Candidates</h3>
      <ul className="grid gap-3 sm:grid-cols-2">
        {candidates.map((candidate) => (
          <CandidateCard
            key={candidate.CandidateID}
            token={token}
            electionID={electionID}
            candidate={candidate}
            onChanged={onChanged}
          />
        ))}
      </ul>
    </div>
  );
}

function CandidateCard({
  token,
  electionID,
  candidate,
  onChanged,
}: {
  token: string;
  electionID: string;
  candidate: Candidate;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const photo = mediaUrl(candidate.ImageURL);

  async function replacePhoto(file: File | null) {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const form = new FormData();
      form.append('image', file);
      await api.upload(
        `/elections/${electionID}/candidates/${candidate.CandidateID}/image`,
        form,
        token,
        'PUT'
      );
      onChanged();
    } catch (err) {
      setError(describeError(err, 'Could not update photo.'));
    } finally {
      setBusy(false);
    }
  }

  async function clearPhoto() {
    setError(null);
    setBusy(true);
    try {
      await api.del(`/elections/${electionID}/candidates/${candidate.CandidateID}/image`, token);
      onChanged();
    } catch (err) {
      setError(describeError(err, 'Could not remove photo.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
      {photo ? (
        <img src={photo} alt="" className="h-14 w-14 rounded-lg object-cover" />
      ) : (
        <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold text-primary">
          {initials(candidate.FullName)}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-gray-900">{candidate.FullName}</p>
        <p className="text-xs text-gray-500">{candidate.Position}</p>
        {candidate.Party && <p className="text-xs text-gray-500">Party: {candidate.Party}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
          <label
            className={[
              'cursor-pointer font-medium text-primary hover:underline',
              busy ? 'pointer-events-none opacity-50' : '',
            ].join(' ')}
          >
            {busy ? 'Updating…' : photo ? 'Change photo' : 'Add photo'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              disabled={busy}
              onChange={(e) => replacePhoto(e.target.files?.[0] ?? null)}
            />
          </label>
          {photo && (
            <button
              type="button"
              disabled={busy}
              onClick={clearPhoto}
              className="font-medium text-gray-500 hover:text-red-600 disabled:opacity-50"
            >
              Remove
            </button>
          )}
        </div>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    </li>
  );
}

function AddCandidateForm({
  token,
  electionID,
  offices,
  affiliations,
  onAdded,
}: {
  token: string;
  electionID: string;
  offices: ElectionOffice[];
  affiliations: ElectionAffiliation[];
  onAdded: () => void;
}) {
  const [fullName, setFullName] = useState('');
  const [position, setPosition] = useState('');
  const [party, setParty] = useState('');
  const [manifestoURL, setManifestoURL] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onImageChange(file: File | null) {
    setImage(file);
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const form = new FormData();
      form.append('fullName', fullName);
      form.append('position', position);
      if (party.trim()) form.append('party', party.trim());
      if (manifestoURL) form.append('manifestoURL', manifestoURL);
      if (image) form.append('image', image);

      await api.upload<Candidate>(`/elections/${electionID}/candidates`, form, token);
      setFullName('');
      setPosition('');
      setParty('');
      setManifestoURL('');
      onImageChange(null);
      onAdded();
    } catch (err) {
      setError(describeError(err, 'Could not add candidate.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-700">Add candidate</h3>
      {error && <Alert variant="error">{error}</Alert>}
      <div className="flex items-center gap-4">
        <div className="h-16 w-16 overflow-hidden rounded-xl bg-gray-100 ring-1 ring-black/5">
          {preview ? (
            <img src={preview} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[10px] text-gray-400">Photo</div>
          )}
        </div>
        <label className="cursor-pointer text-sm font-medium text-primary hover:underline">
          Upload photo
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => onImageChange(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextField label="Full name" name="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        <label className="block space-y-1 text-sm font-medium text-gray-700">
          <span>Office / position</span>
          <select
            name="position"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            required
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            <option value="" disabled>Select an office</option>
            {offices.map((office) => <option key={office.OfficeID} value={office.Name}>{office.Name}</option>)}
          </select>
        </label>
      </div>
      <label className="block space-y-1 text-sm font-medium text-gray-700">
        <span>Party or affiliation (optional)</span>
        <select
          name="party"
          value={party}
          onChange={(e) => setParty(e.target.value)}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">No affiliation</option>
          {affiliations.map((affiliation) => (
            <option key={affiliation.AffiliationID} value={affiliation.Name}>{affiliation.Name}</option>
          ))}
        </select>
      </label>
      <TextField
        label="Manifesto URL (optional)"
        name="manifestoURL"
        value={manifestoURL}
        onChange={(e) => setManifestoURL(e.target.value)}
      />
      <Button type="submit" variant="secondary" disabled={busy}>
        {busy ? <Spinner label="Adding…" /> : 'Add candidate'}
      </Button>
    </form>
  );
}

function BrandingTab({ token }: { token: string }) {
  const [branding, setBranding] = useState<Branding | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const data = await api.get<Branding>('/branding', token);
      setBranding(data);
    } catch (err) {
      setError(describeError(err, 'Could not load branding.'));
    }
  }, [token]);

  useEffect(() => {
    reload();
  }, [reload]);

  function onFileChange(next: File | null) {
    setFile(next);
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return next ? URL.createObjectURL(next) : null;
    });
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError('Choose a logo image first.');
      return;
    }
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      const form = new FormData();
      form.append('logo', file);
      const updated = await api.upload<{ SchoolName: string; LogoURL: string | null }>('/branding/logo', form, token);
      setSuccess('Logo updated. It will appear on the login page and header.');
      onFileChange(null);
      setBranding((prev) =>
        prev
          ? { ...prev, logoURL: updated.LogoURL, schoolName: updated.SchoolName }
          : { schoolName: updated.SchoolName, logoURL: updated.LogoURL, status: 'ACTIVE' }
      );
    } catch (err) {
      setError(describeError(err, 'Could not upload logo.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    if (!branding?.logoURL) return;
    if (!confirm('Remove the school logo?')) return;
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      const updated = await api.del<{ SchoolName: string; LogoURL: string | null }>('/branding/logo', token);
      setSuccess('Logo removed.');
      onFileChange(null);
      setBranding((prev) =>
        prev
          ? { ...prev, logoURL: updated.LogoURL, schoolName: updated.SchoolName }
          : { schoolName: updated.SchoolName, logoURL: null, status: 'ACTIVE' }
      );
    } catch (err) {
      setError(describeError(err, 'Could not remove logo.'));
    } finally {
      setBusy(false);
    }
  }

  const currentLogo = preview || mediaUrl(branding?.logoURL);

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-900">School branding</h2>
        <p className="text-sm text-gray-500">
          Upload your institution logo so students see a professional, branded ballot experience.
        </p>
      </div>
      {error && <Alert variant="error">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}
      <div className="flex items-center gap-4">
        <div className="h-20 w-20 overflow-hidden rounded-2xl bg-gray-100 ring-1 ring-black/5">
          {currentLogo ? (
            <img src={currentLogo} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">No logo</div>
          )}
        </div>
        <div>
          <p className="font-medium text-gray-900">{branding?.schoolName ?? 'Your school'}</p>
          <label className="mt-1 inline-block cursor-pointer text-sm font-medium text-primary hover:underline">
            Choose image
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
            />
          </label>
          <p className="mt-1 text-xs text-gray-400">JPEG, PNG, WebP or GIF · max 2 MB</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <form onSubmit={handleUpload}>
          <Button type="submit" disabled={busy || !file}>
            {busy && file ? <Spinner label="Uploading…" /> : 'Save logo'}
          </Button>
        </form>
        {branding?.logoURL && !file && (
          <Button type="button" variant="secondary" disabled={busy} onClick={handleRemove}>
            Remove logo
          </Button>
        )}
      </div>
    </Card>
  );
}

function ResultsPanel({ token, electionID }: { token: string; electionID: string }) {
  const [results, setResults] = useState<ResultsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadResults() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<ResultsResponse>(`/elections/${electionID}/results`, token);
      setResults(data);
    } catch (err) {
      setError(describeError(err, 'Could not load results.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Results</h3>
        <Button variant="secondary" onClick={loadResults} disabled={loading}>
          {loading ? <Spinner label="Loading…" /> : 'Refresh results'}
        </Button>
      </div>
      {error && <Alert variant="error">{error}</Alert>}
      {results && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">{results.totalParticipants} student(s) have voted.</p>
          <table className="w-full text-sm">
            <tbody>
              {results.tally.map((entry) => (
                <tr key={entry.candidateID} className="border-b border-gray-100 last:border-0">
                  <td className="py-1.5 text-gray-900">{entry.fullName}</td>
                  <td className="py-1.5 text-gray-500">{entry.position}</td>
                  <td className="py-1.5 text-gray-500">{entry.party}</td>
                  <td className="py-1.5 text-right font-semibold text-gray-900">{entry.votes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Voters
// ---------------------------------------------------------------------------

function VotersTab({ token }: { token: string }) {
  const [voters, setVoters] = useState<Voter[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const list = await api.get<Voter[]>('/voters', token);
      setVoters(list);
    } catch (err) {
      setError(describeError(err, 'Could not load voters.'));
    }
  }, [token]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function toggleActive(voter: Voter) {
    try {
      await api.put(`/voters/${voter.VoterID}/active`, { isActive: !voter.IsActive }, token);
      reload();
    } catch (err) {
      setError(describeError(err, 'Could not update voter.'));
    }
  }

  return (
    <div className="space-y-6">
      <SisIntegrationCard token={token} onImported={reload} />

      <Card>
        <h2 className="mb-3 text-base font-semibold text-gray-900">Register voter</h2>
        <AddVoterForm token={token} onAdded={reload} />
      </Card>

      {error && <Alert variant="error">{error}</Alert>}

      <Card>
        {voters === null ? (
          <Spinner label="Loading voters…" />
        ) : voters.length === 0 ? (
          <p className="text-sm text-gray-500">No voters registered yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="pb-2">Student ID</th>
                <th className="pb-2">Status</th>
                <th className="pb-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {voters.map((voter) => (
                <tr key={voter.VoterID} className="border-t border-gray-100">
                  <td className="py-2 text-gray-900">{voter.StudentID}</td>
                  <td className="py-2">
                    <span
                      className={[
                        'rounded-full px-2 py-0.5 text-xs font-medium',
                        voter.IsActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500',
                      ].join(' ')}
                    >
                      {voter.IsActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    <Button variant="secondary" onClick={() => toggleActive(voter)}>
                      {voter.IsActive ? 'Deactivate' : 'Activate'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

interface SisSettings {
  sisBaseURL: string | null;
  configured: boolean;
  usingDevelopmentFallback: boolean;
}

interface SisSyncResult {
  created: number;
  updated: number;
  students: Array<{ studentID: string; isActive: boolean; temporaryPassword?: string }>;
}

function SisIntegrationCard({ token, onImported }: { token: string; onImported: () => void }) {
  const [settings, setSettings] = useState<SisSettings | null>(null);
  const [sisBaseURL, setSisBaseURL] = useState('');
  const [sisApiKey, setSisApiKey] = useState('');
  const [syncResult, setSyncResult] = useState<SisSyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const result = await api.get<SisSettings>('/voters/sis-integration', token);
      setSettings(result);
      setSisBaseURL(result.sisBaseURL ?? '');
    } catch (err) {
      setError(describeError(err, 'Could not load SIS settings.'));
    }
  }, [token]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  async function saveSettings(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.put<SisSettings>('/voters/sis-integration', { sisBaseURL, sisApiKey }, token);
      setSettings(result);
      setSisApiKey('');
    } catch (err) {
      setError(describeError(err, 'Could not save SIS settings.'));
    } finally {
      setBusy(false);
    }
  }

  async function clearSettings() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.put<SisSettings>('/voters/sis-integration', { clear: true }, token);
      setSettings(result);
      setSisBaseURL('');
      setSisApiKey('');
    } catch (err) {
      setError(describeError(err, 'Could not clear SIS settings.'));
    } finally {
      setBusy(false);
    }
  }

  async function syncRoster() {
    setBusy(true);
    setError(null);
    setSyncResult(null);
    try {
      const result = await api.post<SisSyncResult>('/voters/sync', {}, token);
      setSyncResult(result);
      onImported();
    } catch (err) {
      setError(describeError(err, 'Could not import the SIS voter roster.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-900">School information system</h2>
        <p className="mt-1 text-sm text-gray-500">
          Connect an endpoint that returns <code>/roster</code> with a <code>students</code> list containing
          studentID, enrollmentStatus, and financialHold fields.
        </p>
      </div>
      {error && <Alert variant="error">{error}</Alert>}
      {settings?.usingDevelopmentFallback && (
        <Alert variant="info">The development SIS mock is connected. The server will not use this fallback in production.</Alert>
      )}
      {settings && !settings.configured && !settings.usingDevelopmentFallback && (
        <Alert variant="warning">Configure this school's SIS endpoint before importing voters.</Alert>
      )}
      <form onSubmit={saveSettings} className="space-y-3">
        <TextField
          label="Roster API base URL"
          name="sisBaseURL"
          type="url"
          placeholder="https://school.example.edu/api"
          value={sisBaseURL}
          onChange={(event) => setSisBaseURL(event.target.value)}
        />
        <TextField
          label="API key"
          name="sisApiKey"
          type="password"
          autoComplete="new-password"
          placeholder={settings?.configured ? 'Saved; leave blank to keep it' : 'Bearer token'}
          value={sisApiKey}
          onChange={(event) => setSisApiKey(event.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="secondary" disabled={busy || !sisBaseURL.trim()}>
            {busy ? <Spinner label="Saving…" /> : 'Save SIS settings'}
          </Button>
          <Button type="button" onClick={syncRoster} disabled={busy || !settings?.configured}>
            {busy ? <Spinner label="Importing…" /> : 'Import voter roster'}
          </Button>
          {settings?.configured && !settings.usingDevelopmentFallback && (
            <Button type="button" variant="secondary" disabled={busy} onClick={clearSettings}>
              Clear SIS settings
            </Button>
          )}
        </div>
      </form>
      {syncResult && (
        <div className="space-y-3">
          <Alert variant="success">
            Imported {syncResult.created} new voter(s) and updated {syncResult.updated} existing voter(s).
            Existing passwords were left unchanged.
          </Alert>
          {syncResult.students.some((student) => student.temporaryPassword) && (
            <div data-testid="temporary-passwords" className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm font-medium text-amber-900">
                Share these one-time passwords securely. They are shown only for newly created accounts and will not appear again.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-amber-800">
                      <th className="py-1 pr-4">Student ID</th>
                      <th className="py-1">Temporary password</th>
                    </tr>
                  </thead>
                  <tbody>
                    {syncResult.students.filter((student) => student.temporaryPassword).map((student) => (
                      <tr key={student.studentID} className="border-t border-amber-200">
                        <td className="py-1 pr-4">{student.studentID}</td>
                        <td className="py-1 font-mono">{student.temporaryPassword}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function AddVoterForm({ token, onAdded }: { token: string; onAdded: () => void }) {
  const [studentID, setStudentID] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      await api.post<Voter>('/voters', { studentID, password }, token);
      setSuccess(`Voter ${studentID} registered. Share the starting password securely; they must change it after signing in.`);
      setStudentID('');
      setPassword('');
      onAdded();
    } catch (err) {
      setError(describeError(err, 'Could not register voter.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {success && <Alert variant="success">{success}</Alert>}
      {error && <Alert variant="error">{error}</Alert>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextField label="Student ID" name="studentID" value={studentID} onChange={(e) => setStudentID(e.target.value)} required />
        <TextField
          label="Starting password"
          name="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />
      </div>
      <Button type="submit" disabled={busy}>
        {busy ? <Spinner label="Registering…" /> : 'Register voter'}
      </Button>
    </form>
  );
}
