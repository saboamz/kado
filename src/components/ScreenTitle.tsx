import type { ReactNode } from 'react';
import { FONT, useTheme } from '../theme';

/** The large screen heading shared by Home, Search, Notifications, Settings. */
export function ScreenTitle({
  children,
  trailing,
  margin = '0 0 20px',
}: {
  children: ReactNode;
  trailing?: ReactNode;
  margin?: string;
}) {
  const { t } = useTheme();
  const heading = (
    <h2
      style={{
        font: `700 30px/1.1 ${FONT.sans}`,
        letterSpacing: '-.03em',
        color: t.fg,
        margin: 0,
      }}
    >
      {children}
    </h2>
  );

  if (!trailing) return <div style={{ margin }}>{heading}</div>;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        margin,
      }}
    >
      {heading}
      {trailing}
    </div>
  );
}
