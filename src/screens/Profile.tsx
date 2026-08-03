import { PlaceholderArt } from '../components/Placeholder';
import {
  COLLECTIONS,
  INTERESTS,
  PROFILE_BIO,
  PROFILE_STATS,
} from '../data/social';
import { useIsOwner, useStore } from '../state/store';
import { eyebrow, FONT, useTheme } from '../theme';

export function Profile() {
  const { state, dispatch, flash } = useStore();
  const owner = useIsOwner();
  const theme = useTheme();
  const { t } = theme;

  return (
    <div style={{ padding: '66px 0 120px', animation: 'kFadeUp .4s both' }}>
      <div style={{ padding: '0 20px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            marginBottom: 16,
          }}
        >
          <PlaceholderArt
            label="PHOTO"
            fill={t.surface}
            hatch={5}
            style={{
              width: 88,
              height: 88,
              flex: 'none',
              borderRadius: '50%',
            }}
          />
          <dl
            style={{
              flex: 1,
              display: 'flex',
              justifyContent: 'space-around',
              margin: 0,
            }}
          >
            {PROFILE_STATS.map((s) => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <dd
                  style={{
                    font: `700 19px/1 ${FONT.sans}`,
                    color: t.fg,
                    margin: 0,
                  }}
                >
                  {s.value}
                </dd>
                <dt
                  style={{
                    font: `400 11px/1 ${FONT.sans}`,
                    color: t.fg2,
                    marginTop: 5,
                  }}
                >
                  {s.label}
                </dt>
              </div>
            ))}
          </dl>
        </div>

        <h2
          style={{
            font: `700 18px/1.2 ${FONT.sans}`,
            letterSpacing: '-.02em',
            color: t.fg,
            margin: 0,
          }}
        >
          {owner ? 'Sophie (vous)' : 'Sophie Marchand'}
        </h2>
        <p
          style={{
            font: `400 13.5px/1.5 ${FONT.sans}`,
            color: t.fg2,
            margin: '5px 0 0',
            textWrap: 'pretty',
          }}
        >
          {PROFILE_BIO}
        </p>

        <ul
          style={{
            display: 'flex',
            gap: 6,
            marginTop: 11,
            flexWrap: 'wrap',
            listStyle: 'none',
            padding: 0,
          }}
        >
          {INTERESTS.map((label) => (
            <li
              key={label}
              style={{
                font: `500 11.5px/1 ${FONT.sans}`,
                color: t.fg2,
                padding: '7px 11px',
                borderRadius: 9,
                background: t.surface,
              }}
            >
              {label}
            </li>
          ))}
        </ul>

        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button
            onClick={() =>
              flash(owner ? 'Édition du profil' : 'Vous suivez Sophie')
            }
            style={{
              flex: 1,
              height: 44,
              borderRadius: 14,
              background: theme.accent,
              color: '#fff',
              font: `600 14.5px/1 ${FONT.sans}`,
              transition: 'transform .18s',
            }}
          >
            {owner ? 'Modifier mon profil' : 'Suivre'}
          </button>
          <button
            onClick={() => flash('Lien de partage copié')}
            aria-label="Partager le profil"
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              background: t.surface,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: t.fg,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M8 10.5V2m0 0L4.8 5.2M8 2l3.2 3.2"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M2.5 9.5v3a1.5 1.5 0 001.5 1.5h8a1.5 1.5 0 001.5-1.5v-3"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '26px 20px 12px',
        }}
      >
        <span style={eyebrow(theme)}>Collections</span>
        <span style={{ font: `400 11.5px/1 ${FONT.sans}`, color: t.fg2 }}>
          Tout voir
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
          padding: '0 20px',
        }}
      >
        {COLLECTIONS.map((c) => (
          /*
            Card and heart are siblings, not nested buttons: a button inside a
            button is invalid markup and browsers disagree on how to focus it.
            The heart is positioned against the cover wrapper so it stays put
            regardless of how tall the caption below runs.
          */
          <div key={c.id}>
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => dispatch({ type: 'go', screen: c.to })}
                aria-label={`Ouvrir la collection ${c.name}`}
                style={{ display: 'block', width: '100%' }}
              >
                <PlaceholderArt
                  label="COUVERTURE"
                  hatch={5}
                  style={{
                    width: '100%',
                    aspectRatio: '1.05',
                    borderRadius: 16,
                    overflow: 'hidden',
                    transition: 'transform .2s',
                  }}
                />
              </button>
              <button
                aria-label={`Aimer ${c.name}`}
                aria-pressed={!!state.liked[c.id]}
                onClick={() => dispatch({ type: 'toggleLike', id: c.id })}
                style={{
                  position: 'absolute',
                  right: 8,
                  bottom: 8,
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  background: t.glass,
                  backdropFilter: 'blur(10px)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  lineHeight: 1,
                  color: state.liked[c.id] ? theme.accent : t.fg3,
                  animation: state.liked[c.id] ? 'kBeat .4s' : undefined,
                }}
              >
                ♥
              </button>
            </div>
            <button
              onClick={() => dispatch({ type: 'go', screen: c.to })}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '10px 4px 2px',
              }}
            >
              <div style={{ font: `600 13.5px/1.2 ${FONT.sans}`, color: t.fg }}>
                {c.name}
              </div>
              <div
                style={{
                  font: `400 11.5px/1 ${FONT.mono}`,
                  color: t.fg3,
                  marginTop: 4,
                }}
              >
                {c.count}
              </div>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
