import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router-dom';
import { CenteredState } from '../components/CenteredState';
import { Button } from '../ui';

/**
 * What the `error` screen becomes.
 *
 * In the prototype it was a destination you dispatched to, which meant nothing
 * could ever actually fail *into* it. As an `errorElement` it catches thrown
 * loader/render errors for the whole tree, and the same component doubles as
 * the 404 for the catch-all route.
 */
export function RouteError({ notFound = false }: { notFound?: boolean }) {
  const error = useRouteError();
  const navigate = useNavigate();

  const is404 = notFound || (isRouteErrorResponse(error) && error.status === 404);

  // Shown in the footnote. Real diagnostics beat the prototype's invented
  // "ERR_NETWORK · 3 requêtes en attente".
  const code = isRouteErrorResponse(error)
    ? `HTTP_${error.status}`
    : error instanceof Error
      ? error.name
      : 'ERR_UNKNOWN';

  return (
    <CenteredState
      art={
        <div
          aria-hidden
          className="mb-6 flex h-15 w-15 items-center justify-center rounded-2xl bg-accent-soft text-[1.625rem] font-bold text-accent"
        >
          {is404 ? '?' : '!'}
        </div>
      }
      title={is404 ? 'Page introuvable' : 'Une erreur est survenue'}
      body={
        is404
          ? "Ce lien ne mène nulle part. La liste a peut-être été supprimée ou rendue privée."
          : 'Vos modifications sont enregistrées localement. Nous réessayons dès le retour du réseau.'
      }
      action={
        <div className="flex gap-3">
          <Button variant="outline" size="md" onClick={() => navigate(-1)}>
            Retour
          </Button>
          <Button size="md" onClick={() => navigate('/')}>
            Accueil
          </Button>
        </div>
      }
      footnote={is404 ? undefined : code}
    />
  );
}
