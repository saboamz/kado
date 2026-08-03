import type { ReactNode } from 'react';
import { SCREEN_LABELS } from '../data/fixtures';
import type { ScreenId } from '../data/types';
import { useStore } from '../state/store';
import { FONT } from '../theme';

/** Neutral palette for the page around the device, independent of app theme. */
const PAGE = {
  fg: '#141416',
  fg2: '#5f5f68',
  fg3: '#8b8b93',
  line: 'rgba(0,0,0,.1)',
};

function segment(on: boolean) {
  return {
    padding: '7px 13px',
    borderRadius: 9,
    font: `600 11.5px/1 ${FONT.sans}`,
    transition: 'all .18s',
    ...(on
      ? { background: '#fff', color: PAGE.fg, boxShadow: '0 1px 3px rgba(0,0,0,.12)' }
      : { color: '#7a7a83' }),
  };
}

function Toggle({
  legend,
  options,
}: {
  legend: string;
  options: { label: string; on: boolean; set: () => void }[];
}) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <span
        style={{
          font: `400 9.5px/1 ${FONT.mono}`,
          color: PAGE.fg3,
          letterSpacing: '.1em',
          textTransform: 'uppercase',
          width: 52,
        }}
      >
        {legend}
      </span>
      <div
        role="group"
        aria-label={legend}
        style={{
          display: 'flex',
          gap: 3,
          padding: 3,
          background: 'rgba(0,0,0,.05)',
          borderRadius: 11,
        }}
      >
        {options.map((o) => (
          <button
            key={o.label}
            onClick={o.set}
            aria-pressed={o.on}
            style={segment(o.on)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The prototype's presentation shell: header, controls and screen index. */
export function Chrome({ children }: { children: ReactNode }) {
  const { state, dispatch } = useStore();
  const owner = state.role === 'owner';

  return (
    <div style={{ padding: '44px 48px 60px', maxWidth: 1720, margin: '0 auto' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 40,
          flexWrap: 'wrap',
          marginBottom: 34,
        }}
      >
        <div style={{ maxWidth: 560 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 11,
              marginBottom: 16,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 30,
                height: 30,
                borderRadius: 9,
                background: '#FF6A55',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontWeight: 800,
                fontSize: 15,
              }}
            >
              K
            </span>
            <span
              style={{
                font: `600 15px/1 ${FONT.sans}`,
                letterSpacing: '-.01em',
                color: PAGE.fg,
              }}
            >
              Kado
            </span>
            <span
              style={{
                font: `400 10px/1 ${FONT.mono}`,
                color: PAGE.fg3,
                letterSpacing: '.08em',
                textTransform: 'uppercase',
                padding: '4px 7px',
                border: `1px solid ${PAGE.line}`,
                borderRadius: 5,
              }}
            >
              iOS · v0.1
            </span>
          </div>
          <h1
            style={{
              font: `700 34px/1.12 ${FONT.sans}`,
              letterSpacing: '-.028em',
              color: PAGE.fg,
              margin: '0 0 12px',
              textWrap: 'pretty',
            }}
          >
            Des listes de souhaits que vos proches remplissent en secret.
          </h1>
          <p
            style={{
              font: `400 14.5px/1.6 ${FONT.sans}`,
              color: PAGE.fg2,
              margin: 0,
              textWrap: 'pretty',
            }}
          >
            Prototype cliquable — 12 écrans, deux points de vue (propriétaire /
            ami), mode sombre. Le propriétaire ne voit jamais qui réserve : la
            surprise est structurelle, pas une option.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Toggle
            legend="Rôle"
            options={[
              {
                label: 'Propriétaire',
                on: owner,
                set: () => dispatch({ type: 'setRole', role: 'owner' }),
              },
              {
                label: 'Ami',
                on: !owner,
                set: () => dispatch({ type: 'setRole', role: 'friend' }),
              },
            ]}
          />
          <Toggle
            legend="Thème"
            options={[
              {
                label: 'Clair',
                on: !state.dark,
                set: () => dispatch({ type: 'setDark', dark: false }),
              },
              {
                label: 'Sombre',
                on: state.dark,
                set: () => dispatch({ type: 'setDark', dark: true }),
              },
            ]}
          />
        </div>
      </header>

      <div
        style={{
          display: 'flex',
          gap: 40,
          alignItems: 'flex-start',
          flexWrap: 'wrap',
        }}
      >
        <nav
          aria-label="Écrans"
          style={{ width: 214, flex: 'none', position: 'sticky', top: 24 }}
        >
          <div
            style={{
              font: `400 9.5px/1 ${FONT.mono}`,
              color: PAGE.fg3,
              letterSpacing: '.1em',
              textTransform: 'uppercase',
              margin: '0 0 12px 2px',
            }}
          >
            Écrans
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {SCREEN_LABELS.map(([id, label], i) => {
              const on = state.screen === id;
              return (
                <button
                  key={id}
                  onClick={() =>
                    dispatch({ type: 'go', screen: id as ScreenId })
                  }
                  aria-current={on ? 'page' : undefined}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 9,
                    padding: '9px 11px',
                    borderRadius: 11,
                    textAlign: 'left',
                    font: `500 12.5px/1.2 ${FONT.sans}`,
                    transition: 'all .16s',
                    ...(on
                      ? { background: PAGE.fg, color: '#fff' }
                      : { color: '#4a4a52' }),
                  }}
                >
                  <span
                    style={{
                      font: `400 9.5px/1 ${FONT.mono}`,
                      opacity: 0.45,
                      width: 16,
                    }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          <div
            style={{
              marginTop: 22,
              padding: 14,
              border: `1px solid ${PAGE.line}`,
              borderRadius: 14,
              background: 'rgba(255,255,255,.6)',
            }}
          >
            <div
              style={{
                font: `500 11.5px/1.45 ${FONT.sans}`,
                color: PAGE.fg,
                marginBottom: 5,
              }}
            >
              Astuce
            </div>
            <div
              style={{
                font: `400 11.5px/1.5 ${FONT.sans}`,
                color: '#6b6b73',
                textWrap: 'pretty',
              }}
            >
              Ouvrez un cadeau, réservez-le, puis passez en rôle Propriétaire :
              rien n&rsquo;a changé de son côté.
            </div>
          </div>
        </nav>

        {children}
      </div>
    </div>
  );
}
