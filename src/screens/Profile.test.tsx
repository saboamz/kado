import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Profile } from './Profile';
import { COLLECTIONS, INTERESTS } from '../data/social';
import { renderScreen } from '../test/render';

it('names the person and lists their interests', () => {
  renderScreen(<Profile />);
  expect(screen.getByRole('heading')).toHaveTextContent('Sophie Marchand');
  for (const i of INTERESTS) {
    expect(screen.getByText(i)).toBeInTheDocument();
  }
});

it('addresses the owner as themselves', () => {
  renderScreen(<Profile />, { initial: { role: 'owner' } });
  expect(screen.getByRole('heading')).toHaveTextContent('Sophie (vous)');
  expect(
    screen.getByRole('button', { name: 'Modifier mon profil' }),
  ).toBeInTheDocument();
});

it('offers a friend the follow action', () => {
  renderScreen(<Profile />);
  expect(screen.getByRole('button', { name: 'Suivre' })).toBeInTheDocument();
});

it('shows every collection', () => {
  renderScreen(<Profile />);
  for (const c of COLLECTIONS) {
    expect(screen.getByText(c.name)).toBeInTheDocument();
  }
});

it('opens a collection as a wishlist', async () => {
  const user = userEvent.setup();
  renderScreen(<Profile />, { initial: { screen: 'profile' } });
  await user.click(screen.getByText('Maison'));
  expect(screen.getByTestId('screen')).toHaveTextContent('list');
});

it('routes the empty collection to the empty state', async () => {
  const user = userEvent.setup();
  renderScreen(<Profile />, { initial: { screen: 'profile' } });
  await user.click(screen.getByText('Noël'));
  expect(screen.getByTestId('screen')).toHaveTextContent('empty');
});

it('toggles a like without opening the collection', async () => {
  const user = userEvent.setup();
  renderScreen(<Profile />, { initial: { screen: 'profile' } });
  const heart = screen.getByRole('button', { name: 'Aimer Maison' });
  expect(heart).toHaveAttribute('aria-pressed', 'false');
  await user.click(heart);
  expect(heart).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByTestId('screen')).toHaveTextContent('profile');
});
