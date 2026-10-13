import { useState, type FormEvent } from 'react';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Spinner } from '../../components/Spinner';
import { TextField } from '../../components/TextField';
import { api, ApiError } from '../../lib/api';

export function SetStudentPassword({
  token,
  onPasswordChanged,
}: {
  token: string;
  onPasswordChanged: (token: string) => void;
}) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      const result = await api.post<{ token: string }>(
        '/auth/change-password',
        { newPassword },
        token
      );
      onPasswordChanged(result.token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update your password. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mx-auto max-w-lg space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Set your password</h2>
        <p className="mt-1 text-sm text-gray-600">
          This is your first sign-in. Choose a private password before continuing to biometric setup and voting.
        </p>
      </div>
      {error && <Alert variant="error">{error}</Alert>}
      <form onSubmit={handleSubmit} className="space-y-3">
        <TextField
          label="New password"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
        />
        <TextField
          label="Confirm new password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />
        <Button type="submit" fullWidth disabled={busy}>
          {busy ? <Spinner label="Updating password…" /> : 'Save password'}
        </Button>
      </form>
    </Card>
  );
}
