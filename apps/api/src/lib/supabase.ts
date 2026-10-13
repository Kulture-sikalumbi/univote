import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null | undefined;

/** Service-role client for Storage uploads. Returns null when not configured. */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (cached !== undefined) return cached;

  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    cached = null;
    return null;
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export function storageBucket(): string {
  return process.env.SUPABASE_STORAGE_BUCKET?.trim() || 'images';
}

export function isSupabaseStorageConfigured(): boolean {
  return getSupabaseAdmin() !== null;
}
