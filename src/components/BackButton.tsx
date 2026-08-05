import { Link } from 'react-router-dom';

/**
 * The circular glass back button that floats over a hero image.
 *
 * Wishlist.tsx and GiftDetail.tsx carried byte-for-byte identical copies of
 * this — same 36px circle, same glass background, same inline chevron path,
 * same strokeWidth. One component, two call sites.
 *
 * `top` was 62px to clear the fake iOS status bar. With no status bar it
 * follows the real safe-area inset instead.
 */
export function BackButton({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      aria-label={label}
      className="absolute top-[max(1rem,env(safe-area-inset-top))] left-4 flex h-9 w-9 items-center justify-center rounded-full bg-glass text-fg backdrop-blur-[14px] transition-colors hover:bg-chip focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path
          d="M9.5 3.5L5 8l4.5 4.5"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Link>
  );
}
