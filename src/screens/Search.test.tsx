import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Search } from './Search';
import { renderScreen } from '../test/render';

const onSearch = { route: '/recherche' };

/** An empty query returns suggestions, so the list is never blank to start. */
it('lists the suggested people', async () => {
  renderScreen(<Search />, onSearch);
  expect(screen.getByText('Suggestions')).toBeInTheDocument();
  expect(await screen.findByText('Sophie Marchand')).toBeInTheDocument();
  for (const name of ['Thomas Bel', 'Emma Roux', 'Lucas Ferrand']) {
    expect(screen.getByText(name)).toBeInTheDocument();
  }
});

/**
 * The handle is the secondary line now. It replaces fixture prose ("6 listes ·
 * anniversaire le 14 mars") that no server row carries — and a birthday is
 * friends-only data that has no business in a stranger's search result.
 */
it('identifies each result by handle', async () => {
  renderScreen(<Search />, onSearch);
  expect(await screen.findByText('@sophie')).toBeInTheDocument();
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

it('refetches when the query changes', async () => {
  renderScreen(<Search />, { route: '/recherche?q=Emma', path: '/recherche' });
  expect(await screen.findByText('Emma Roux')).toBeInTheDocument();
  expect(screen.getByTestId('search')).toHaveTextContent('q=Emma');
});

it('narrows the results to the query', async () => {
  renderScreen(<Search />, { route: '/recherche?q=Emma', path: '/recherche' });
  expect(await screen.findByText('Emma Roux')).toBeInTheDocument();
  // The control: someone who does not match must be gone, or "narrowing"
  // would pass against a screen that filters nothing.
  expect(screen.queryByText('Thomas Bel')).not.toBeInTheDocument();
});

it('says so when nothing matches', async () => {
  renderScreen(<Search />, { route: '/recherche?q=zzzz', path: '/recherche' });
  expect(await screen.findByRole('status')).toHaveTextContent(/Aucun résultat/);
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

/** Results link to the person they name, not to a hardcoded profile. */
it('opens a profile from a result', async () => {
  const user = userEvent.setup();
  renderScreen(<Search />, onSearch);
  await user.click(await screen.findByText('Thomas Bel'));
  expect(screen.getByTestId('path')).toHaveTextContent('/u/thomas');
});
