import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Wishlist } from './Wishlist';
import { GIFTS } from '../data/fixtures';
import { renderScreen, MARC, SOPHIE } from '../test/render';

/**
 * Ownership is the URL's handle matched against the signed-in viewer, not a
 * `role` field. The list below is always Sophie's; what changes is who is
 * looking at it — as Sophie it is her own list, as Marc it is a friend's view
 * of it.
 */
const LIST_PATH = '/u/:handle/listes/:slug';
const LIST = '/u/sophie/listes/anniversaire';
const asOwner = { route: LIST, path: LIST_PATH, viewer: SOPHIE };
const asFriend = { route: LIST, path: LIST_PATH, viewer: MARC };

it('lists every gift', () => {
  renderScreen(<Wishlist />, asFriend);
  for (const g of GIFTS) {
    expect(screen.getByText(g.name)).toBeInTheDocument();
  }
});

it('switches between grid and rows', async () => {
  const user = userEvent.setup();
  renderScreen(<Wishlist />, asFriend);
  const toggle = screen.getByRole('button', { name: 'Vue liste' });
  await user.click(toggle);
  expect(screen.getByRole('button', { name: 'Vue grille' })).toBeInTheDocument();
});

it('opens a gift detail', async () => {
  const user = userEvent.setup();
  renderScreen(<Wishlist />, asFriend);
  await user.click(screen.getByText('AirPods Pro 3'));
  expect(screen.getByTestId('path')).toHaveTextContent(
    '/u/sophie/listes/anniversaire/g1',
  );
});

it('sends a collaborative gift to the pot screen', async () => {
  const user = userEvent.setup();
  renderScreen(<Wishlist />, asFriend);
  await user.click(screen.getByText('MacBook Air 15″ M4'));
  expect(screen.getByTestId('path')).toHaveTextContent(
    '/u/sophie/listes/anniversaire/g3/cagnotte',
  );
});

describe('the secrecy rule on the list', () => {
  it('flags reserved gifts for a friend', () => {
    renderScreen(<Wishlist />, {
      ...asFriend,
      initial: { reserved: { g1: 'you', g2: 'other' } },
    });
    expect(screen.getByText('Réservé par vous')).toBeInTheDocument();
    expect(screen.getByText('Déjà réservé')).toBeInTheDocument();
  });

  it('shows the owner no reservation flag at all', () => {
    renderScreen(<Wishlist />, {
      ...asOwner,
      initial: { reserved: { g1: 'you', g2: 'other' } },
    });
    expect(screen.queryByText('Réservé par vous')).not.toBeInTheDocument();
    expect(screen.queryByText('Déjà réservé')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Le propriétaire ne le voit pas'),
    ).not.toBeInTheDocument();
  });

  it('never shows the owner a count of reserved gifts', () => {
    renderScreen(<Wishlist />, {
      ...asOwner,
      initial: { reserved: { g1: 'you', g2: 'other' } },
    });
    // The friend view says "6 envies · 2 réservées"; the owner must not.
    expect(screen.queryByText(/réservées/)).not.toBeInTheDocument();
    expect(screen.getByText(`${GIFTS.length} envies`)).toBeInTheDocument();
  });

  it('still shows the friend the reserved count', () => {
    renderScreen(<Wishlist />, {
      ...asFriend,
      initial: { reserved: { g1: 'you', g2: 'other' } },
    });
    expect(screen.getByText(/2 réservées/)).toBeInTheDocument();
  });

  it('keeps the cagnotte badge for everyone, it reveals nobody', () => {
    renderScreen(<Wishlist />, asOwner);
    // A pot's existence is public: the owner asked for the gift. Who paid is not.
    expect(screen.getAllByText('Cagnotte').length).toBeGreaterThan(0);
  });
});
