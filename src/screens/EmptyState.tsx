import { CenteredState } from '../components/CenteredState';
import { PlaceholderArt } from '../components/Placeholder';
import { useStore } from '../state/store';
import { FONT, useTheme } from '../theme';

export function EmptyState() {
  const { dispatch } = useStore();
  const theme = useTheme();

  return (
    <CenteredState
      art={
        <PlaceholderArt
          label="ILLU VIDE"
          fill={theme.t.surface}
          hatch={5}
          style={{
            width: 132,
            height: 132,
            borderRadius: 34,
            marginBottom: 26,
          }}
        />
      }
      title="Aucune envie ici"
      body="Collez un lien, et Kado remplit la photo, le prix et la description pour vous."
      action={
        <button
          onClick={() => dispatch({ type: 'go', screen: 'add' })}
          style={{
            height: 48,
            padding: '0 24px',
            borderRadius: 15,
            background: theme.accent,
            color: '#fff',
            font: `600 14.5px/1 ${FONT.sans}`,
          }}
        >
          Ajouter une envie
        </button>
      }
    />
  );
}
