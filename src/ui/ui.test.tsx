import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button';
import { Card } from './Card';
import { Chip, Tag } from './Chip';
import { Eyebrow } from './Eyebrow';
import { Progress } from './Progress';
import { ScreenShell } from './ScreenShell';
import { cn } from './cn';

/**
 * These primitives exist to fix two things the inline-styled prototype could
 * not express at all: a visible keyboard focus ring, and a disabled state that
 * reads as disabled. Both are asserted here rather than left to review.
 *
 * jsdom does not compute a real focus ring, so the assertions check that the
 * `focus-visible:` utilities are present and that focus/disabled semantics
 * behave — which is the part that regresses in practice.
 */

describe('Button', () => {
  it('carries a keyboard focus ring', () => {
    render(<Button>Réserver</Button>);
    expect(screen.getByRole('button')).toHaveClass(
      'focus-visible:outline-accent',
    );
  });

  it('is reachable and activatable by keyboard', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Réserver</Button>);

    await user.tab();
    expect(screen.getByRole('button')).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('communicates disabled beyond the cursor', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Déjà réservé
      </Button>,
    );

    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    // The prototype's taken-gift button only set cursor:not-allowed, which is
    // invisible to anyone not using a mouse.
    expect(btn.className).toMatch(/disabled:opacity-40/);

    await user.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('defaults to type=button so it cannot submit a form by accident', () => {
    render(<Button>Ajouter</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('lets a caller override the type', () => {
    render(<Button type="submit">Envoyer</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });
});

describe('Chip', () => {
  it('reports selection assistively, not only through colour', () => {
    render(
      <>
        <Chip selected>Amis</Chip>
        <Chip selected={false}>Tous</Chip>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Amis' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Tous' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('paints a selected chip with the accent', () => {
    render(<Chip selected>Amis</Chip>);
    expect(screen.getByRole('button')).toHaveClass('bg-accent');
  });

  it('renders a static Tag that is not a control', () => {
    render(<Tag>Tech</Tag>);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Tech')).toBeInTheDocument();
  });
});

describe('Progress', () => {
  it('reports the full ARIA trio', () => {
    render(<Progress value={650} max={1599} label="Progression" />);
    const bar = screen.getByRole('progressbar', { name: 'Progression' });
    expect(bar).toHaveAttribute('aria-valuenow', '650');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '1599');
  });

  it('clamps out-of-range values instead of overflowing', () => {
    const { container } = render(
      <Progress value={9999} max={1599} label="Progression" />,
    );
    const fill = container.querySelector('[role=progressbar] > div');
    expect(fill).toHaveStyle({ width: '100%' });
  });

  it('survives a zero max without dividing by zero', () => {
    const { container } = render(
      <Progress value={0} max={0} label="Progression" />,
    );
    const fill = container.querySelector('[role=progressbar] > div');
    expect(fill).toHaveStyle({ width: '0%' });
  });
});

describe('Eyebrow', () => {
  it('renders monospace metadata', () => {
    render(<Eyebrow>Aujourd’hui</Eyebrow>);
    expect(screen.getByText('Aujourd’hui')).toHaveClass('font-mono');
  });
});

describe('Card', () => {
  it('only adds interactive affordances when asked', () => {
    const { rerender } = render(<Card>contenu</Card>);
    expect(screen.getByText('contenu').className).not.toMatch(
      /focus-visible/,
    );

    rerender(<Card interactive>contenu</Card>);
    expect(screen.getByText('contenu').className).toMatch(/focus-visible/);
  });
});

describe('ScreenShell', () => {
  it('reserves space for the tab bar only when there is one', () => {
    const { rerender } = render(<ScreenShell>écran</ScreenShell>);
    expect(screen.getByText('écran').className).toMatch(/pb-\[calc\(6rem/);

    rerender(<ScreenShell withNav={false}>écran</ScreenShell>);
    expect(screen.getByText('écran').className).not.toMatch(/pb-\[calc\(6rem/);
  });

  it('can opt out of the entrance animation', () => {
    render(<ScreenShell animate={false}>écran</ScreenShell>);
    expect(screen.getByText('écran').className).not.toMatch(/kFadeUp/);
  });
});

describe('cn', () => {
  it('lets a later class win over an earlier one in the same group', () => {
    // Without tailwind-merge both survive and stylesheet order decides, which
    // makes every className override on a primitive a coin toss.
    expect(cn('p-4', 'p-6')).toBe('p-6');
  });

  it('keeps unrelated classes', () => {
    expect(cn('p-4', 'text-fg')).toBe('p-4 text-fg');
  });
});
