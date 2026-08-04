import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Settings } from './Settings';
import { settingsGroups } from '../data/settings';
import { renderScreen } from '../test/render';

const onSettings = { route: '/parametres' };

it('groups every setting under its heading', () => {
  renderScreen(<Settings />, onSettings);
  for (const g of settingsGroups(false)) {
    expect(screen.getByRole('heading', { name: g.title })).toBeInTheDocument();
    for (const r of g.rows) {
      expect(screen.getByText(r.label)).toBeInTheDocument();
    }
  }
});

it('mirrors the live theme in the Apparence row', () => {
  const { unmount } = renderScreen(<Settings />, onSettings);
  expect(screen.getByText('Clair')).toBeInTheDocument();
  unmount();

  renderScreen(<Settings />, { ...onSettings, dark: true });
  expect(screen.getByText('Sombre')).toBeInTheDocument();
});

/**
 * The theme is the one setting still backed by the store, so it is the one row
 * that is a control rather than a label.
 */
it('flips the theme from the Apparence row', async () => {
  const user = userEvent.setup();
  renderScreen(<Settings />, onSettings);
  const row = screen.getByRole('button', { name: /Thème/ });
  expect(row).toHaveAttribute('aria-pressed', 'false');

  await user.click(row);
  expect(row).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText('Sombre')).toBeInTheDocument();
});

it('states that the secret is enforced server-side', () => {
  renderScreen(<Settings />, onSettings);
  expect(
    screen.getByText('Le secret est garanti côté serveur'),
  ).toBeInTheDocument();
  expect(screen.getByText(/jamais renvoyées dans l/)).toBeInTheDocument();
});
