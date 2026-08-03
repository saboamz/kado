import { PlaceholderArt } from '../components/Placeholder';
import { ScreenTitle } from '../components/ScreenTitle';
import { BIRTHDAYS, FEED } from '../data/social';
import { useStore } from '../state/store';
import { eyebrow, FONT, useTheme } from '../theme';

export function Home() {
  const { dispatch } = useStore();
  const theme = useTheme();
  const { t } = theme;

  return (
    <div style={{ padding: '66px 20px 120px', animation: 'kFadeUp .4s both' }}>
      <ScreenTitle
        margin="0 0 22px"
        trailing={
          <PlaceholderArt style={{ width: 38, height: 38, borderRadius: '50%' }} />
        }
      >
        Aujourd&rsquo;hui
      </ScreenTitle>

      <section
        aria-label="Anniversaires à venir"
        style={{
          display: 'flex',
          gap: 10,
          overflowX: 'auto',
          padding: '0 20px 4px',
          margin: '0 -20px 24px',
        }}
      >
        {BIRTHDAYS.map((b) => (
          <button
            key={b.name}
            onClick={() => dispatch({ type: 'go', screen: 'profile' })}
            style={{
              flex: 'none',
              width: 112,
              padding: 12,
              borderRadius: 20,
              background: t.surface,
              textAlign: 'left',
              transition: 'transform .2s',
            }}
          >
            <PlaceholderArt
              style={{
                width: '100%',
                aspectRatio: '1',
                borderRadius: 14,
                marginBottom: 9,
              }}
            />
            <div style={{ font: `600 13px/1.2 ${FONT.sans}`, color: t.fg }}>
              {b.name}
            </div>
            <div
              style={{
                font: `400 11px/1.3 ${FONT.mono}`,
                color: b.hot ? theme.accent : t.fg3,
                marginTop: 3,
              }}
            >
              {b.when}
            </div>
          </button>
        ))}
      </section>

      <div style={{ ...eyebrow(theme), margin: '0 0 12px 2px' }}>Activité</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {FEED.map((f) => {
          const isPot = f.tag === 'Cagnotte';
          return (
            <button
              key={f.text}
              onClick={() => dispatch({ type: 'go', screen: f.to })}
              style={{
                textAlign: 'left',
                padding: 14,
                borderRadius: 20,
                background: t.surface,
                transition: 'transform .2s',
              }}
            >
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <PlaceholderArt
                  style={{
                    width: 42,
                    height: 42,
                    flex: 'none',
                    borderRadius: 13,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      font: `400 14px/1.42 ${FONT.sans}`,
                      color: t.fg,
                      textWrap: 'pretty',
                    }}
                  >
                    {f.text}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 7,
                      marginTop: 6,
                    }}
                  >
                    <span
                      style={{ font: `400 10.5px/1 ${FONT.mono}`, color: t.fg3 }}
                    >
                      {f.time}
                    </span>
                    <span
                      style={{
                        font: `500 10px/1 ${FONT.sans}`,
                        color: isPot ? theme.accent : t.fg2,
                        padding: '5px 8px',
                        borderRadius: 7,
                        background: isPot ? theme.accentSoft : t.chip,
                      }}
                    >
                      {f.tag}
                    </span>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div
        style={{
          marginTop: 14,
          padding: '16px 18px',
          borderRadius: 20,
          border: `1px dashed ${t.line2}`,
          display: 'flex',
          gap: 12,
          alignItems: 'center',
        }}
      >
        <div
          aria-hidden
          style={{
            width: 30,
            height: 30,
            borderRadius: 10,
            background: theme.accentSoft,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: theme.accent,
            font: `700 15px/1 ${FONT.sans}`,
          }}
        >
          !
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ font: `600 13px/1.3 ${FONT.sans}`, color: t.fg }}>
            Votre liste Noël est vide
          </div>
          <div
            style={{
              font: `400 12px/1.4 ${FONT.sans}`,
              color: t.fg2,
              marginTop: 2,
            }}
          >
            Ajoutez 3 idées pour vos proches.
          </div>
        </div>
      </div>
    </div>
  );
}
