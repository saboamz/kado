import { PlaceholderArt } from '../components/Placeholder';
import { Pot } from '../components/Pot';
import { GIFTS, PRIO_LABEL, stars } from '../data/fixtures';
import { useIsOwner, useReservation, useStore } from '../state/store';
import { FONT, useTheme } from '../theme';

export function GiftDetail() {
  const { state, dispatch, flash } = useStore();
  const owner = useIsOwner();
  const theme = useTheme();
  const { t } = theme;

  // The pot screen always lands on a collaborative gift, even when the user
  // arrived from a feed entry that has no gift id of its own.
  const fallback = GIFTS.find((g) => g.pot) ?? GIFTS[0];
  const selected = GIFTS.find((g) => g.id === state.current) ?? GIFTS[0];
  const gift = state.screen === 'pot' && !selected.pot ? fallback : selected;

  const reservation = useReservation(gift.id);
  const showPot = !!gift.pot && !owner;

  const label = owner
    ? 'Modifier ce cadeau'
    : gift.pot
      ? `Participer avec ${state.contrib} €`
      : reservation === 'you'
        ? 'Annuler ma réservation'
        : reservation
          ? 'Déjà réservé par un proche'
          : 'Réserver ce cadeau';

  const taken = !!reservation && reservation !== 'you' && !gift.pot;

  function act() {
    if (owner) return flash('Édition — le propriétaire ne voit aucune réservation');
    if (gift.pot) {
      dispatch({ type: 'contribute', amount: state.contrib });
      return flash(`+${state.contrib} € — merci, votre participation est anonyme`);
    }
    if (reservation === 'you') {
      dispatch({ type: 'unreserve', id: gift.id });
      return flash('Réservation annulée');
    }
    if (reservation) return flash("Un autre proche l'a déjà réservé");
    dispatch({ type: 'reserve', id: gift.id });
    flash('Réservé — Sophie ne verra rien');
  }

  return (
    <>
      <div style={{ padding: '0 0 132px', animation: 'kFadeUp .35s both' }}>
        <div style={{ position: 'relative', height: 330 }}>
          <PlaceholderArt
            label={gift.art}
            fill={t.surface}
            hatch={6}
            style={{ position: 'absolute', inset: 0 }}
          />
          <button
            onClick={() => dispatch({ type: 'go', screen: 'list' })}
            aria-label="Retour à la liste"
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
        </div>

        <div style={{ padding: '22px 20px 0' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            <h2
              style={{
                flex: 1,
                font: `700 25px/1.16 ${FONT.sans}`,
                letterSpacing: '-.028em',
                color: t.fg,
                margin: 0,
                textWrap: 'pretty',
              }}
            >
              {gift.name}
            </h2>
            <span
              style={{
                font: `600 19px/1.2 ${FONT.mono}`,
                color: t.fg,
                whiteSpace: 'nowrap',
              }}
            >
              {gift.price}
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              marginTop: 12,
            }}
          >
            <span
              aria-label={`Priorité ${gift.prio} sur 3`}
              style={{
                font: `400 13px/1 ${FONT.sans}`,
                color: theme.accent,
                letterSpacing: '.12em',
              }}
            >
              {stars(gift.prio)}
            </span>
            <span style={{ font: `400 11.5px/1 ${FONT.sans}`, color: t.fg2 }}>
              {PRIO_LABEL[gift.prio]}
            </span>
            <span
              aria-hidden
              style={{
                width: 3,
                height: 3,
                borderRadius: '50%',
                background: t.fg3,
              }}
            />
            <span
              style={{
                font: `500 11.5px/1 ${FONT.sans}`,
                color: t.fg2,
                padding: '6px 10px',
                borderRadius: 8,
                background: t.surface,
              }}
            >
              {gift.cat}
            </span>
          </div>

          <p
            style={{
              font: `400 14.5px/1.6 ${FONT.sans}`,
              color: t.fg2,
              margin: '18px 0 0',
              textWrap: 'pretty',
            }}
          >
            {gift.desc}
          </p>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginTop: 20,
              padding: 14,
              borderRadius: 16,
              background: t.surface,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 34,
                height: 34,
                borderRadius: 11,
                background: t.bg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                font: `600 12px/1 ${FONT.mono}`,
                color: t.fg2,
              }}
            >
              ↗
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: `600 13px/1.2 ${FONT.sans}`, color: t.fg }}>
                {gift.merchant}
              </div>
              <div
                style={{
                  font: `400 11.5px/1.3 ${FONT.sans}`,
                  color: t.fg3,
                  marginTop: 2,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {gift.url}
              </div>
            </div>
          </div>

          {showPot && <Pot />}

          <div
            style={{
              display: 'flex',
              gap: 9,
              alignItems: 'flex-start',
              marginTop: 18,
              padding: '13px 14px',
              borderRadius: 15,
              background: t.surface,
            }}
          >
            <span
              style={{
                font: `500 11.5px/1.5 ${FONT.sans}`,
                color: t.fg2,
                textWrap: 'pretty',
              }}
            >
              {owner
                ? "Vue propriétaire : aucune information de réservation n'existe sur cet écran."
                : reservation
                  ? 'Sophie ne verra jamais cette réservation, ni votre nom.'
                  : 'Votre réservation restera invisible pour Sophie.'}
            </span>
          </div>
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '14px 20px 30px',
          background: t.glass,
          backdropFilter: 'blur(20px)',
          borderTop: `1px solid ${t.line}`,
          zIndex: 30,
        }}
      >
        <button
          onClick={act}
          disabled={taken}
          style={{
            width: '100%',
            height: 54,
            borderRadius: 17,
            font: `600 16px/1 ${FONT.sans}`,
            letterSpacing: '-.01em',
            transition: 'transform .18s',
            cursor: taken ? 'not-allowed' : 'pointer',
            ...(owner
              ? { background: t.surface, color: t.fg }
              : taken
                ? { background: t.surface, color: t.fg3 }
                : {
                    background: theme.accent,
                    color: '#fff',
                    boxShadow: `0 12px 26px -12px ${theme.accentGlow}`,
                  }),
          }}
        >
          {label}
        </button>
      </div>
    </>
  );
}
