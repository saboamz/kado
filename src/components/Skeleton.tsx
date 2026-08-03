import type { CSSProperties } from 'react';
import { useTheme } from '../theme';

/** Shimmering placeholder shown while the link is being analysed. */
export function Skeleton({ style }: { style?: CSSProperties }) {
  const { t } = useTheme();
  return (
    <div
      aria-hidden
      style={{
        background: `linear-gradient(90deg,${t.chip} 8%,${t.bg} 20%,${t.chip} 33%)`,
        backgroundSize: '260px 100%',
        animation: 'kShimmer 1.1s linear infinite',
        ...style,
      }}
    />
  );
}
