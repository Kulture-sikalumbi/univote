/** Resolve a stored image URL for <img src> (Supabase public URL or /uploads/…). */
export function mediaUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  return url;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
