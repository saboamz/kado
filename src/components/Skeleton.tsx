import type { CSSProperties } from 'react';

/**
 * Shimmering placeholder shown while the link is being analysed.
 *
 * First component converted to Tailwind. It reads its colours from the CSS
 * custom properties in src/styles/tokens.css rather than from useTheme(), so
 * it re-themes without a React render — and, unlike the inline-styled version,
 * it no longer needs to be inside a ThemeProvider at all.
 *
 * `style` remains for values Tailwind cannot express because they are computed
 * at runtime (a percentage width from a map, say). Prefer `className`.
 */
export function Skeleton({
  className = '',
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      aria-hidden
      className={`animate-[kShimmer_1.1s_linear_infinite] bg-[linear-gradient(90deg,var(--color-chip)_8%,var(--color-bg)_20%,var(--color-chip)_33%)] bg-[length:260px_100%] ${className}`}
      style={style}
    />
  );
}
