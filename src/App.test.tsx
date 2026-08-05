import { render, screen, waitFor } from '@testing-library/react';
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
 * This is now the whole guarantee rather than half of it. The reservation no
 * longer sits in a client store to be filtered on read — it is held by the
 * server (the mock transport under test, which carries the same 42704 refusal
 * the SQL does), and an owner's query for it is REFUSED. So the absence
 * assertions below are about what the owner can obtain, not merely what the UI
 * chooses to draw.
 *
 * Which also means they are asynchronous. Each one waits for the screen to
 * settle first: asserting straight after render would pass before any answer
 * could have arrived, and would keep passing if the refusal were removed.
 */
it('never leaks a reservation to the owner', async () => {
  const user = userEvent.setup();
  const { unmount } = renderAt(LIST, MARC);

  // As a friend, open the AirPods and reserve them.
  await user.click(await screen.findByText('AirPods Pro 3'));
  await user.click(
    await screen.findByRole('button', { name: 'Réserver ce cadeau' }),
  );
  expect(screen.getByRole('status')).toHaveTextContent('Sophie ne verra rien');
  // Reserving round-trips through the RPC before the label flips.
  await screen.findByRole('button', { name: 'Annuler ma réservation' });

  // The friend sees their own reservation, and the taken count, on the list.
  await user.click(screen.getByRole('link', { name: 'Retour à la liste' }));
  expect(await screen.findByText('Réservé par vous')).toBeInTheDocument();
  expect(await screen.findByText(/réservées/)).toBeInTheDocument();

  unmount();

  // The same list, seen by Sophie herself: every trace is gone.
  renderAt(LIST, SOPHIE);
  await settle();
  expect(screen.queryByText('Réservé par vous')).not.toBeInTheDocument();
  expect(screen.queryByText('Déjà réservé')).not.toBeInTheDocument();
  expect(screen.queryByText(/réservées/)).not.toBeInTheDocument();
  expect(
    screen.queryByText('Le propriétaire ne le voit pas'),
  ).not.toBeInTheDocument();

  // Not on the gift's own screen either.
  await user.click(screen.getByText('AirPods Pro 3'));
  await settle();
  expect(
    screen.getByText(/aucune information de réservation n'existe/),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Modifier ce cadeau' }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: /Réserver|Annuler ma réservation/ }),
  ).not.toBeInTheDocument();
});

it('hides the cagnotte from the owner', async () => {
  // A friend sees the pot in full. This is the control for the owner half:
  // without it, the absence assertions below would also pass on a screen where
  // the pot simply never rendered.
  const { unmount } = renderAt(`${LIST}/g3/cagnotte`, MARC);
  expect(
    await screen.findByRole('region', { name: 'Cagnotte' }),
  ).toBeInTheDocument();
  // 65 000 cents from get_pot_state, formatted by Intl — hence \s rather than
  // a pasted non-breaking space.
  expect(await screen.findByText(/^650\s€ récoltés$/)).toBeInTheDocument();
  unmount();

  // The owner gets no pot section at all — not an empty one.
  renderAt(`${LIST}/g3/cagnotte`, SOPHIE);
  await settle();
  expect(
    screen.queryByRole('region', { name: 'Cagnotte' }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText(/récoltés/)).not.toBeInTheDocument();
});

/**
 * Wait until the screen has stopped changing.
 *
 * The absence assertions above are the whole point of these tests, so the wait
 * in front of them has to be one a leak cannot slip past. Waiting for a
 * specific element does not qualify: every element an owner's screen renders is
 * there on the first paint, before any request has resolved, so a leaking
 * answer arrives a tick AFTER the wait succeeds and the assertion still passes.
 * Confirmed by stubbing the transport to answer an owner with a friend's data.
 *
 * Polling for quiescence — the rendered text unchanged across consecutive
 * macrotasks — puts that late answer inside the window instead.
 */
async function settle() {
  let previous = '';
  await waitFor(
    () => {
      const current = document.body.textContent ?? '';
      const stable = current === previous;
      previous = current;
      expect(stable).toBe(true);
    },
    { interval: 10 },
  );
}
