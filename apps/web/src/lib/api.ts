// Thin fetch wrapper for the UniVote API. The selected institution code is
// sent on every tenant-scoped request, independent of the browser hostname.
const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/api/v1').replace(/\/$/, '');
const TENANT_CODE_KEY = 'univote.tenantCode';
let currentTenantCode = '';

function getTenantCode(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(TENANT_CODE_KEY) ?? currentTenantCode;
  } catch {
    return currentTenantCode;
  }
}

function setTenantCode(code: string): void {
  currentTenantCode = code.trim().toLowerCase();
  if (typeof window === 'undefined') return;
  try {
    if (currentTenantCode) window.localStorage.setItem(TENANT_CODE_KEY, currentTenantCode);
    else window.localStorage.removeItem(TENANT_CODE_KEY);
  } catch {
    // Keep the selected code in memory for requests in this tab.
  }
}

function tenantHeaders(): Record<string, string> {
  const tenantCode = getTenantCode();
  return tenantCode ? { 'X-Tenant-Code': tenantCode } : {};
}

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

async function request<T>(
  method: Method,
  path: string,
  body?: unknown,
  token?: string | null
): Promise<T> {
  const headers: Record<string, string> = tenantHeaders();
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  return parseResponse<T>(response);
}

/** Multipart upload — do not set Content-Type (browser sets the boundary). */
async function uploadForm<T>(
  path: string,
  form: FormData,
  token?: string | null,
  method: 'POST' | 'PUT' = 'POST'
): Promise<T> {
  const headers: Record<string, string> = tenantHeaders();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: form,
  });

  return parseResponse<T>(response);
}

async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const data = text ? safeJsonParse(text) : undefined;

  if (!response.ok) {
    const message = extractErrorMessage(data) ?? response.statusText;
    throw new ApiError(response.status, message, data);
  }

  return data as T;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractErrorMessage(data: unknown): string | undefined {
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    if (typeof record.message === 'string') return record.message;
    if (typeof record.error === 'string') return record.error;
  }
  return undefined;
}

export const api = {
  getTenantCode,
  setTenantCode,
  get: <T>(path: string, token?: string | null) => request<T>('GET', path, undefined, token),
  post: <T>(path: string, body?: unknown, token?: string | null) =>
    request<T>('POST', path, body, token),
  put: <T>(path: string, body?: unknown, token?: string | null) =>
    request<T>('PUT', path, body, token),
  del: <T>(path: string, token?: string | null) => request<T>('DELETE', path, undefined, token),
  upload: <T>(path: string, form: FormData, token?: string | null, method: 'POST' | 'PUT' = 'POST') =>
    uploadForm<T>(path, form, token, method),
};
