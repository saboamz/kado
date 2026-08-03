import type { ReactNode } from 'react';
import { FONT, useTheme } from '../theme';

/**
 * Full-screen message with artwork, title, body and one action. The empty and
 * error screens are the same layout with different content.
 */
export function CenteredState({
  art,
  title,
  body,
  action,
  footnote,
}: {
  art: ReactNode;
  title: string;
  body: string;
  action: ReactNode;
  footnote?: string;
}) {
  const { t } = useTheme();
  return (
    <div
      style={{
        minHeight: 852,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 34px',
        textAlign: 'center',
        animation: 'kFadeUp .4s both',
      }}
    >
      {art}
      <h3
        style={{
          font: `700 21px/1.25 ${FONT.sans}`,
          letterSpacing: '-.02em',
          color: t.fg,
          margin: '0 0 9px',
        }}
      >
        {title}
      </h3>
      <p
        style={{
          font: `400 14px/1.55 ${FONT.sans}`,
          color: t.fg2,
          margin: '0 0 24px',
          maxWidth: 250,
          textWrap: 'pretty',
        }}
      >
        {body}
      </p>
      {action}
      {footnote && (
        <div
          style={{
            font: `400 10.5px/1 ${FONT.mono}`,
            color: t.fg3,
            marginTop: 18,
          }}
        >
          {footnote}
        </div>
      )}
    </div>
  );
}
