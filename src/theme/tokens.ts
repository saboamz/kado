/**
 * Design tokens ported from the Kado iOS prototype.
 *
 * The prototype expressed these as two flat objects (LIGHT / DARK) injected as
 * CSS custom properties on the phone frame. We keep that shape: one `Theme`
 * type, two values, projected to CSS variables at the root of the device.
 */

export type Theme = {
  bg: string;
  surface: string;
  chip: string;
  fg: string;
  fg2: string;
  fg3: string;
  line: string;
  line2: string;
  stripe: string;
  glass: string;
};

export const LIGHT: Theme = {
  bg: '#ffffff',
  surface: '#f4f4f6',
  chip: '#eaeaee',
  fg: '#0b0b0c',
  fg2: '#6b6b73',
  fg3: '#a1a1aa',
  line: 'rgba(0,0,0,.07)',
  line2: 'rgba(0,0,0,.14)',
  stripe: 'rgba(0,0,0,.055)',
  glass: 'rgba(255,255,255,.82)',
};

export const DARK: Theme = {
  bg: '#0b0b0d',
  surface: '#17171a',
  chip: '#232328',
  fg: '#f4f4f7',
  fg2: '#9a9aa4',
  fg3: '#66666f',
  line: 'rgba(255,255,255,.09)',
  line2: 'rgba(255,255,255,.16)',
  stripe: 'rgba(255,255,255,.06)',
  glass: 'rgba(16,16,19,.8)',
};

/** Brand accent. The prototype exposed these four as an editable prop. */
export const ACCENTS = ['#FF6A55', '#6C5CE7', '#2F6BFF', '#111114'] as const;
export const DEFAULT_ACCENT = ACCENTS[0];

export const FONT = {
  sans: 'Figtree, system-ui, sans-serif',
  mono: "'Roboto Mono', monospace",
} as const;

/** Device metrics of the prototype's iPhone frame. */
export const DEVICE = { width: 393, height: 852, radius: 48 } as const;
