import type { ReactNode } from 'react';
import { cn } from './cn';

/**
 * The scroll container every screen sits in.
 *
 * The prototype expressed this concept eight slightly different ways: the
 * literal `padding: '66px 20px 120px'` is copy-pasted verbatim into five
 * screens, with Profile at `'66px 0 120px'`, GiftDetail at `'0 0 132px'`,
 * Wishlist at `'0 0 120px'` and Onboarding at `'78px 26px 40px'` — each
 * alongside its own `animation: 'kFadeUp .4s both'`.
 *
 * Those numbers were calibrated against a fixed 393x852 device. Here they
 * become responsive: a centred column that grows to a readable measure on
 * desktop instead of a phone-width strip, with safe-area insets so the bottom
 * nav does not sit under the iOS home indicator.
 */
export function ScreenShell({
  children,
  className,
  /** Screens with a bleed hero (Wishlist, GiftDetail) start flush at the top. */
  flushTop = false,
  /** Screens without the bottom tab bar can reclaim its space. */
  withNav = true,
  /** Opt out of the entrance animation for screens that run their own. */
  animate = true,
}: {
  children: ReactNode;
  className?: string;
  flushTop?: boolean;
  withNav?: boolean;
  animate?: boolean;
}) {
  return (
    <div
      className={cn(
        'mx-auto w-full max-w-screen-sm',
        'px-5 sm:px-6',
        flushTop ? 'pt-0' : 'pt-[max(1rem,env(safe-area-inset-top))] sm:pt-8',
        withNav
          ? 'pb-[calc(6rem+env(safe-area-inset-bottom))]'
          : 'pb-[max(2rem,env(safe-area-inset-bottom))]',
        // motion-reduce is belt-and-braces: global.css already neutralises
        // animation duration under prefers-reduced-motion.
        animate && 'animate-[kFadeUp_.4s_both] motion-reduce:animate-none',
        className,
      )}
    >
      {children}
    </div>
  );
}
