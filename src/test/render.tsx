import { render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import {
  createMemoryRouter,
  RouterProvider,
  useLocation,
} from 'react-router-dom';
import { StoreProvider, useStore, type State } from '../state/store';

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
      <StoreProvider initial={{ ...initial, dark }}>
        <RouterProvider router={router} />
      </StoreProvider>
    );
  }

  return render(<Wrapper>{ui}</Wrapper>);
}
