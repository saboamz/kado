import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddWish } from './AddWish';
import { ADD_METHODS, ANALYZE_MS, SCRAPED } from '../data/add';
import { renderScreen } from '../test/render';

/**
 * `addStep` 0/1/2 became two routes. Step 0 is `/ajouter/lien` and step 2 is
 * `/ajouter/details`; the intermediate "analysing" step is local loading state,
 * reached by clicking through, because a URL for an in-flight request would be
 * a lie.
 */
const onLink = { route: '/ajouter/lien' };
const onDetails = { route: '/ajouter/details' };
/**
 * Both steps under one pattern, so the screen stays mounted when it navigates
 * from `lien` to `details` — the harness renders the screen only on the route
 * it matched, and step 2 is the same component, not a new one.
 */
const acrossSteps = { route: '/ajouter/lien', path: '/ajouter/*' };

describe('the idle state', () => {
  it('offers the alternative ways to add a wish', () => {
    renderScreen(<AddWish />, onLink);
    for (const m of ADD_METHODS) {
      expect(screen.getByText(m.title)).toBeInTheDocument();
    }
  });

  it('accepts a pasted link', async () => {
    const user = userEvent.setup();
    renderScreen(<AddWish />, onLink);
    const input = screen.getByRole('textbox', { name: 'Lien du produit' });
    await user.type(input, 'apple.com');
    expect(input).toHaveValue('apple.com');
  });

  it('closes back to home', async () => {
    const user = userEvent.setup();
    renderScreen(<AddWish />, onLink);
    await user.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(screen.getByTestId('path')).toHaveTextContent('/');
  });
});

describe('analysing a link', () => {
  it('shows a busy, disabled state while the link is being read', async () => {
    const user = userEvent.setup();
    renderScreen(<AddWish />, onLink);

    await user.click(
      screen.getByRole('button', { name: 'Récupérer les informations' }),
    );
    expect(screen.getByRole('button', { name: 'Analyse du lien…' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveAccessibleName(
      'Analyse du lien en cours',
    );
  });

  it('reveals the scraped product once the analysis finishes', () => {
    vi.useFakeTimers();
    // try/finally: a failed assertion must not leave fake timers installed for
    // the rest of the file, which would hang every userEvent that follows.
    try {
      renderScreen(<AddWish />, acrossSteps);

      // Fire the click directly: userEvent's internal delays and fake timers
      // deadlock, and the behaviour under test is the timeout, not the click.
      act(() => {
        screen
          .getByRole('button', { name: 'Récupérer les informations' })
          .click();
      });
      expect(screen.queryByText(SCRAPED.name)).not.toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(ANALYZE_MS);
      });
      expect(screen.getByText(SCRAPED.name)).toBeInTheDocument();
      expect(screen.getByText(SCRAPED.price)).toBeInTheDocument();
      // Finishing the analysis is what advances the flow to step 2.
      expect(screen.getByTestId('path')).toHaveTextContent('/ajouter/details');
    } finally {
      vi.useRealTimers();
    }
  });

  it('hides the alternative methods once a result arrives', () => {
    renderScreen(<AddWish />, onDetails);
    expect(screen.queryByText(ADD_METHODS[0].title)).not.toBeInTheDocument();
  });
});

describe('configuring the wish', () => {
  it('preselects the default list and priority', () => {
    renderScreen(<AddWish />, onDetails);
    expect(screen.getByRole('button', { name: 'Anniversaire' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      screen.getByRole('button', { name: 'Priorité 3 sur 3' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('changes the target list', async () => {
    const user = userEvent.setup();
    renderScreen(<AddWish />, onDetails);
    await user.click(screen.getByRole('button', { name: 'Noël' }));
    expect(screen.getByRole('button', { name: 'Noël' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Anniversaire' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('changes the priority', async () => {
    const user = userEvent.setup();
    renderScreen(<AddWish />, onDetails);
    await user.click(screen.getByRole('button', { name: 'Priorité 1 sur 3' }));
    expect(
      screen.getByRole('button', { name: 'Priorité 1 sur 3' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('saves to the chosen list and confirms by name', async () => {
    const user = userEvent.setup();
    renderScreen(<AddWish />, onDetails);
    await user.click(screen.getByRole('button', { name: 'Noël' }));
    await user.click(screen.getByRole('button', { name: 'Ajouter à ma liste' }));
    expect(screen.getByTestId('path')).toHaveTextContent(
      '/u/sophie/listes/anniversaire',
    );
    expect(screen.getByTestId('toast')).toHaveTextContent(
      `${SCRAPED.name} ajoutés à Noël`,
    );
  });

  it('resets the flow after saving, so the next add starts clean', async () => {
    const user = userEvent.setup();
    renderScreen(<AddWish />, onDetails);
    await user.click(screen.getByRole('button', { name: 'Ajouter à ma liste' }));
    // Saving leaves /ajouter/details behind, so there is no stale result to
    // come back to: the draft lived on that route and left with it.
    expect(screen.queryByText(SCRAPED.source)).not.toBeInTheDocument();
  });
});
