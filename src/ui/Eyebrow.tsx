import type { ReactNode } from 'react';
import { cn } from './cn';

/**
 * Small uppercase monospace section label.
 *
 * Replaces `eyebrow()` from src/theme/styles.ts, which was used correctly in
 * five screens and inlined by hand in three more (Chrome twice at identical
 * values, Wishlist at a 10px variant).
 *
 * The app's implicit convention, worth keeping: sans for content, mono for
 * metadata — timestamps, prices, counts, eyebrows, error codes.
 */
export function Eyebrow({
  children,
  className,
  as: Tag = 'p',
}: {
  children: ReactNode;
  className?: string;
  as?: 'p' | 'h2' | 'h3' | 'span' | 'div';
}) {
  return (
    <Tag
      className={cn(
        'font-mono text-[0.59375rem] leading-none tracking-eyebrow text-fg3 uppercase',
        className,
      )}
    >
      {children}
    </Tag>
  );
}
