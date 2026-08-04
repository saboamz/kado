import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from './cn';

/**
 * Pill used for filters, list selection and contribution amounts.
 *
 * Replaces `chip(theme, on)` from src/theme/styles.ts. The helper handled the
 * interactive case; static badges were re-rolled at each call site with four
 * different radii (7, 8, 9, 10) for the same visual idea, so `tone` collapses
 * those too.
 *
 * Selected state is carried by `aria-pressed`, not only by colour — a filter
 * row that communicates its state through background alone is invisible to a
 * screen reader.
 */
const chip = cva(
  [
    'inline-flex items-center gap-1.5 font-sans font-medium',
    'transition-colors duration-150',
    'focus-visible:outline-2 focus-visible:outline-offset-2',
    'focus-visible:outline-accent',
    'disabled:pointer-events-none disabled:opacity-40',
  ],
  {
    variants: {
      tone: {
        /** Unselected filter or list chip. */
        neutral: 'bg-surface text-fg2 hover:bg-chip hover:text-fg',
        /** Selected. */
        accent: 'bg-accent text-on-accent',
        /** Static label — a category or a tag, not a control. */
        soft: 'bg-accent-soft text-accent',
        outline: 'border border-line2 text-fg2',
      },
      size: {
        sm: 'h-6 rounded-md px-2 text-xs',
        md: 'h-8 rounded-md px-3 text-sm',
      },
    },
    defaultVariants: { tone: 'neutral', size: 'md' },
  },
);

export type ChipProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof chip> & {
    /** When set, the chip is a toggle and reports its state assistively. */
    selected?: boolean;
  };

export function Chip({
  className,
  tone,
  size,
  selected,
  type = 'button',
  ...props
}: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={cn(
        chip({ tone: selected ? 'accent' : tone, size }),
        className,
      )}
      {...props}
    />
  );
}

/** The same pill as a non-interactive label. */
export function Tag({
  className,
  tone = 'soft',
  size,
  children,
}: VariantProps<typeof chip> & {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <span className={cn(chip({ tone, size }), 'cursor-default', className)}>
      {children}
    </span>
  );
}
