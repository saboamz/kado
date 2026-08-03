import { CenteredState } from '../components/CenteredState';
import { useStore } from '../state/store';
import { FONT, useTheme } from '../theme';

export function ErrorState() {
  const { dispatch, flash } = useStore();
  const theme = useTheme();
  const { t } = theme;

  return (
    <CenteredState
      art={
        <div
          aria-hidden
          style={{
            width: 60,
            height: 60,
            borderRadius: 20,
            background: theme.accentSoft,
            color: theme.accent,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            font: `700 26px/1 ${FONT.sans}`,
            marginBottom: 24,
          }}
        >
          !
        </div>
      }
      title="Connexion perdue"
      body="Vos modifications sont enregistrées localement. Nous réessayons dès le retour du réseau."
      action={
        <button
          onClick={() => {
            dispatch({ type: 'go', screen: 'home' });
            flash('Reconnecté');
          }}
          style={{
            height: 48,
            padding: '0 24px',
            borderRadius: 15,
            border: `1.5px solid ${t.line2}`,
            color: t.fg,
            font: `600 14.5px/1 ${FONT.sans}`,
          }}
        >
          Réessayer
        </button>
      }
      footnote="ERR_NETWORK · 3 requêtes en attente"
    />
  );
}
