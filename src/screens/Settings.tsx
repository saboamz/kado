import { ScreenTitle } from '../components/ScreenTitle';
import { settingsGroups } from '../data/settings';
import { useStore } from '../state/store';
import { eyebrow, FONT, useTheme } from '../theme';

export function Settings() {
  const { state } = useStore();
  const theme = useTheme();
  const { t } = theme;

  return (
    <div style={{ padding: '66px 20px 120px', animation: 'kFadeUp .4s both' }}>
      <ScreenTitle margin="0 0 22px">Paramètres</ScreenTitle>

      {settingsGroups(state.dark).map((group) => (
        <section key={group.title} style={{ marginBottom: 24 }}>
          <h3 style={{ ...eyebrow(theme), margin: '0 0 10px 2px' }}>
            {group.title}
          </h3>
          <div
            style={{
              borderRadius: 18,
              background: t.surface,
              overflow: 'hidden',
            }}
          >
            {group.rows.map((row, i) => (
              <div
                key={row.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '14px 16px',
                  borderTop: i ? `1px solid ${t.line}` : undefined,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div
                    style={{ font: `500 14px/1.25 ${FONT.sans}`, color: t.fg }}
                  >
                    {row.label}
                  </div>
                  {row.sub && (
                    <div
                      style={{
                        font: `400 11.5px/1.35 ${FONT.sans}`,
                        color: t.fg3,
                        marginTop: 3,
                      }}
                    >
                      {row.sub}
                    </div>
                  )}
                </div>
                <span
                  style={{
                    font: `400 12.5px/1 ${FONT.mono}`,
                    color: t.fg2,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </section>
      ))}

      <div
        style={{
          padding: '16px 18px',
          borderRadius: 18,
          background: theme.accentSoft,
        }}
      >
        <div
          style={{
            font: `600 13px/1.3 ${FONT.sans}`,
            color: t.fg,
            marginBottom: 4,
          }}
        >
          Le secret est garanti côté serveur
        </div>
        <div
          style={{
            font: `400 12px/1.5 ${FONT.sans}`,
            color: t.fg2,
            textWrap: 'pretty',
          }}
        >
          Les réservations et les cagnottes ne sont jamais renvoyées dans l&rsquo;API
          du propriétaire, même chiffrées.
        </div>
      </div>
    </div>
  );
}
