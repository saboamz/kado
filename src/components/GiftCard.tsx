import { PlaceholderArt } from './Placeholder';
import type { Gift } from '../data/types';
import { stars } from '../data/fixtures';
import { useReservation, useStore } from '../state/store';
import { FONT, useTheme } from '../theme';

/**
 * A gift in a wishlist.
 *
 * The reservation flag comes from useReservation, which returns null for the
 * owner. That is the whole enforcement: there is no `owner &&` guard here to
 * forget, because an owner is never given a value to render.
 */
export function GiftCard({ gift, grid }: { gift: Gift; grid: boolean }) {
  const { dispatch } = useStore();
  const reservation = useReservation(gift.id);
  const theme = useTheme();
  const { t } = theme;

  const flag = gift.pot
    ? 'Cagnotte'
    : reservation === 'you'
      ? 'Réservé par vous'
      : reservation
        ? 'Déjà réservé'
        : null;

  return (
    <button
      onClick={() => dispatch({ type: 'openGift', id: gift.id, pot: gift.pot })}
      style={{
        textAlign: 'left',
        borderRadius: 22,
        background: t.surface,
        overflow: 'hidden',
        transition: 'transform .2s',
        ...(grid ? {} : { display: 'flex', alignItems: 'center', gap: 0 }),
      }}
    >
      <div
        style={{
          position: 'relative',
          ...(grid
            ? { width: '100%', aspectRatio: '1' }
            : { width: 96, height: 96, flex: 'none' }),
        }}
      >
        <PlaceholderArt
          label={gift.art}
          hatch={5}
          style={{ width: '100%', height: '100%' }}
        />
        {flag && (
          <span
            style={{
              position: 'absolute',
              left: 8,
              top: 8,
              font: `500 10px/1 ${FONT.sans}`,
              padding: '6px 8px',
              borderRadius: 8,
              backdropFilter: 'blur(10px)',
              ...(gift.pot
                ? { background: theme.accent, color: '#fff' }
                : {
                    background: theme.dark
                      ? 'rgba(16,16,19,.8)'
                      : 'rgba(255,255,255,.9)',
                    color: t.fg2,
                  }),
            }}
          >
            {flag}
          </span>
        )}
      </div>

      <div
        style={{
          padding: grid ? '12px 13px 14px' : '0 14px',
          flex: 1,
          minWidth: 0,
        }}
      >
        <div
          style={{
            font: `600 13.5px/1.3 ${FONT.sans}`,
            color: t.fg,
            textWrap: 'pretty',
          }}
        >
          {gift.name}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            marginTop: 5,
          }}
        >
          <span style={{ font: `500 12.5px/1 ${FONT.mono}`, color: t.fg }}>
            {gift.price}
          </span>
          <span
            aria-label={`Priorité ${gift.prio} sur 3`}
            style={{
              font: `400 11px/1 ${FONT.sans}`,
              color: theme.accent,
              letterSpacing: '.1em',
            }}
          >
            {stars(gift.prio)}
          </span>
        </div>
        {reservation && (
          <div
            style={{
              font: `400 10.5px/1.3 ${FONT.mono}`,
              color: t.fg3,
              marginTop: 7,
            }}
          >
            Le propriétaire ne le voit pas
          </div>
        )}
      </div>
    </button>
  );
}
