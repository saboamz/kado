import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

/**
 * The primary call to action, and the four other button shapes the app needs.
 *
 * `primaryButton()` in src/theme/styles.ts already existed for this, but it had
 * exactly one consumer while five screens reimplemented it inline — GiftDetail,
 * AddWish, Profile, EmptyState and ErrorState — drifting to four heights
 * (44/48/52/54), three radii and three shadow specs for what is visually one
 * button family. The sizes below are that set collapsed onto the scale.
 *
 * What the inline versions could not do, and this can:
 *   - `:focus-visible` — a keyboard ring. The prototype has none, anywhere.
 *   - `:disabled` — GiftDetail's taken-gift button sets `cursor: not-allowed`
 *     and nothing else, so a disabled button looks identical to a live one.
 *   - `:active` / `:hover` — the inline `transition: transform .18s` never
 *     fired, because no state ever changed the transform.
 */
const button = cva(
  [
    'inline-flex items-center justify-center gap-2',
    'font-sans font-semibold tracking-tight whitespace-nowrap',
    'transition-[transform,background-color,opacity] duration-150',
    'focus-visible:outline-2 focus-visible:outline-offset-2',
    'focus-visible:outline-accent',
    'active:scale-[.98]',
    // Disabled must read as disabled, not merely refuse to click.
    'disabled:pointer-events-none disabled:opacity-40',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-accent text-on-accent shadow-[0_10px_24px_-10px_var(--color-accent-glow)]',
        secondary: 'bg-surface text-fg hover:bg-chip',
        outline: 'border border-line2 text-fg hover:bg-surface',
        ghost: 'text-fg2 hover:bg-surface hover:text-fg',
        danger: 'bg-red-600 text-white hover:bg-red-700',
      },
      size: {
        sm: 'h-9 rounded-lg px-3 text-sm',
        md: 'h-11 rounded-xl px-4 text-base',
        lg: 'h-[3.25rem] rounded-2xl px-5 text-lg',
      },
      block: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'primary', size: 'md', block: false },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof button> & { children?: ReactNode };

export function Button({
  className,
  variant,
  size,
  block,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      // Buttons inside a form default to submit; almost none of ours want that.
      type={type}
      className={cn(button({ variant, size, block }), className)}
      {...props}
    />
  );
}
