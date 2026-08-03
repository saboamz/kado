import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { DARK, DEFAULT_ACCENT, LIGHT, type Theme } from './tokens';

export type ThemeValue = {
  t: Theme;
  dark: boolean;
  accent: string;
  /** Translucent accent wash used behind badges and callouts. */
  accentSoft: string;
  accentGlow: string;
};

const ThemeCtx = createContext<ThemeValue | null>(null);

export function ThemeProvider({
  dark,
  accent = DEFAULT_ACCENT,
  children,
}: {
  dark: boolean;
  accent?: string;
  children: ReactNode;
}) {
  const value = useMemo<ThemeValue>(
    () => ({
      t: dark ? DARK : LIGHT,
      dark,
      accent,
      accentSoft: dark ? 'rgba(255,122,102,.16)' : 'rgba(255,106,85,.1)',
      accentGlow: 'rgba(255,106,85,.65)',
    }),
    [dark, accent],
  );
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme(): ThemeValue {
  const v = useContext(ThemeCtx);
  if (!v) throw new Error('useTheme must be used inside a ThemeProvider');
  return v;
}
