import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Search } from './Search';
import { PEOPLE } from '../data/social';
import { renderScreen } from '../test/render';

const onSearch = { route: '/recherche' };

it('lists the suggested people', () => {
  renderScreen(<Search />, onSearch);
  expect(screen.getByText('Suggestions')).toBeInTheDocument();
  for (const p of PEOPLE) {
    expect(screen.getByText(p.name)).toBeInTheDocument();
  }
});

it('accepts a query', async () => {
  const user = userEvent.setup();
  renderScreen(<Search />, onSearch);
  const input = screen.getByRole('textbox', { name: 'Rechercher' });
  await user.type(input, 'Sophie');
  expect(input).toHaveValue('Sophie');
});

/**
 * The query is in the URL, which is the reason it moved out of the store: a
 * result is now a link someone can send.
 */
it('puts the query in the URL', async () => {
  const user = userEvent.setup();
  renderScreen(<Search />, onSearch);
  await user.type(screen.getByRole('textbox', { name: 'Rechercher' }), 'Sophie');
  expect(screen.getByTestId('search')).toHaveTextContent('q=Sophie');
});

it('reads the query back out of the URL', () => {
  renderScreen(<Search />, { route: '/recherche?q=Emma', path: '/recherche' });
  expect(screen.getByRole('textbox', { name: 'Rechercher' })).toHaveValue('Emma');
});

it('marks the active filter and relabels the results', async () => {
  const user = userEvent.setup();
  renderScreen(<Search />, onSearch);
  const amis = screen.getByRole('button', { name: 'Amis' });
  expect(amis).toHaveAttribute('aria-pressed', 'true');

  await user.click(screen.getByRole('button', { name: 'Listes' }));
  expect(screen.getByRole('button', { name: 'Listes' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(amis).toHaveAttribute('aria-pressed', 'false');
  // The eyebrow echoes the active filter. It is no longer a <div>, so match on
  // the element that is not the chip rather than on the tag name.
  expect(
    screen.getByText('Listes', { selector: ':not(button)' }),
  ).toBeInTheDocument();
  expect(screen.getByTestId('search')).toHaveTextContent('f=Listes');
});

it('restores the active filter from the URL', () => {
  renderScreen(<Search />, {
    route: '/recherche?f=Cadeaux',
    path: '/recherche',
  });
  expect(screen.getByRole('button', { name: 'Cadeaux' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(screen.getByRole('button', { name: 'Amis' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});

it('opens a profile from a result', async () => {
  const user = userEvent.setup();
  renderScreen(<Search />, onSearch);
  await user.click(screen.getByText('Thomas Bel'));
  expect(screen.getByTestId('path')).toHaveTextContent('/u/sophie');
});
