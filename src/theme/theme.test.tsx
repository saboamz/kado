import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { DARK, DEFAULT_ACCENT, LIGHT } from './tokens';
import { ThemeProvider, useTheme } from './ThemeContext';
import { chip, themeVars } from './styles';

function Probe() {
  const theme = useTheme();
  return <span data-testid="bg">{theme.t.bg}</span>;
}

describe('ThemeProvider', () => {
  it('serves light tokens by default', () => {
    render(
      <ThemeProvider dark={false}>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('bg')).toHaveTextContent(LIGHT.bg);
  });

  it('serves dark tokens when dark', () => {
    render(
      <ThemeProvider dark>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('bg')).toHaveTextContent(DARK.bg);
  });

  it('throws outside a provider', () => {
    // React logs the error boundary trace; silence it for this assertion.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/ThemeProvider/);
    spy.mockRestore();
  });
});

describe('style helpers', () => {
  const theme = {
    t: LIGHT,
    dark: false,
    accent: '#FF6A55',
    accentSoft: 'rgba(255,106,85,.1)',
    accentGlow: 'rgba(255,106,85,.65)',
  };

  it('paints a selected chip with the accent', () => {
    expect(chip(theme, true).background).toBe('#FF6A55');
    expect(chip(theme, false).background).toBe(LIGHT.surface);
  });

  it('projects every token onto a CSS variable', () => {
    const vars = themeVars(theme) as Record<string, string>;
    for (const key of Object.keys(LIGHT)) {
      expect(vars[`--${key}`]).toBe(LIGHT[key as keyof typeof LIGHT]);
    }
    expect(vars['--accent']).toBe('#FF6A55');
  });
});

/**
 * The palette now lives twice: in tokens.ts for TypeScript consumers, and in
 * tokens.css as the custom properties Tailwind classes resolve against. That
 * duplication is deliberate — CSS cannot import from TS — but it can drift
 * silently, and a drift means light and dark stop agreeing between the two
 * styling systems while both still compile.
 *
 * This test is the pin. It parses the stylesheet and asserts both blocks match
 * the TS objects value for value.
 */
describe('tokens.css and tokens.ts agree', () => {
  // Resolved from the repo root: under Vite, import.meta.url is an http URL.
  const css = readFileSync(
    resolve(process.cwd(), 'src/styles/tokens.css'),
    'utf8',
  );

  /**
   * Compares colours by value, not by spelling. A CSS formatter writes
   * `rgba(0, 0, 0, 0.07)` where the TS source has `rgba(0,0,0,.07)`; those are
   * the same colour and the test must not fail on whitespace or a leading zero.
   */
  const norm = (v: string) =>
    v
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/(^|[(,])0\./g, '$1.');

  /** Reads `--color-<name>: <value>;` out of a given block of the stylesheet. */
  function paletteOf(block: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [, name, value] of block.matchAll(
      /--color-([a-z0-9-]+):\s*([^;]+);/g,
    )) {
      out[name] = value.trim();
    }
    return out;
  }

  // Everything before `.dark {` is the light block; the dark block overrides it.
  const darkStart = css.indexOf('.dark {');
  const light = paletteOf(css.slice(0, darkStart));
  const dark = { ...light, ...paletteOf(css.slice(darkStart)) };

  it.each(Object.keys(LIGHT))('light --color-%s matches LIGHT', (key) => {
    expect(norm(light[key] ?? '')).toBe(
      norm(LIGHT[key as keyof typeof LIGHT]),
    );
  });

  it.each(Object.keys(DARK))('dark --color-%s matches DARK', (key) => {
    expect(norm(dark[key] ?? '')).toBe(norm(DARK[key as keyof typeof DARK]));
  });

  it('carries the brand accent', () => {
    expect(norm(light.accent ?? '')).toBe(norm(DEFAULT_ACCENT));
  });

  it('defines an on-accent token so nothing hardcodes #fff', () => {
    expect(light['on-accent']).toBeDefined();
  });
});
