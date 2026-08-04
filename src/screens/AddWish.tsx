import { useEffect, useRef } from 'react';
import { PlaceholderArt } from '../components/Placeholder';
import { ScreenTitle } from '../components/ScreenTitle';
import { Skeleton } from '../components/Skeleton';
import { ADD_LISTS, ADD_METHODS, ANALYZE_MS, SCRAPED } from '../data/add';
import { stars } from '../data/fixtures';
import { useStore } from '../state/store';
import { chip, eyebrow, FONT, useTheme } from '../theme';

export function AddWish() {
  const { state, dispatch, flash } = useStore();
  const theme = useTheme();
  const { t } = theme;
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // The analysis is a fake network call; make sure it can't fire after the
  // screen goes away, which would set state on an unmounted tree.
  useEffect(() => () => clearTimeout(timer.current), []);

  function analyze() {
    clearTimeout(timer.current);
    dispatch({ type: 'setAddStep', step: 1 });
    timer.current = setTimeout(
      () => dispatch({ type: 'setAddStep', step: 2 }),
      ANALYZE_MS,
    );
  }

  const loading = state.addStep === 1;

  return (
    <div style={{ padding: '66px 20px 120px', animation: 'kFadeUp .4s both' }}>
      <ScreenTitle
        margin="0 0 22px"
        trailing={
          <button
            onClick={() => dispatch({ type: 'go', screen: 'home' })}
            aria-label="Fermer"
            style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              background: t.surface,
              color: t.fg2,
              font: `400 16px/1 ${FONT.sans}`,
            }}
          >
            ×
          </button>
        }
      >
        Ajouter une envie
      </ScreenTitle>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          height: 50,
          padding: '0 14px',
          borderRadius: 16,
          border: `1.5px solid ${theme.accent}`,
          background: t.bg,
          marginBottom: 12,
        }}
      >
        <span style={{ font: `400 12px/1 ${FONT.mono}`, color: theme.accent }}>
          URL
        </span>
        <input
          value={state.link}
          onChange={(e) => dispatch({ type: 'setLink', link: e.target.value })}
          placeholder="Collez un lien Amazon, Apple…"
          aria-label="Lien du produit"
          style={{
            flex: 1,
            border: 0,
            outline: 0,
            background: 'none',
            font: `400 14.5px/1 ${FONT.sans}`,
            color: t.fg,
          }}
        />
      </div>

      <button
        onClick={analyze}
        disabled={loading}
        style={{
          width: '100%',
          height: 50,
          borderRadius: 16,
          font: `600 15px/1 ${FONT.sans}`,
          transition: 'transform .18s',
          background: loading ? t.surface : t.fg,
          color: loading ? t.fg2 : t.bg,
          cursor: loading ? 'progress' : 'pointer',
        }}
      >
        {loading ? 'Analyse du lien…' : 'Récupérer les informations'}
      </button>

      {loading && (
        <div
          role="status"
          aria-live="polite"
          aria-label="Analyse du lien en cours"
          style={{
            marginTop: 20,
            padding: 14,
            borderRadius: 20,
            background: t.surface,
            display: 'flex',
            gap: 13,
            alignItems: 'center',
          }}
        >
          <Skeleton className="h-[74px] w-[74px] rounded-xl" />
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {['78%', '46%', '60%'].map((w) => (
              <Skeleton
                key={w}
                className="h-3 rounded-sm"
                // Width varies per row; Tailwind cannot build a class from a
                // runtime value, so it stays a style prop.
                style={{ width: w }}
              />
            ))}
          </div>
        </div>
      )}

      {state.addStep === 2 && (
        <div style={{ marginTop: 20, animation: 'kPop .4s both' }}>
          <div
            style={{
              padding: 14,
              borderRadius: 20,
              background: t.surface,
              display: 'flex',
              gap: 13,
              alignItems: 'center',
            }}
          >
            <PlaceholderArt
              label="PHOTO"
              style={{
                width: 74,
                height: 74,
                flex: 'none',
                borderRadius: 15,
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: `600 14.5px/1.25 ${FONT.sans}`, color: t.fg }}>
                {SCRAPED.name}
              </div>
              <div
                style={{
                  font: `500 13px/1 ${FONT.mono}`,
                  color: t.fg,
                  marginTop: 6,
                }}
              >
                {SCRAPED.price}
              </div>
              <div
                style={{
                  font: `400 11px/1 ${FONT.sans}`,
                  color: t.fg3,
                  marginTop: 6,
                }}
              >
                {SCRAPED.source}
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div>
              <div style={{ ...eyebrow(theme), marginBottom: 7 }}>Liste</div>
              <div
                role="group"
                aria-label="Liste"
                style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}
              >
                {ADD_LISTS.map((label) => (
                  <button
                    key={label}
                    onClick={() => dispatch({ type: 'setAddList', list: label })}
                    aria-pressed={state.addList === label}
                    style={chip(theme, state.addList === label)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div style={{ ...eyebrow(theme), marginBottom: 7 }}>Priorité</div>
              <div
                role="group"
                aria-label="Priorité"
                style={{ display: 'flex', gap: 7 }}
              >
                {([1, 2, 3] as const).map((n) => (
                  <button
                    key={n}
                    onClick={() => dispatch({ type: 'setAddPrio', prio: n })}
                    aria-pressed={state.addPrio === n}
                    aria-label={`Priorité ${n} sur 3`}
                    style={chip(theme, state.addPrio === n)}
                  >
                    {stars(n)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div style={{ ...eyebrow(theme), marginBottom: 7 }}>
                Description
              </div>
              <div
                style={{
                  padding: '13px 14px',
                  borderRadius: 15,
                  background: t.surface,
                  font: `400 13.5px/1.5 ${FONT.sans}`,
                  color: t.fg2,
                  minHeight: 66,
                }}
              >
                {SCRAPED.desc}
              </div>
            </div>
          </div>

          <button
            onClick={() => {
              dispatch({ type: 'go', screen: 'list' });
              dispatch({ type: 'setAddStep', step: 0 });
              flash(`${SCRAPED.name} ajoutés à ${state.addList}`);
            }}
            style={{
              width: '100%',
              height: 52,
              marginTop: 18,
              borderRadius: 17,
              background: theme.accent,
              color: '#fff',
              font: `600 15.5px/1 ${FONT.sans}`,
              boxShadow: `0 10px 24px -12px ${theme.accentGlow}`,
            }}
          >
            Ajouter à ma liste
          </button>
        </div>
      )}

      {state.addStep === 0 && (
        <div style={{ marginTop: 26 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 20,
            }}
          >
            <div style={{ flex: 1, height: 1, background: t.line }} />
            <span
              style={{
                font: `400 10px/1 ${FONT.mono}`,
                color: t.fg3,
                letterSpacing: '.1em',
              }}
            >
              OU
            </span>
            <div style={{ flex: 1, height: 1, background: t.line }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ADD_METHODS.map((m) => (
              <button
                key={m.title}
                onClick={() => flash('Bientôt disponible')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 13,
                  padding: 15,
                  borderRadius: 18,
                  background: t.surface,
                  textAlign: 'left',
                  width: '100%',
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
                    font: `600 13px/1 ${FONT.mono}`,
                    color: theme.accent,
                  }}
                >
                  {m.icon}
                </span>
                <span style={{ flex: 1 }}>
                  <span
                    style={{
                      display: 'block',
                      font: `600 13.5px/1.2 ${FONT.sans}`,
                      color: t.fg,
                    }}
                  >
                    {m.title}
                  </span>
                  <span
                    style={{
                      display: 'block',
                      font: `400 12px/1.35 ${FONT.sans}`,
                      color: t.fg2,
                      marginTop: 3,
                    }}
                  >
                    {m.sub}
                  </span>
                </span>
                <span aria-hidden style={{ color: t.fg3, fontSize: 15 }}>
                  ›
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
