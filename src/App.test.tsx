import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import {
  createMemoryRouter,
  Outlet,
  RouterProvider,
  type RouteObject,
} from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { routes } from './app/routes';
import { RouteError } from './app/RouteError';
import { Toast } from './components/Toast';
import { StoreProvider, useStore } from './state/store';
import { StubSessionProvider, type Viewer } from './auth/SessionContext';
import { MARC, SOPHIE } from './test/render';

function ToastHost() {
  const { toast } = useStore();
  return toast ? <Toast message={toast} /> : null;
}

/**
 * RootLayout, with the session stubbed.
 *
 * The real RootLayout mounts SessionProvider, which talks to Supabase and —
 * with no backend configured under test — resolves to a signed-out viewer.
 * Wrapping RouterProvider from the outside cannot fix that: the inner provider
 * would shadow the stub. So this test substitutes the root element and keeps
 * every child route below it untouched, which is the part under test.
 */
function TestRoot({ viewer }: { viewer: Viewer | null }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <StubSessionProvider viewer={viewer}>
        <StoreProvider>
          <div>
            <Outlet />
            <ToastHost />
          </div>
        </StoreProvider>
      </StubSessionProvider>
    </QueryClientProvider>
  );
}

/**
 * Renders the real route tree at a real URL, as a given viewer.
 *
 * The prototype drove this test through the dev chrome — a sidebar of twelve
 * screen buttons and a Rôle toggle. Both are gone: you are an owner because
 * the list in the URL is yours AND the signed-in profile is yours, not because
 * you flipped a switch. `viewer` is the second half of that: it says who is
 * looking, which the URL alone cannot.
 */
function renderAt(path: string, viewer: Viewer | null = MARC) {
  const testRoutes: RouteObject[] = [
    {
      element: <TestRoot viewer={viewer} />,
      errorElement: <RouteError />,
      children: routes[0].children,
    },
  ];
  const router = createMemoryRouter(testRoutes, { initialEntries: [path] });
  return render(<RouterProvider router={router} />);
}

// The list is always Sophie's. Who changes is the viewer: as SOPHIE it is her
// own list (the owner's view), as MARC it is a friend looking at it.
const LIST = '/u/sophie/listes/anniversaire';

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
  const { unmount } = renderAt(LIST, MARC);

  // As a friend, open the AirPods and reserve them.
  await user.click(screen.getByText('AirPods Pro 3'));
  await user.click(screen.getByRole('button', { name: 'Réserver ce cadeau' }));
  expect(screen.getByRole('status')).toHaveTextContent('Sophie ne verra rien');

  // The friend sees their own reservation, and the taken count, on the list.
  await user.click(screen.getByRole('link', { name: 'Retour à la liste' }));
  expect(screen.getByText('Réservé par vous')).toBeInTheDocument();
  expect(screen.getByText(/réservées/)).toBeInTheDocument();

  unmount();

  // The same list, seen by Sophie herself: every trace is gone.
  renderAt(LIST, SOPHIE);
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
  const { unmount } = renderAt(`${LIST}/g3/cagnotte`, MARC);
  expect(screen.getByRole('region', { name: 'Cagnotte' })).toBeInTheDocument();
  expect(screen.getByText('650 € récoltés')).toBeInTheDocument();
  unmount();

  // The owner gets no pot section at all — not an empty one.
  renderAt(`${LIST}/g3/cagnotte`, SOPHIE);
  expect(
    screen.queryByRole('region', { name: 'Cagnotte' }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText(/récoltés/)).not.toBeInTheDocument();
});
