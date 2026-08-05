import { screen } from '@testing-library/react';
import { Notifications } from './Notifications';
import { NOTIF_TEMPLATES } from '../api/social';
import { renderScreen } from '../test/render';

const onNotifications = { route: '/notifications' };

it('lists every notification', async () => {
  renderScreen(<Notifications />, onNotifications);
  expect(await screen.findAllByRole('listitem')).toHaveLength(6);
});

it('marks only the unread ones', async () => {
  renderScreen(<Notifications />, onNotifications);
  // Three of the six seeded rows have a null read_at.
  expect(await screen.findAllByLabelText('Non lue')).toHaveLength(3);
});

it('names the actor in each entry', async () => {
  renderScreen(<Notifications />, onNotifications);
  expect(await screen.findByText('Emma')).toBeInTheDocument();
  expect(screen.getByText('Lucas')).toBeInTheDocument();
});

/**
 * The row carries a kind and a payload; the sentence is assembled here.
 *
 * This is the whole point of the structured table. The server has no text
 * column, so there is nowhere for a careless backend job to write "Marc a
 * réservé les AirPods" — the client can only render one of nine templates,
 * none of which can name a reservation.
 */
it('renders the copy from the template for the kind', async () => {
  renderScreen(<Notifications />, onNotifications);
  const row = (await screen.findByText('Emma')).closest('li')!;
  expect(row).toHaveTextContent(NOTIF_TEMPLATES.wish_added);
});

/**
 * A pot notification is a whole sentence, so it is not prefixed with an actor
 * name the way "Emma a ajouté…" is.
 */
it('renders standalone copy without an actor prefix', async () => {
  renderScreen(<Notifications />, onNotifications);
  const pot = await screen.findByText(NOTIF_TEMPLATES.pot_progress);
  expect(pot.closest('li')).not.toHaveTextContent('Cagnotte MacBook');
});

/**
 * The fixture prose survives in the mock payload, but no screen should show
 * it: the copy comes from the template, and the payload supplies only details.
 */
it('never renders free text out of the payload', async () => {
  renderScreen(<Notifications />, onNotifications);
  await screen.findByText('Emma');
  expect(screen.queryByText(/a créé une liste Noël\./)).not.toBeInTheDocument();
  expect(screen.queryByText(/atteint 41 %/)).not.toBeInTheDocument();
});

it('shows when each notification arrived', async () => {
  renderScreen(<Notifications />, onNotifications);
  const row = (await screen.findByText('Emma')).closest('li')!;
  expect(row).toHaveTextContent('12 min');
});
