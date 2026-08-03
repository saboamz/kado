import { screen } from '@testing-library/react';
import { Settings } from './Settings';
import { settingsGroups } from '../data/settings';
import { renderScreen } from '../test/render';

const onSettings = { screen: 'settings' as const };

it('groups every setting under its heading', () => {
  renderScreen(<Settings />, { initial: onSettings });
  for (const g of settingsGroups(false)) {
    expect(screen.getByRole('heading', { name: g.title })).toBeInTheDocument();
    for (const r of g.rows) {
      expect(screen.getByText(r.label)).toBeInTheDocument();
    }
  }
});

it('mirrors the live theme in the Apparence row', () => {
  const { unmount } = renderScreen(<Settings />, { initial: onSettings });
  expect(screen.getByText('Clair')).toBeInTheDocument();
  unmount();

  renderScreen(<Settings />, { initial: { ...onSettings, dark: true }, dark: true });
  expect(screen.getByText('Sombre')).toBeInTheDocument();
});

it('states that the secret is enforced server-side', () => {
  renderScreen(<Settings />, { initial: onSettings });
  expect(
    screen.getByText('Le secret est garanti côté serveur'),
  ).toBeInTheDocument();
  expect(screen.getByText(/jamais renvoyées dans l/)).toBeInTheDocument();
});
