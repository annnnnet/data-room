/**
 * Best-effort initials for an avatar badge. Prefers a display name ("Ana
 * Cole" → "AC"); falls back to the local part of an email address
 * ("ana@acme.test" → "A") since a pending invite has no name yet.
 */
export function getInitials(nameOrEmail: string): string {
  const trimmed = nameOrEmail.trim();
  if (!trimmed) return '?';

  if (trimmed.includes('@')) {
    const local = trimmed.split('@')[0];
    return (local[0] ?? '?').toUpperCase();
  }

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
