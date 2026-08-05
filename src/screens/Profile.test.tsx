import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Profile } from './Profile';
import { COLLECTIONS, INTERESTS } from '../data/social';
import { renderScreen, MARC, SOPHIE } from '../test/render';

/**
 * `/moi` is always the viewer's own profile; `/u/:handle` is someone else's
 * unless the handle matches the signed-in viewer. There is no `role` field to
 * set — the URL says whose profile, the viewer says who is reading it.
 */
const asFriend = { route: '/u/sophie', path: '/u/:handle', viewer: MARC };
const asOwner = { route: '/moi', viewer: SOPHIE };

it('names the person and lists their interests', () => {
  renderScreen(<Profile />, asFriend);
  // The "Collections" eyebrow is an h3, so the name is addressed by level.
  expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
    'Sophie Marchand',
  );
  for (const i of INTERESTS) {
    expect(screen.getByText(i)).toBeInTheDocument();
  }
});

it('addresses the owner as themselves', () => {
  renderScreen(<Profile />, asOwner);
  expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
    'Sophie (vous)',
  );
  expect(
    screen.getByRole('button', { name: 'Modifier mon profil' }),
  ).toBeInTheDocument();
});

it('treats /moi as your own profile whoever you are', () => {
  // /moi carries no :handle, so the screen falls back to the signed-in
  // handle. It used to fall back to the literal 'sophie', which the hardcoded
  // session made right by accident — against a real session it offered Marc a
  // "Suivre" button on his own profile.
  renderScreen(<Profile />, { route: '/moi', viewer: MARC });
  expect(
    screen.getByRole('button', { name: 'Modifier mon profil' }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Suivre' }),
  ).not.toBeInTheDocument();
});

it('offers a friend the follow action', () => {
  renderScreen(<Profile />, asFriend);
  expect(screen.getByRole('button', { name: 'Suivre' })).toBeInTheDocument();
});

it('shows every collection', () => {
  renderScreen(<Profile />, asFriend);
  for (const c of COLLECTIONS) {
    expect(screen.getByText(c.name)).toBeInTheDocument();
  }
});

it('opens a collection as a wishlist', async () => {
  const user = userEvent.setup();
  renderScreen(<Profile />, asOwner);
  await user.click(screen.getByText('Maison'));
  expect(screen.getByTestId('path')).toHaveTextContent('/u/sophie/listes/c2');
});

/**
 * `empty` used to be a screen you navigated to. An empty list is a state of the
 * wishlist route now, so the empty collection routes to its own list URL like
 * any other — the emptiness is what that route finds there.
 */
it('routes the empty collection to its own list', async () => {
  const user = userEvent.setup();
  renderScreen(<Profile />, asOwner);
  await user.click(screen.getByText('Noël'));
  expect(screen.getByTestId('path')).toHaveTextContent('/u/sophie/listes/c4');
});

it('toggles a like without opening the collection', async () => {
  const user = userEvent.setup();
  renderScreen(<Profile />, asOwner);
  const heart = screen.getByRole('button', { name: 'Aimer Maison' });
  expect(heart).toHaveAttribute('aria-pressed', 'false');
  await user.click(heart);
  expect(heart).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByTestId('path')).toHaveTextContent('/moi');
});
