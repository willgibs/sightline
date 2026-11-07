/**
 * Mission seeds look like TAL-4471: three letters, a dash, four digits. Any other text
 * is accepted as a custom seed and used as typed (after trimming).
 */

export const DEFAULT_SEED = 'TAL-4471';
export const SEED_PATTERN = /^[A-Z]{3}-\d{4}$/;

const CONSONANTS = 'BDFGHKLMNPRSTVZ';
const VOWELS = 'AEIOU';

export function normalizeSeed(input: string | null | undefined): string {
  const raw = (input ?? '').trim();
  if (!raw) return DEFAULT_SEED;
  const upper = raw.toUpperCase().replace(/\s+/g, '-');
  if (SEED_PATTERN.test(upper)) return upper;
  const compact = upper.replace(/-/g, '');
  if (/^[A-Z]{3}\d{4}$/.test(compact)) return `${compact.slice(0, 3)}-${compact.slice(3)}`;
  return raw;
}

export function isCanonicalSeed(seed: string): boolean {
  return SEED_PATTERN.test(seed);
}

/** A pronounceable random seed (consonant, vowel, consonant). UI only, never inside the sim. */
export function randomSeed(random: () => number = Math.random): string {
  const pick = (s: string) => s[Math.floor(random() * s.length)]!;
  const digits = Math.floor(random() * 10000)
    .toString()
    .padStart(4, '0');
  return `${pick(CONSONANTS)}${pick(VOWELS)}${pick(CONSONANTS)}-${digits}`;
}
