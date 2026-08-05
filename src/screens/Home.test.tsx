import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Home } from './Home';
import { FEED } from '../data/social';
import { renderScreen } from '../test/render';

/**
 * Birthdays arrive from a query now, so they are awaited rather than asserted
 * synchronously. The names come from the profiles table — display names, where
 * the fixture carried first names only.
 */
it('greets with today and lists the upcoming birthdays', async () => {
  renderScreen(<Home />);
  expect(screen.getByRole('heading')).toHaveTextContent('Aujourd');
  const strip = screen.getByRole('region', { name: 'Anniversaires à venir' });
  expect(await within(strip).findByText('Sophie Marchand')).toBeInTheDocument();
  for (const name of ['Thomas Bel', 'Emma Roux', 'Lucas Ferrand']) {
    expect(within(strip).getByText(name)).toBeInTheDocument();
  }
});

/** The relative copy is computed from the date, so it reads as a delay. */
it('says how far off each birthday is', async () => {
  renderScreen(<Home />);
  const strip = screen.getByRole('region', { name: 'Anniversaires à venir' });
  await within(strip).findByText('Sophie Marchand');
  const card = within(strip).getByText('Sophie Marchand').closest('a')!;
  expect(card).toHaveTextContent(/dans \d+ (j|mois)|demain|aujourd/);
});

/**
 * The feed is still on fixtures: there is no feed table, so there is nothing
 * to query. This assertion changes when one lands.
 */
it('shows every activity entry', () => {
  renderScreen(<Home />);
  for (const f of FEED) {
    expect(screen.getByText(f.text)).toBeInTheDocument();
  }
});

/** Each card links to that person's own profile, not to a hardcoded one. */
it('opens a profile from a birthday card', async () => {
  const user = userEvent.setup();
  renderScreen(<Home />);
  const strip = screen.getByRole('region', { name: 'Anniversaires à venir' });
  await user.click(await within(strip).findByText('Thomas Bel'));
  expect(screen.getByTestId('path')).toHaveTextContent('/u/thomas');
});

it('routes the cagnotte entry to the pot screen', async () => {
  const user = userEvent.setup();
  renderScreen(<Home />);
  await user.click(screen.getByText(/La cagnotte du MacBook/));
  expect(screen.getByTestId('path')).toHaveTextContent(
    '/u/sophie/listes/anniversaire/g1/cagnotte',
  );
});

/**
 * Feed rows are anchors now, not buttons that dispatched. That is the point of
 * the move: middle-click and open-in-new-tab work, which no amount of onClick
 * could give them.
 */
it('renders feed entries as real links', () => {
  renderScreen(<Home />);
  const entry = screen.getByText(/Thomas vient d/).closest('a');
  expect(entry).toHaveAttribute('href', '/u/sophie/listes/anniversaire');
});

it('nudges about the empty Noël list', () => {
  renderScreen(<Home />);
  expect(screen.getByText('Votre liste Noël est vide')).toBeInTheDocument();
});
