export function splitName(name: string): { stem: string; ext: string } {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return { stem: name, ext: '' };
  return { stem: name.slice(0, dot), ext: name.slice(dot) };
}

/**
 * Mirrors the partial unique index on (parent_id, lower(name)) — comparison
 * is case-insensitive so the suggested name cannot collide on insert.
 */
export function nextAvailableName(name: string, taken: string[]): string {
  const takenLower = new Set(taken.map((t) => t.toLowerCase()));
  if (!takenLower.has(name.toLowerCase())) return name;

  const { stem, ext } = splitName(name);
  for (let i = 2; ; i++) {
    const candidate = `${stem} (${i})${ext}`;
    if (!takenLower.has(candidate.toLowerCase())) return candidate;
  }
}
