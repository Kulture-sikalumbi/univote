import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Spinner } from '../../components/Spinner';
import { api, ApiError } from '../../lib/api';
import { registerBiometricCredential } from '../../lib/webauthn';
import type { PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/types';

export function StudentSecuritySettings({ token }: { token: string }) {
  const [options, setOptions] = useState<PublicKeyCredentialCreationOptionsJSON | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replaced, setReplaced] = useState(false);

  async function refreshOptions(preserveError = false) {
    setBusy(true);
    if (!preserveError) setError(null);
    try {
      const registrationOptions = await api.post<PublicKeyCredentialCreationOptionsJSON>(
        '/auth/webauthn/device/replace/begin',
        undefined,
        token
      );
      setOptions(registrationOptions);
    } catch (err) {
      setOptions(null);
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not prepare device setup. Please sign in again and retry.'
      );
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function prepareReplacement() {
      try {
        const registrationOptions = await api.post<PublicKeyCredentialCreationOptionsJSON>(
          '/auth/webauthn/device/replace/begin',
          undefined,
          token
        );
        if (!cancelled) setOptions(registrationOptions);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Could not prepare device replacement.');
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    }

    void prepareReplacement();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function replaceDevice() {
    if (!options || !confirmed) return;
    setBusy(true);
    setError(null);
    try {
      const registrationPromise = registerBiometricCredential(options);
      const credential = await registrationPromise;
      await api.post('/auth/webauthn/device/replace/complete', { credential }, token);
      setReplaced(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not replace device security. Please try again.');
      setOptions(null);
      await refreshOptions(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card className="space-y-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Change device security</h1>
          <p className="mt-1 text-sm text-gray-600">
            Register a new device using its biometric, passkey, or screen-lock security.
          </p>
        </div>

        {replaced ? (
          <>
            <Alert variant="success" title="Device security updated">
              The new device is registered. Previously registered devices can no longer sign in to this account.
            </Alert>
            <Link to="/vote" className="text-sm font-medium text-primary underline">
              Return to voting
            </Link>
          </>
        ) : (
          <>
            <Alert variant="warning" title="This replaces your registered devices">
              After the new device is registered, all previously registered devices will be removed. Make sure
              you can use the device you are registering before continuing.
            </Alert>

            {error && <Alert variant="error">{error}</Alert>}
            {busy && !options ? (
              <Spinner label="Preparing device setup…" />
            ) : !options ? (
              <Button fullWidth disabled={busy} onClick={() => void refreshOptions()}>
                Retry device setup
              </Button>
            ) : (
              <>
                <label className="flex items-start gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(event) => setConfirmed(event.target.checked)}
                    disabled={busy}
                    className="mt-1"
                  />
                  <span>I understand this will remove my previously registered devices.</span>
                </label>
                <Button fullWidth disabled={busy || !options || !confirmed} onClick={replaceDevice}>
                  {busy ? <Spinner label="Registering new device…" /> : 'Register replacement device'}
                </Button>
              </>
            )}
            <Link to="/vote" className="block text-center text-sm text-gray-500 underline">
              Cancel and return to voting
            </Link>
          </>
        )}
      </Card>
    </div>
  );
}
