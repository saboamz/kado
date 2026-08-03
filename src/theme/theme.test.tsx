import { render, screen } from '@testing-library/react';
import { DARK, LIGHT } from './tokens';
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
