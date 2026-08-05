import type { ReactNode } from 'react';
import { cn } from '../ui';

/**
 * The large screen heading.
 *
 * Five screens used this; four more hand-rolled their own <h2> at 25px, 28px,
 * 30px and 18px. Those are now `size`, so the family is one component again.
 *
 * `margin` was a raw CSS string prop; it is a className now, which is both
 * mergeable and responsive.
 */
export function ScreenTitle({
  children,
  trailing,
  size = 'lg',
  className,
}: {
  children: ReactNode;
  trailing?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const heading = (
    <h2
      className={cn(
        'leading-none font-bold tracking-tighter text-fg',
        size === 'sm' && 'text-xl',
        size === 'md' && 'text-3xl',
        size === 'lg' && 'text-4xl sm:text-5xl',
      )}
    >
      {children}
    </h2>
  );

  return (
    <div
      className={cn(
        'mb-5',
        trailing && 'flex items-center justify-between gap-3',
        className,
      )}
    >
      {heading}
      {trailing}
    </div>
  );
}
