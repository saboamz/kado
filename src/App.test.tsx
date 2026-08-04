import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { routes } from './app/routes';

/**
 * Renders the real route tree at a real URL.
 *
 * The prototype drove this test through the dev chrome — a sidebar of twelve
 * screen buttons and a Rôle toggle. Both are gone: you are an owner because
 * the list in the URL is yours, not because you flipped a switch.
 */
function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(<RouterProvider router={router} />);
}

// `sophie` is the signed-in handle (see useViewerRole); any other handle is
// someone else's list, viewed as a friend.
const OWN_LIST = '/u/sophie/listes/anniversaire';
const FRIEND_LIST = '/u/marc/listes/anniversaire';

it('lands on the home screen', () => {
  renderAt('/');
  expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
});

it('serves a deep-linked screen directly', () => {
  renderAt('/parametres');
  expect(screen.getByRole('heading', { name: 'Paramètres' })).toBeInTheDocument();
});

it('shows the error screen for an unknown URL', () => {
  renderAt('/cette-page-nexiste-pas');
  expect(
    screen.getByRole('heading', { name: 'Page introuvable' }),
  ).toBeInTheDocument();
});

/**
 * The promise the product is built on: reserve a gift on a friend's list, then
 * look at your own list, and confirm nothing about that reservation surfaces.
 *
 * NOTE: this proves the UI does not render the secret. It does NOT prove the
 * owner cannot obtain it — the data still sits in the client store, filtered on
 * read. The server-side half of this guarantee is P5, where an owner's session
 * cannot retrieve reservation rows at all. Both halves are needed; this one
 * alone is cosmetic.
 */
it('never leaks a reservation to the owner', async () => {
  const user = userEvent.setup();
  const { unmount } = renderAt(FRIEND_LIST);

  // As a friend, open the AirPods and reserve them.
  await user.click(screen.getByText('AirPods Pro 3'));
  await user.click(screen.getByRole('button', { name: 'Réserver ce cadeau' }));
  expect(screen.getByRole('status')).toHaveTextContent('Sophie ne verra rien');

  // The friend sees their own reservation, and the taken count, on the list.
  await user.click(screen.getByRole('link', { name: 'Retour à la liste' }));
  expect(screen.getByText('Réservé par vous')).toBeInTheDocument();
  expect(screen.getByText(/réservées/)).toBeInTheDocument();

  unmount();

  // The owner's own list: every trace is gone.
  renderAt(OWN_LIST);
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
});

it('hides the cagnotte from the owner', async () => {
  // A friend sees the pot in full.
  const { unmount } = renderAt(`${FRIEND_LIST}/g3/cagnotte`);
  expect(screen.getByRole('region', { name: 'Cagnotte' })).toBeInTheDocument();
  expect(screen.getByText('650 € récoltés')).toBeInTheDocument();
  unmount();

  // The owner gets no pot section at all — not an empty one.
  renderAt(`${OWN_LIST}/g3/cagnotte`);
  expect(
    screen.queryByRole('region', { name: 'Cagnotte' }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText(/récoltés/)).not.toBeInTheDocument();
});
