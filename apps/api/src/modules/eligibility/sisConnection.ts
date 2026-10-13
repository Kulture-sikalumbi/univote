export interface SisCredentials {
  SisBaseURL?: string | null;
  SisApiKey?: string | null;
}

export interface SisConnection {
  baseURL: string;
  apiKey: string;
  source: 'tenant' | 'development-fallback';
}

/** Prefer institution credentials; allow the shared mock only outside production. */
export function resolveSisConnection(tenant: SisCredentials): SisConnection | null {
  if (tenant.SisBaseURL && tenant.SisApiKey) {
    return { baseURL: tenant.SisBaseURL, apiKey: tenant.SisApiKey, source: 'tenant' };
  }

  if (
    process.env.NODE_ENV !== 'production' &&
    process.env.SIS_BASE_URL &&
    process.env.SIS_API_KEY
  ) {
    return {
      baseURL: process.env.SIS_BASE_URL,
      apiKey: process.env.SIS_API_KEY,
      source: 'development-fallback',
    };
  }

  return null;
}
