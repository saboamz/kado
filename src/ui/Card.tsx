import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from './cn';

/**
 * Surface container: feed rows, gift tiles, merchant links, settings groups.
 *
 * `interactive` is deliberately separate from the element type. A card that
 * navigates should be a real <button> or <a> so it is keyboard-reachable; this
 * only supplies the hover/focus affordance. Profile.tsx already carries a
 * comment explaining why its card and heart are siblings rather than nested
 * buttons — that instinct is right and this component must not undo it.
 */
const card = cva('transition-colors duration-150', {
  variants: {
    tone: {
      surface: 'bg-surface',
      /** Sits on top of an image or hatch; blurs what is behind it. */
      glass: 'bg-glass backdrop-blur-[14px]',
      outline: 'border border-line bg-transparent',
      /** Accent wash, for callouts like the privacy note in Settings. */
      soft: 'bg-accent-soft',
    },
    pad: { none: '', sm: 'p-3', md: 'p-4', lg: 'p-5' },
    radius: { md: 'rounded-xl', lg: 'rounded-2xl', xl: 'rounded-3xl' },
    interactive: {
      true: 'hover:bg-chip focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[.99]',
      false: '',
    },
  },
  defaultVariants: {
    tone: 'surface',
    pad: 'md',
    radius: 'lg',
    interactive: false,
  },
});

export type CardProps = HTMLAttributes<HTMLElement> &
  VariantProps<typeof card> & {
    /**
     * Render as a different element. A card that navigates should wrap or be a
     * real <button>/<a> rather than becoming one here, so that it stays
     * keyboard-reachable with the right role.
     */
    as?: 'div' | 'li' | 'article' | 'section';
  };

export function Card({
  className,
  tone,
  pad,
  radius,
  interactive,
  as: Tag = 'div',
  ...props
}: CardProps) {
  return (
    <Tag
      className={cn(card({ tone, pad, radius, interactive }), className)}
      {...props}
    />
  );
}
