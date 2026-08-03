import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Search } from './Search';
import { PEOPLE } from '../data/social';
import { renderScreen } from '../test/render';

it('lists the suggested people', () => {
  renderScreen(<Search />);
  expect(screen.getByText('Suggestions')).toBeInTheDocument();
  for (const p of PEOPLE) {
    expect(screen.getByText(p.name)).toBeInTheDocument();
  }
});

it('accepts a query', async () => {
  const user = userEvent.setup();
  renderScreen(<Search />);
  const input = screen.getByRole('textbox', { name: 'Rechercher' });
  await user.type(input, 'Sophie');
  expect(input).toHaveValue('Sophie');
});

it('marks the active filter and relabels the results', async () => {
  const user = userEvent.setup();
  renderScreen(<Search />);
  const amis = screen.getByRole('button', { name: 'Amis' });
  expect(amis).toHaveAttribute('aria-pressed', 'true');

  await user.click(screen.getByRole('button', { name: 'Listes' }));
  expect(screen.getByRole('button', { name: 'Listes' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(amis).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByText('Listes', { selector: 'div' })).toBeInTheDocument();
});

it('opens a profile from a result', async () => {
  const user = userEvent.setup();
  renderScreen(<Search />);
  await user.click(screen.getByText('Thomas Bel'));
  expect(screen.getByTestId('screen')).toHaveTextContent('profile');
});
