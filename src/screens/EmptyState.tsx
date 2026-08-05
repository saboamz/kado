import { useNavigate } from 'react-router-dom';
import { CenteredState } from '../components/CenteredState';
import { PlaceholderArt } from '../components/Placeholder';
import { Button } from '../ui';

/**
 * Shown by a list route that has nothing in it.
 *
 * No longer a route of its own: "empty" is a state of the wishlist, not a
 * place you navigate to. It stays exported as a component so any route can
 * render it.
 */
export function EmptyState() {
  const navigate = useNavigate();

  return (
    <CenteredState
      art={
        <PlaceholderArt
          label="ILLU VIDE"
          hatch={5}
          className="mb-6.5 h-33 w-33 rounded-[2.125rem] bg-surface"
        />
      }
      title="Aucune envie ici"
      body="Collez un lien, et Kado remplit la photo, le prix et la description pour vous."
      action={
        <Button onClick={() => navigate('/ajouter/lien')}>
          Ajouter une envie
        </Button>
      }
    />
  );
}
