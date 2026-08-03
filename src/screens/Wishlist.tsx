import { GiftCard } from '../components/GiftCard';
import { PlaceholderArt } from '../components/Placeholder';
import { GIFTS } from '../data/fixtures';
import { useIsOwner, useStore } from '../state/store';
import { FONT, useTheme } from '../theme';

export function Wishlist() {
  const { state, dispatch } = useStore();
  const owner = useIsOwner();
  const theme = useTheme();
  const { t } = theme;
  const grid = state.layout === 'grid';

  return (
    <div style={{ padding: '0 0 120px', animation: 'kFadeUp .4s both' }}>
      <div style={{ position: 'relative', height: 230 }}>
        <PlaceholderArt
          fill={t.surface}
          hatch={6}
          style={{ position: 'absolute', inset: 0 }}
        />
        <button
          onClick={() => dispatch({ type: 'go', screen: 'profile' })}
          aria-label="Retour au profil"
          style={{
            position: 'absolute',
            top: 62,
            left: 16,
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: t.glass,
            backdropFilter: 'blur(14px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: t.fg,
          }}
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M9.5 3.5L5 8l4.5 4.5"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <div style={{ position: 'absolute', left: 20, bottom: 20 }}>
          <div
            style={{
              font: `400 10px/1 ${FONT.mono}`,
              color: t.fg2,
              letterSpacing: '.1em',
              textTransform: 'uppercase',
              marginBottom: 8,
            }}
          >
            Liste de {owner ? 'Sophie (vous)' : 'Sophie Marchand'}
          </div>
          <h2
            style={{
              font: `700 28px/1.1 ${FONT.sans}`,
              letterSpacing: '-.03em',
              color: t.fg,
              margin: 0,
            }}
          >
            Anniversaire
          </h2>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '16px 20px 14px',
        }}
      >
        <span style={{ font: `400 12px/1 ${FONT.mono}`, color: t.fg2 }}>
          {/*
            The owner is told how many wishes exist, never how many are taken.
            A "2 réservées" counter would leak the very thing this app hides.
          */}
          {owner
            ? `${GIFTS.length} envies`
            : `${GIFTS.length} envies · ${
                Object.keys(state.reserved).length
              } réservées`}
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => dispatch({ type: 'toggleLayout' })}
          style={{
            font: `500 11.5px/1 ${FONT.sans}`,
            color: theme.accent,
            padding: '7px 11px',
            borderRadius: 9,
            background: theme.accentSoft,
          }}
        >
          {grid ? 'Vue liste' : 'Vue grille'}
        </button>
      </div>

      <div
        style={{
          padding: '0 20px',
          ...(grid
            ? { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }
            : { display: 'flex', flexDirection: 'column', gap: 10 }),
        }}
      >
        {GIFTS.map((g) => (
          <GiftCard key={g.id} gift={g} grid={grid} />
        ))}
      </div>
    </div>
  );
}
