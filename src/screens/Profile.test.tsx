import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Profile } from './Profile';
import { renderScreen, MARC, SOPHIE } from '../test/render';

/**
 * `/moi` is always the viewer's own profile; `/u/:handle` is someone else's
 * unless the handle matches the signed-in viewer. There is no `role` field to
 * set — the URL says whose profile, the viewer says who is reading it.
 */
const asFriend = { route: '/u/sophie', path: '/u/:handle', viewer: MARC };
const asOwner = { route: '/moi', viewer: SOPHIE };

it('names the person and lists their interests', async () => {
  renderScreen(<Profile />, asFriend);
  // The heading element is on screen immediately holding a skeleton, so the
  // wait is for the name to land in it — not for the h2 to exist.
  // The "Collections" eyebrow is an h3, so the name is addressed by level.
  await screen.findByText('Sophie Marchand');
  expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
    'Sophie Marchand',
  );
  for (const i of ['Céramique', 'Café', 'Randonnée', 'Design']) {
    expect(screen.getByText(i)).toBeInTheDocument();
  }
});

it('shows the fetched bio', async () => {
  renderScreen(<Profile />, asFriend);
  expect(await screen.findByText(/Café filtre, céramique/)).toBeInTheDocument();
});

/**
 * The screen used to render "Sophie Marchand" whatever the URL said, because
 * the name was a fixture constant rather than data. It renders the profile it
 * fetched now, so a different handle is a different name.
 */
it('names whoever the URL asks for, not always Sophie', async () => {
  renderScreen(<Profile />, {
    route: '/u/thomas',
    path: '/u/:handle',
    viewer: MARC,
  });
  await screen.findByText('Thomas Bel');
  expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
    'Thomas Bel',
  );
  expect(screen.queryByText('Sophie Marchand')).not.toBeInTheDocument();
});

it('addresses the owner as themselves', async () => {
  renderScreen(<Profile />, asOwner);
  await screen.findByText('Sophie (vous)');
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

/** The follow toast names the person on screen rather than a hardcoded Sophie. */
it('names the followed person in the toast', async () => {
  const user = userEvent.setup();
  renderScreen(<Profile />, {
    route: '/u/thomas',
    path: '/u/:handle',
    viewer: MARC,
  });
  await screen.findByText('Thomas Bel');
  await user.click(screen.getByRole('button', { name: 'Suivre' }));
  expect(screen.getByTestId('toast')).toHaveTextContent('Vous suivez Thomas');
});

it('shows every collection', async () => {
  renderScreen(<Profile />, asFriend);
  expect(await screen.findByText('Anniversaire')).toBeInTheDocument();
  for (const name of ['Maison', 'Voyage', 'Noël', 'Sport', 'Geek']) {
    expect(screen.getByText(name)).toBeInTheDocument();
  }
});

/**
 * The only stat with a source behind it. "41 envies" and "12 reçus" were
 * fixture numbers with no table to compute them from, so they are gone rather
 * than invented; the list count is the length of what we fetched.
 */
it('counts the lists it actually fetched', async () => {
  renderScreen(<Profile />, asFriend);
  expect(await screen.findByText('Anniversaire')).toBeInTheDocument();
  const stat = screen.getByText('Listes').closest('div')!;
  expect(stat).toHaveTextContent('6');
});

it('opens a collection as a wishlist', async () => {
  const user = userEvent.setup();
  renderScreen(<Profile />, asOwner);
  await user.click(await screen.findByText('Maison'));
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
  await user.click(await screen.findByText('Noël'));
  expect(screen.getByTestId('path')).toHaveTextContent('/u/sophie/listes/c4');
});

it('toggles a like without opening the collection', async () => {
  const user = userEvent.setup();
  renderScreen(<Profile />, asOwner);
  const heart = await screen.findByRole('button', { name: 'Aimer Maison' });
  expect(heart).toHaveAttribute('aria-pressed', 'false');
  await user.click(heart);
  expect(heart).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByTestId('path')).toHaveTextContent('/moi');
});
