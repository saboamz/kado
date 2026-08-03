import type { CSSProperties } from 'react';
import { FONT, stripes, useTheme } from '../theme';

/**
 * Stand-in artwork. The prototype ships no images: every photo slot is a
 * diagonal hatch with its label in monospace, so the layout reads as
 * "image goes here" without pretending to be final.
 */
export function PlaceholderArt({
  label,
  style,
  fill,
  hatch = 4,
}: {
  label?: string;
  style?: CSSProperties;
  fill?: string;
  hatch?: number;
}) {
  const theme = useTheme();
  return (
    <div
      aria-hidden
      style={{
        background: stripes(theme, fill ?? theme.t.chip, hatch),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        ...style,
      }}
    >
      {label && (
        <span
          style={{
            font: `500 8px/1.5 ${FONT.mono}`,
            letterSpacing: '.06em',
            color: theme.t.fg3,
          }}
        >
          {label}
        </span>
      )}
    </div>
  );
}
