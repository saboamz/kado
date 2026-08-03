import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';

const goTo = async (user: ReturnType<typeof userEvent.setup>, label: string) => {
  const nav = screen.getByRole('navigation', { name: 'Écrans' });
  await user.click(within(nav).getByRole('button', { name: new RegExp(label) }));
};

const setRole = async (
  user: ReturnType<typeof userEvent.setup>,
  role: 'Propriétaire' | 'Ami',
) => {
  const group = screen.getByRole('group', { name: 'Rôle' });
  await user.click(within(group).getByRole('button', { name: role }));
};

it('presents the prototype and its twelve screens', () => {
  render(<App />);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
    'que vos proches remplissent en secret',
  );
  const nav = screen.getByRole('navigation', { name: 'Écrans' });
  expect(within(nav).getAllByRole('button')).toHaveLength(12);
});

it('navigates between screens from the index', async () => {
  const user = userEvent.setup();
  render(<App />);
  await goTo(user, 'Paramètres');
  expect(screen.getByRole('heading', { name: 'Paramètres' })).toBeInTheDocument();
});

it('switches the whole device to dark', async () => {
  const user = userEvent.setup();
  render(<App />);
  const theme = screen.getByRole('group', { name: 'Thème' });
  await user.click(within(theme).getByRole('button', { name: 'Sombre' }));
  expect(within(theme).getByRole('button', { name: 'Sombre' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await goTo(user, 'Paramètres');
  expect(screen.getByText('Sombre', { selector: 'span' })).toBeInTheDocument();
});

/**
 * The promise the product is built on, exercised the way the tip in the
 * sidebar tells you to: reserve a gift as a friend, switch to the owner, and
 * confirm nothing about that reservation survives the switch.
 */
it('never leaks a reservation to the owner', async () => {
  const user = userEvent.setup();
  render(<App />);

  // As a friend, open the wishlist and reserve the AirPods.
  await goTo(user, 'Liste de souhaits');
  await user.click(screen.getByText('AirPods Pro 3'));
  await user.click(screen.getByRole('button', { name: 'Réserver ce cadeau' }));
  expect(screen.getByRole('status')).toHaveTextContent(
    'Sophie ne verra rien',
  );

  // The friend sees their own reservation on the list.
  await goTo(user, 'Liste de souhaits');
  expect(screen.getByText('Réservé par vous')).toBeInTheDocument();
  expect(screen.getByText(/réservées/)).toBeInTheDocument();

  // Switch to the owner: every trace is gone.
  await setRole(user, 'Propriétaire');
  expect(screen.queryByText('Réservé par vous')).not.toBeInTheDocument();
  expect(screen.queryByText('Déjà réservé')).not.toBeInTheDocument();
  expect(screen.queryByText(/réservées/)).not.toBeInTheDocument();
  expect(
    screen.queryByText('Le propriétaire ne le voit pas'),
  ).not.toBeInTheDocument();

  // Not on the gift's own screen either.
  await user.click(screen.getByText('AirPods Pro 3'));
  expect(
    screen.getByRole('button', { name: 'Modifier ce cadeau' }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: /Réserver|Annuler ma réservation/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText(/aucune information de réservation n'existe/),
  ).toBeInTheDocument();

  // And switching back proves the reservation was never destroyed, only hidden.
  await setRole(user, 'Ami');
  expect(
    screen.getByRole('button', { name: 'Annuler ma réservation' }),
  ).toBeInTheDocument();
});

it('hides the cagnotte total from the owner', async () => {
  const user = userEvent.setup();
  render(<App />);

  await goTo(user, 'Cadeau collaboratif');
  expect(screen.getByRole('region', { name: 'Cagnotte' })).toBeInTheDocument();
  expect(screen.getByText('650 € récoltés')).toBeInTheDocument();

  await setRole(user, 'Propriétaire');
  expect(
    screen.queryByRole('region', { name: 'Cagnotte' }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText(/récoltés/)).not.toBeInTheDocument();
});
