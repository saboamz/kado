import { useStore } from '../state/store';
import { FONT, useTheme } from '../theme';
import type { TabId } from '../data/types';

const TABS: { id: TabId; label: string; glyph: string }[] = [
  { id: 'home', label: 'Accueil', glyph: '▢' },
  { id: 'search', label: 'Recherche', glyph: '○' },
  { id: 'add', label: 'Ajouter', glyph: '+' },
  { id: 'notifs', label: 'Alertes', glyph: '◎' },
  { id: 'profile', label: 'Profil', glyph: '●' },
];

export function TabBar() {
  const { state, dispatch } = useStore();
  const theme = useTheme();
  const { t } = theme;

  return (
    <nav
      aria-label="Navigation principale"
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 88,
        zIndex: 50,
        background: t.glass,
        backdropFilter: 'blur(22px)',
        borderTop: `1px solid ${t.line}`,
        display: 'flex',
        alignItems: 'flex-start',
        padding: '12px 8px 0',
      }}
    >
      {TABS.map(({ id, label, glyph }) => {
        const on = state.tab === id;
        const fab = id === 'add';
        return (
          <button
            key={id}
            onClick={() => dispatch({ type: 'go', screen: id })}
            aria-label={label}
            aria-current={on ? 'page' : undefined}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              paddingTop: 2,
            }}
          >
            <span
              aria-hidden
              style={
                fab
                  ? {
                      width: 44,
                      height: 44,
                      borderRadius: 15,
                      background: theme.accent,
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      font: `400 24px/1 ${FONT.sans}`,
                      marginTop: -6,
                      boxShadow: `0 10px 22px -10px ${theme.accentGlow}`,
                    }
                  : {
                      width: 26,
                      height: 26,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 17,
                      lineHeight: 1,
                      color: on ? t.fg : t.fg3,
                    }
              }
            >
              {glyph}
            </span>
            {!fab && (
              <span
                style={{
                  font: `500 9.5px/1 ${FONT.sans}`,
                  color: on ? t.fg : t.fg3,
                }}
              >
                {label}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
