import { render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import {
  createMemoryRouter,
  RouterProvider,
  useLocation,
} from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StoreProvider, useStore, type State } from '../state/store';
import { server } from './msw/server';
import { resetDb } from './msw/handlers';

/**
 * Surfaces the bits of app state that tests assert on.
 *
 * `screen` and `tab` used to come from the store. They now come from the URL,
 * so the probe reports the pathname instead — same idea, different source of
 * truth. Tests that asserted `screen` = 'search' assert the path is
 * '/recherche'.
 */
export function StoreProbe() {
  const { toast } = useStore();
  const { pathname, search } = useLocation();
  return (
    <>
      <span data-testid="path">{pathname}</span>
      <span data-testid="search">{search}</span>
      <span data-testid="toast">{toast ?? ''}</span>
    </>
  );
}

/**
 * Renders a screen inside the providers it expects.
 *
 * The signature is deliberately unchanged from the prototype's — `initial` and
 * `dark` still mean what they meant — so screen tests migrate by changing what
 * they assert, not how they render. `route` is new: a screen that reads
 * useParams needs a URL to read them from.
 */
export function renderScreen(
  ui: ReactElement,
  {
    initial,
    dark = false,
    route = '/',
    path,
  }: {
    initial?: Partial<State>;
    dark?: boolean;
    /** The URL to start at. */
    route?: string;
    /** The route pattern, when the screen reads params (e.g. '/u/:handle'). */
    path?: string;
  } = {},
) {
  function Wrapper({ children }: { children: ReactNode }) {
    const router = createMemoryRouter(
      [
        {
          path: path ?? route,
          element: (
            <>
              {children}
              <StoreProbe />
            </>
          ),
        },
        // Anything the screen navigates to must resolve, or React Router warns
        // and the assertion drowns in noise.
        {
          path: '*',
          element: (
            <>
              <StoreProbe />
            </>
          ),
        },
      ],
      { initialEntries: [route] },
    );

    return (
      <QueryClientProvider client={makeTestQueryClient()}>
        <StoreProvider initial={{ ...initial, dark }}>
          <RouterProvider router={router} />
        </StoreProvider>
      </QueryClientProvider>
    );
  }

  return render(<Wrapper>{ui}</Wrapper>);
}

/**
 * A cache with retries off.
 *
 * The app retries twice by default; in a test that turns one deliberately
 * failing request into three, and the failure surfaces seconds later as a
 * timeout rather than immediately as the error it is.
 */
function makeTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

/**
 * Opt a suite into the mock PostgREST server.
 *
 * Call at the top of a describe block. `session` picks whose eyes you are
 * looking through — pass 'sophie' to be the list owner, anything else to be a
 * friend — which is how a test asks the *server* to enforce the secrecy rule
 * rather than asking the component to hide something it was given.
 */
export function useMockApi(session: string = 'marc') {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  beforeEach(() => resetDb({ sessionHandle: session }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());
}
