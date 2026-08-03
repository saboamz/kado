import type { ReactNode } from 'react';
import { DEVICE, themeVars, useTheme } from '../theme';

/** The titanium iPhone shell the prototype renders every screen inside. */
export function PhoneFrame({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <div
      style={{
        width: DEVICE.width + 24,
        height: DEVICE.height + 24,
        borderRadius: 60,
        padding: 12,
        background: 'linear-gradient(150deg,#3a3a40,#0e0e11 40%,#25252a)',
        boxShadow:
          '0 40px 90px -30px rgba(0,0,0,.5), 0 0 0 1px rgba(0,0,0,.4)',
        flex: 'none',
      }}
    >
      <div
        style={{
          ...themeVars(theme),
          position: 'relative',
          width: DEVICE.width,
          height: DEVICE.height,
          borderRadius: DEVICE.radius,
          overflow: 'hidden',
          background: theme.t.bg,
          transition: 'background .35s',
        }}
      >
        {children}
      </div>
    </div>
  );
}
