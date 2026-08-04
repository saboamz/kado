import { useNavigate } from 'react-router-dom';
import { CenteredState } from '../components/CenteredState';
import { useStore } from '../state/store';
import { Button } from '../ui';

/**
 * The standalone error screen.
 *
 * Route-level failures are handled by app/RouteError.tsx, which is wired as the
 * router's errorElement and therefore catches things that actually go wrong.
 * This one stays for the "connection lost" case, which is app state rather than
 * a routing error.
 */
export function ErrorState() {
  const navigate = useNavigate();
  const { flash } = useStore();

  return (
    <CenteredState
      art={
        <div
          aria-hidden
          className="mb-6 flex h-15 w-15 items-center justify-center rounded-2xl bg-accent-soft text-[1.625rem] font-bold text-accent"
        >
          !
        </div>
      }
      title="Connexion perdue"
      body="Vos modifications sont enregistrées localement. Nous réessayons dès le retour du réseau."
      action={
        <Button
          variant="outline"
          onClick={() => {
            navigate('/');
            flash('Reconnecté');
          }}
        >
          Réessayer
        </Button>
      }
      footnote="ERR_NETWORK · 3 requêtes en attente"
    />
  );
}
