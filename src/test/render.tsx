import { render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { StoreProvider, useStore, type State } from '../state/store';
import { ThemeProvider } from '../theme';

/** Surfaces store fields so navigation and state are observable in tests. */
export function StoreProbe() {
  const { state, toast } = useStore();
  return (
    <>
      <span data-testid="screen">{state.screen}</span>
      <span data-testid="tab">{state.tab}</span>
      <span data-testid="toast">{toast ?? ''}</span>
    </>
  );
}

/** Renders a screen inside the store and theme it expects. */
export function renderScreen(
  ui: ReactElement,
  { initial, dark = false }: { initial?: Partial<State>; dark?: boolean } = {},
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <StoreProvider initial={initial}>
        <ThemeProvider dark={dark}>
          {children}
          <StoreProbe />
        </ThemeProvider>
      </StoreProvider>
    );
  }
  return render(ui, { wrapper: Wrapper });
}
