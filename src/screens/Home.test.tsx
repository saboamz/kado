import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Home } from './Home';
import { BIRTHDAYS, FEED } from '../data/social';
import { renderScreen } from '../test/render';

it('greets with today and lists the upcoming birthdays', () => {
  renderScreen(<Home />);
  expect(screen.getByRole('heading')).toHaveTextContent('Aujourd');
  const strip = screen.getByRole('region', { name: 'Anniversaires à venir' });
  for (const b of BIRTHDAYS) {
    expect(within(strip).getByText(b.name)).toBeInTheDocument();
  }
});

it('shows every activity entry', () => {
  renderScreen(<Home />);
  for (const f of FEED) {
    expect(screen.getByText(f.text)).toBeInTheDocument();
  }
});

it('opens a profile from a birthday card', async () => {
  const user = userEvent.setup();
  renderScreen(<Home />);
  const strip = screen.getByRole('region', { name: 'Anniversaires à venir' });
  await user.click(within(strip).getByText('Sophie'));
  expect(screen.getByTestId('path')).toHaveTextContent('/u/sophie');
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
