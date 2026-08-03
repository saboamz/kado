import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddWish } from './AddWish';
import { ADD_METHODS, ANALYZE_MS, SCRAPED } from '../data/add';
import { renderScreen } from '../test/render';

const onAdd = { screen: 'add' as const };

describe('the idle state', () => {
  it('offers the alternative ways to add a wish', () => {
    renderScreen(<AddWish />, { initial: onAdd });
    for (const m of ADD_METHODS) {
      expect(screen.getByText(m.title)).toBeInTheDocument();
    }
  });

  it('accepts a pasted link', async () => {
    const user = userEvent.setup();
    renderScreen(<AddWish />, { initial: onAdd });
    const input = screen.getByRole('textbox', { name: 'Lien du produit' });
    await user.type(input, 'apple.com');
    expect(input).toHaveValue('apple.com');
  });

  it('closes back to home', async () => {
    const user = userEvent.setup();
    renderScreen(<AddWish />, { initial: onAdd });
    await user.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(screen.getByTestId('screen')).toHaveTextContent('home');
  });
});

describe('analysing a link', () => {
  it('shows a busy, disabled state while the link is being read', async () => {
    const user = userEvent.setup();
    renderScreen(<AddWish />, { initial: onAdd });

    await user.click(
      screen.getByRole('button', { name: 'Récupérer les informations' }),
    );
    expect(screen.getByRole('button', { name: 'Analyse du lien…' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveAccessibleName(
      'Analyse du lien en cours',
    );
  });

  it('reveals the scraped product once the analysis finishes', async () => {
    vi.useFakeTimers();
    renderScreen(<AddWish />, { initial: onAdd });

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
    vi.useRealTimers();
  });

  it('hides the alternative methods once a result arrives', () => {
    renderScreen(<AddWish />, { initial: { ...onAdd, addStep: 2 } });
    expect(screen.queryByText(ADD_METHODS[0].title)).not.toBeInTheDocument();
  });
});

describe('configuring the wish', () => {
  const found = { ...onAdd, addStep: 2 as const };

  it('preselects the default list and priority', () => {
    renderScreen(<AddWish />, { initial: found });
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
    renderScreen(<AddWish />, { initial: found });
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
    renderScreen(<AddWish />, { initial: found });
    await user.click(screen.getByRole('button', { name: 'Priorité 1 sur 3' }));
    expect(
      screen.getByRole('button', { name: 'Priorité 1 sur 3' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('saves to the chosen list and confirms by name', async () => {
    const user = userEvent.setup();
    renderScreen(<AddWish />, { initial: found });
    await user.click(screen.getByRole('button', { name: 'Noël' }));
    await user.click(screen.getByRole('button', { name: 'Ajouter à ma liste' }));
    expect(screen.getByTestId('screen')).toHaveTextContent('list');
    expect(screen.getByTestId('toast')).toHaveTextContent(
      `${SCRAPED.name} ajoutés à Noël`,
    );
  });

  it('resets the flow after saving, so the next add starts clean', async () => {
    const user = userEvent.setup();
    renderScreen(<AddWish />, { initial: found });
    await user.click(screen.getByRole('button', { name: 'Ajouter à ma liste' }));
    // Back on the add screen the form is idle again, not showing a stale result.
    expect(screen.queryByText(SCRAPED.source)).not.toBeInTheDocument();
  });
});
