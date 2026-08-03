import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Wishlist } from './Wishlist';
import { GIFTS } from '../data/fixtures';
import { renderScreen } from '../test/render';

const asOwner = { role: 'owner' as const, screen: 'list' as const };

it('lists every gift', () => {
  renderScreen(<Wishlist />, { initial: { screen: 'list' } });
  for (const g of GIFTS) {
    expect(screen.getByText(g.name)).toBeInTheDocument();
  }
});

it('switches between grid and rows', async () => {
  const user = userEvent.setup();
  renderScreen(<Wishlist />, { initial: { screen: 'list' } });
  const toggle = screen.getByRole('button', { name: 'Vue liste' });
  await user.click(toggle);
  expect(screen.getByRole('button', { name: 'Vue grille' })).toBeInTheDocument();
});

it('opens a gift detail', async () => {
  const user = userEvent.setup();
  renderScreen(<Wishlist />, { initial: { screen: 'list' } });
  await user.click(screen.getByText('AirPods Pro 3'));
  expect(screen.getByTestId('screen')).toHaveTextContent('detail');
});

it('sends a collaborative gift to the pot screen', async () => {
  const user = userEvent.setup();
  renderScreen(<Wishlist />, { initial: { screen: 'list' } });
  await user.click(screen.getByText('MacBook Air 15″ M4'));
  expect(screen.getByTestId('screen')).toHaveTextContent('pot');
});

describe('the secrecy rule on the list', () => {
  it('flags reserved gifts for a friend', () => {
    renderScreen(<Wishlist />, {
      initial: { screen: 'list', reserved: { g1: 'you', g2: 'other' } },
    });
    expect(screen.getByText('Réservé par vous')).toBeInTheDocument();
    expect(screen.getByText('Déjà réservé')).toBeInTheDocument();
  });

  it('shows the owner no reservation flag at all', () => {
    renderScreen(<Wishlist />, {
      initial: { ...asOwner, reserved: { g1: 'you', g2: 'other' } },
    });
    expect(screen.queryByText('Réservé par vous')).not.toBeInTheDocument();
    expect(screen.queryByText('Déjà réservé')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Le propriétaire ne le voit pas'),
    ).not.toBeInTheDocument();
  });

  it('never shows the owner a count of reserved gifts', () => {
    renderScreen(<Wishlist />, {
      initial: { ...asOwner, reserved: { g1: 'you', g2: 'other' } },
    });
    // The friend view says "6 envies · 2 réservées"; the owner must not.
    expect(screen.queryByText(/réservées/)).not.toBeInTheDocument();
    expect(screen.getByText(`${GIFTS.length} envies`)).toBeInTheDocument();
  });

  it('still shows the friend the reserved count', () => {
    renderScreen(<Wishlist />, {
      initial: { screen: 'list', reserved: { g1: 'you', g2: 'other' } },
    });
    expect(screen.getByText(/2 réservées/)).toBeInTheDocument();
  });

  it('keeps the cagnotte badge for everyone, it reveals nobody', () => {
    renderScreen(<Wishlist />, { initial: asOwner });
    // A pot's existence is public: the owner asked for the gift. Who paid is not.
    expect(screen.getAllByText('Cagnotte').length).toBeGreaterThan(0);
  });
});
