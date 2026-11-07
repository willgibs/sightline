/**
 * The player's own settings: how the mouse feels, how wide the view is, how loud. They
 * belong to the person, not the game, so they live in this browser (localStorage) and
 * never in tuning or recordings: a recording stores the view angles the mouse produced,
 * whatever the sensitivity was.
 */
export interface Settings {
  /** Mouse sensitivity, as a multiple of the tuned one (view.lookSensitivity). */
  sensitivity: number;
  /** Vertical field of view in degrees; 0 keeps the tuned one (view.fov). */
  fov: number;
  invertY: boolean;
  /** Master volume, 0 to 1. */
  volume: number;
  /** Raw mouse movement, without the system's acceleration, where the browser offers it. */
  rawMouse: boolean;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = { sensitivity: 1, fov: 0, invertY: false, volume: 0.8, rawMouse: false };

const KEY = 'sightline.settings.v1';

/** The saved settings, each field checked and clamped; the defaults where anything is missing or odd. */
export function loadSettings(): Settings {
  let saved: Record<string, unknown> = {};
  try {
    const text = window.localStorage.getItem(KEY);
    if (text) saved = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // Storage blocked (a private window, an embed) or damaged: the defaults.
  }
  return cleanSettings(saved);
}

export function cleanSettings(v: Record<string, unknown>): Settings {
  const num = (x: unknown, lo: number, hi: number, fallback: number): number => (typeof x === 'number' && Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : fallback);
  const fov = num(v.fov, 0, 100, 0);
  return {
    sensitivity: num(v.sensitivity, 0.25, 4, DEFAULT_SETTINGS.sensitivity),
    fov: fov === 0 ? 0 : Math.max(40, fov),
    invertY: v.invertY === true,
    volume: num(v.volume, 0, 1, DEFAULT_SETTINGS.volume),
    rawMouse: v.rawMouse === true,
  };
}

export function saveSettings(s: Settings): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Not saved, but still in force for this visit.
  }
}
