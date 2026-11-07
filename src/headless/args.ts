/** Minimal --flag value parsing for the headless tools. */
export function parseArgs(argv: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq > 0) {
      out.set(a.slice(2, eq), a.slice(eq + 1));
    } else {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        out.set(a.slice(2), next);
        i++;
      } else {
        out.set(a.slice(2), 'true');
      }
    }
  }
  return out;
}

export const fmt = {
  int: (n: number) => Math.round(n).toLocaleString('en-US'),
  ms: (n: number) => `${n.toFixed(n < 10 ? 1 : 0)} ms`,
  kb: (bytes: number) => (bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(2)} MB`),
  clock: (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  },
};
