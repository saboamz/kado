import type { CSSProperties } from 'react';
import type { ThemeValue } from './ThemeContext';
import { FONT } from './tokens';

/**
 * The prototype drew every placeholder image as a diagonal hatch over a flat
 * fill. Kept as a helper so "no photo yet" reads the same everywhere.
 */
export function stripes(theme: ThemeValue, fill: string, size = 4): string {
  return (
    `repeating-linear-gradient(135deg,${theme.t.stripe} 0 ${size}px,` +
    `rgba(0,0,0,0) ${size}px ${size * 2}px),${fill}`
  );
}

/** Pill toggle used for filters, list chips and contribution amounts. */
export function chip(theme: ThemeValue, on: boolean): CSSProperties {
  return {
    padding: '8px 13px',
    borderRadius: 10,
    font: `500 12px/1 ${FONT.sans}`,
    transition: 'all .18s',
    ...(on
      ? { background: theme.accent, color: '#fff' }
      : { background: theme.t.surface, color: theme.t.fg2 }),
  };
}

/** Small uppercase monospace section label. */
export function eyebrow(theme: ThemeValue): CSSProperties {
  return {
    font: `400 9.5px/1 ${FONT.mono}`,
    color: theme.t.fg3,
    letterSpacing: '.1em',
    textTransform: 'uppercase',
  };
}

/** Full-width accent call to action. */
export function primaryButton(theme: ThemeValue): CSSProperties {
  return {
    width: '100%',
    height: 54,
    borderRadius: 17,
    background: theme.accent,
    color: '#fff',
    font: `600 16px/1 ${FONT.sans}`,
    letterSpacing: '-.01em',
    boxShadow: `0 10px 24px -10px ${theme.accentGlow}`,
    transition: 'transform .18s',
  };
}

/** Maps the theme onto the CSS custom properties the screens consume. */
export function themeVars(theme: ThemeValue): CSSProperties {
  const { t } = theme;
  return {
    '--bg': t.bg,
    '--surface': t.surface,
    '--chip': t.chip,
    '--fg': t.fg,
    '--fg2': t.fg2,
    '--fg3': t.fg3,
    '--line': t.line,
    '--line2': t.line2,
    '--stripe': t.stripe,
    '--glass': t.glass,
    '--accent': theme.accent,
    '--accentSoft': theme.accentSoft,
    '--accentGlow': theme.accentGlow,
  } as CSSProperties;
}
