/** Normalize a school name or institution code into its readable tenant slug. */
export function toInstitutionCode(value: string): string {
  let slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!slug) return '';
  if (/^[0-9]/.test(slug)) slug = `school_${slug}`;
  return slug.slice(0, 63).replace(/_+$/g, '');
}
