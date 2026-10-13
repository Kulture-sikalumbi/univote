import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Branding } from '../lib/types';

/**
 * Loads school branding for the current Host (logo + name). Safe to call on
 * the login screen before authentication.
 */
export function useBranding() {
  const [branding, setBranding] = useState<Branding | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<Branding>('/branding')
      .then((data) => {
        if (!cancelled) setBranding(data);
      })
      .catch(() => {
        if (!cancelled) setBranding(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return branding;
}
