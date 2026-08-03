import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GiftDetail } from './GiftDetail';
import { renderScreen } from '../test/render';

const onGift = (id: string) => ({ screen: 'detail' as const, current: id });
const onPot = { screen: 'pot' as const, current: 'g3' };

describe('the gift', () => {
  it('shows name, price, category and description', () => {
    renderScreen(<GiftDetail />, { initial: onGift('g1') });
    expect(screen.getByRole('heading')).toHaveTextContent('AirPods Pro 3');
    expect(screen.getByText('279 €')).toBeInTheDocument();
    expect(screen.getByText('Tech')).toBeInTheDocument();
    expect(screen.getByText(/Réduction de bruit active/)).toBeInTheDocument();
  });

  it('credits the merchant', () => {
    renderScreen(<GiftDetail />, { initial: onGift('g1') });
    expect(screen.getByText('Apple Store')).toBeInTheDocument();
    expect(screen.getByText('apple.com/fr/airpods-pro')).toBeInTheDocument();
  });

  it('labels the priority for assistive tech', () => {
    renderScreen(<GiftDetail />, { initial: onGift('g5') });
    expect(screen.getByLabelText('Priorité 1 sur 3')).toBeInTheDocument();
    expect(screen.getByText('Ce serait sympa')).toBeInTheDocument();
  });

  it('goes back to the list', async () => {
    const user = userEvent.setup();
    renderScreen(<GiftDetail />, { initial: onGift('g1') });
    await user.click(screen.getByRole('button', { name: 'Retour à la liste' }));
    expect(screen.getByTestId('screen')).toHaveTextContent('list');
  });
});

describe('reserving as a friend', () => {
  it('reserves an available gift and reassures the reserver', async () => {
    const user = userEvent.setup();
    renderScreen(<GiftDetail />, { initial: onGift('g1') });
    await user.click(screen.getByRole('button', { name: 'Réserver ce cadeau' }));
    expect(screen.getByTestId('toast')).toHaveTextContent(
      'Réservé — Sophie ne verra rien',
    );
    expect(
      screen.getByRole('button', { name: 'Annuler ma réservation' }),
    ).toBeInTheDocument();
  });

  it('releases a gift it already holds', async () => {
    const user = userEvent.setup();
    renderScreen(<GiftDetail />, {
      initial: { ...onGift('g1'), reserved: { g1: 'you' } },
    });
    await user.click(
      screen.getByRole('button', { name: 'Annuler ma réservation' }),
    );
    expect(screen.getByTestId('toast')).toHaveTextContent(
      'Réservation annulée',
    );
    expect(
      screen.getByRole('button', { name: 'Réserver ce cadeau' }),
    ).toBeInTheDocument();
  });

  it("disables a gift another friend already took", () => {
    renderScreen(<GiftDetail />, {
      initial: { ...onGift('g2'), reserved: { g2: 'other' } },
    });
    expect(
      screen.getByRole('button', { name: 'Déjà réservé par un proche' }),
    ).toBeDisabled();
  });
});

describe('the secrecy rule on the detail screen', () => {
  it('offers the owner editing, never reserving', () => {
    renderScreen(<GiftDetail />, {
      initial: { ...onGift('g1'), role: 'owner', reserved: { g1: 'other' } },
    });
    expect(
      screen.getByRole('button', { name: 'Modifier ce cadeau' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Réserver|réservé/ }),
    ).not.toBeInTheDocument();
  });

  it('tells the owner no reservation data exists here', () => {
    renderScreen(<GiftDetail />, {
      initial: { ...onGift('g1'), role: 'owner', reserved: { g1: 'other' } },
    });
    expect(
      screen.getByText(/aucune information de réservation n'existe/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Sophie ne verra jamais cette réservation/),
    ).not.toBeInTheDocument();
  });

  it('hides the whole pot from the owner', () => {
    renderScreen(<GiftDetail />, { initial: { ...onPot, role: 'owner' } });
    expect(
      screen.queryByRole('region', { name: 'Cagnotte' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/récoltés/)).not.toBeInTheDocument();
  });

  it('promises anonymity to a friend before they reserve', () => {
    renderScreen(<GiftDetail />, { initial: onGift('g1') });
    expect(
      screen.getByText('Votre réservation restera invisible pour Sophie.'),
    ).toBeInTheDocument();
  });
});

describe('the cagnotte', () => {
  it('shows progress toward the target', () => {
    renderScreen(<GiftDetail />, { initial: onPot });
    const bar = screen.getByRole('progressbar', { name: /Cagnotte à/ });
    expect(bar).toHaveAttribute('aria-valuenow', '650');
    expect(bar).toHaveAttribute('aria-valuemax', '1599');
    expect(screen.getByText('650 € récoltés')).toBeInTheDocument();
  });

  it('contributes the chosen amount, anonymously', async () => {
    const user = userEvent.setup();
    renderScreen(<GiftDetail />, { initial: onPot });
    await user.click(screen.getByRole('button', { name: '100 €' }));
    await user.click(
      screen.getByRole('button', { name: 'Participer avec 100 €' }),
    );
    expect(screen.getByTestId('toast')).toHaveTextContent(
      'votre participation est anonyme',
    );
    expect(screen.getByText('750 € récoltés')).toBeInTheDocument();
  });

  it('never overshoots the target', async () => {
    const user = userEvent.setup();
    renderScreen(<GiftDetail />, { initial: { ...onPot, pot: 1550, contrib: 200 } });
    await user.click(
      screen.getByRole('button', { name: 'Participer avec 200 €' }),
    );
    expect(screen.getByText('1 599 € récoltés')).toBeInTheDocument();
  });

  it('falls back to a collaborative gift when the pot screen has none', () => {
    // Arriving from the feed's cagnotte entry: screen is 'pot', current is 'g1'.
    renderScreen(<GiftDetail />, { initial: { screen: 'pot', current: 'g1' } });
    expect(screen.getByRole('region', { name: 'Cagnotte' })).toBeInTheDocument();
  });
});
