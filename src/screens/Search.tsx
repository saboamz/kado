import { PlaceholderArt } from '../components/Placeholder';
import { ScreenTitle } from '../components/ScreenTitle';
import { PEOPLE, SEARCH_FILTERS } from '../data/social';
import { useStore } from '../state/store';
import { chip, eyebrow, FONT, useTheme } from '../theme';

export function Search() {
  const { state, dispatch } = useStore();
  const theme = useTheme();
  const { t } = theme;

  return (
    <div style={{ padding: '66px 20px 120px', animation: 'kFadeUp .4s both' }}>
      <ScreenTitle margin="0 0 18px">Rechercher</ScreenTitle>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          height: 46,
          padding: '0 14px',
          borderRadius: 15,
          background: t.surface,
          marginBottom: 16,
        }}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden
          style={{ flex: 'none', opacity: 0.5, color: t.fg }}
        >
          <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6" />
          <line
            x1="10.8"
            y1="10.8"
            x2="14"
            y2="14"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
        <input
          value={state.query}
          onChange={(e) => dispatch({ type: 'setQuery', query: e.target.value })}
          placeholder="Amis, listes, cadeaux…"
          aria-label="Rechercher"
          style={{
            flex: 1,
            border: 0,
            outline: 0,
            background: 'none',
            font: `400 15px/1 ${FONT.sans}`,
            color: t.fg,
          }}
        />
      </div>

      <div
        role="group"
        aria-label="Filtres"
        style={{ display: 'flex', gap: 7, marginBottom: 22, flexWrap: 'wrap' }}
      >
        {SEARCH_FILTERS.map((label) => (
          <button
            key={label}
            onClick={() => dispatch({ type: 'setFilter', filter: label })}
            aria-pressed={state.filter === label}
            style={chip(theme, state.filter === label)}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ ...eyebrow(theme), margin: '0 0 12px 2px' }}>
        {state.filter === 'Amis' ? 'Suggestions' : state.filter}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {PEOPLE.map((p) => (
          <button
            key={p.name}
            onClick={() => dispatch({ type: 'go', screen: 'profile' })}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 13,
              padding: '10px 8px',
              borderRadius: 16,
              textAlign: 'left',
              transition: 'background .15s',
            }}
          >
            <PlaceholderArt
              style={{
                width: 46,
                height: 46,
                flex: 'none',
                borderRadius: '50%',
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: `600 14.5px/1.25 ${FONT.sans}`, color: t.fg }}>
                {p.name}
              </div>
              <div
                style={{
                  font: `400 12.5px/1.35 ${FONT.sans}`,
                  color: t.fg2,
                  marginTop: 2,
                }}
              >
                {p.meta}
              </div>
            </div>
            <span
              style={{
                font: `500 11px/1 ${FONT.sans}`,
                padding: '7px 10px',
                borderRadius: 9,
                whiteSpace: 'nowrap',
                ...(p.badgeLabel === 'Ajouter'
                  ? { background: theme.accent, color: '#fff' }
                  : { background: t.surface, color: t.fg2 }),
              }}
            >
              {p.badgeLabel}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
