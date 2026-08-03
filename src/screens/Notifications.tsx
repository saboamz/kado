import { PlaceholderArt } from '../components/Placeholder';
import { ScreenTitle } from '../components/ScreenTitle';
import { NOTIFICATIONS } from '../data/social';
import { FONT, useTheme } from '../theme';

export function Notifications() {
  const theme = useTheme();
  const { t } = theme;

  return (
    <div style={{ padding: '66px 20px 120px', animation: 'kFadeUp .4s both' }}>
      <ScreenTitle>Notifications</ScreenTitle>
      <ul
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
          listStyle: 'none',
          margin: 0,
          padding: 0,
        }}
      >
        {NOTIFICATIONS.map((n) => (
          <li
            key={`${n.who}-${n.time}`}
            style={{
              display: 'flex',
              gap: 11,
              alignItems: 'flex-start',
              padding: '13px 10px',
              borderRadius: 18,
              background: n.unread ? t.surface : 'transparent',
            }}
          >
            <span
              aria-label={n.unread ? 'Non lue' : undefined}
              style={{
                width: 9,
                height: 9,
                flex: 'none',
                borderRadius: '50%',
                background: n.unread
                  ? n.hot
                    ? theme.accent
                    : t.fg
                  : 'transparent',
                marginTop: 16,
              }}
            />
            <PlaceholderArt
              style={{ width: 40, height: 40, flex: 'none', borderRadius: 12 }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  font: `400 13.5px/1.45 ${FONT.sans}`,
                  color: t.fg,
                  textWrap: 'pretty',
                }}
              >
                <span style={{ fontWeight: 600 }}>{n.who}</span> {n.text}
              </div>
              <div
                style={{
                  font: `400 10.5px/1 ${FONT.mono}`,
                  color: t.fg3,
                  marginTop: 6,
                }}
              >
                {n.time}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
