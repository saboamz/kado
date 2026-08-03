import { euros, POT_TOTAL } from '../data/fixtures';
import { useStore } from '../state/store';
import { chip, FONT, stripes, useTheme } from '../theme';

const AMOUNTS = [20, 50, 100, 200];

/**
 * Collaborative gift pot.
 *
 * Contributions are anonymous by the same rule as reservations: the pot shows
 * a total and an avatar count, never who gave what. This component is only
 * ever rendered for friends.
 */
export function Pot() {
  const { state, dispatch } = useStore();
  const theme = useTheme();
  const { t } = theme;
  const pct = Math.min(100, Math.round((state.pot / POT_TOTAL) * 100));
  const remaining = POT_TOTAL - state.pot;

  return (
    <section
      aria-label="Cagnotte"
      style={{
        marginTop: 18,
        padding: 18,
        borderRadius: 20,
        border: `1px solid ${t.line}`,
        background: t.bg,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <span
          style={{
            font: `700 21px/1 ${FONT.sans}`,
            color: t.fg,
            letterSpacing: '-.02em',
          }}
        >
          {euros(state.pot)} récoltés
        </span>
        <span style={{ font: `400 12px/1 ${FONT.mono}`, color: t.fg2 }}>
          sur {euros(POT_TOTAL)}
        </span>
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={POT_TOTAL}
        aria-valuenow={state.pot}
        aria-label={`Cagnotte à ${pct} %`}
        style={{
          height: 8,
          borderRadius: 5,
          background: t.chip,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            borderRadius: 5,
            background: theme.accent,
            transition: 'width .7s cubic-bezier(.2,.8,.2,1)',
          }}
        />
      </div>

      <div
        style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 14 }}
      >
        <div style={{ display: 'flex' }} aria-hidden>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: stripes(theme, t.chip, 3),
                border: `2px solid ${t.bg}`,
                marginLeft: i ? -8 : 0,
              }}
            />
          ))}
        </div>
        <span style={{ font: `400 12px/1.3 ${FONT.sans}`, color: t.fg2 }}>
          {/* Count only. Naming contributors would defeat the anonymity. */}
          {Object.keys(state.reserved).length + 2} amis participent · il reste{' '}
          {euros(remaining)}
        </span>
      </div>

      <div
        role="group"
        aria-label="Montant de la participation"
        style={{ display: 'flex', gap: 7, marginTop: 16 }}
      >
        {AMOUNTS.map((v) => (
          <button
            key={v}
            onClick={() => dispatch({ type: 'setContrib', amount: v })}
            aria-pressed={state.contrib === v}
            style={chip(theme, state.contrib === v)}
          >
            {euros(v)}
          </button>
        ))}
      </div>
    </section>
  );
}
