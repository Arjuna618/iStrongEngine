export function nameSlug(name: string, max: number): string {
  const s = String(name ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
  const cps = Array.from(s);
  return cps.length > max ? cps.slice(0, max).join('').replace(/-+$/g, '') : s;
}

export function nameSlugLegacy(name: string, max: number): string {
  let slug = String(name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (slug.length > max) slug = slug.slice(0, max).replace(/-+$/g, '');
  return slug;
}
