import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Wishlist } from './Wishlist';
import { GIFTS } from '../data/fixtures';
import { renderScreen, MARC, SOPHIE } from '../test/render';
import { resetMockData } from '../lib/mockTransport';

/**
 * Ownership is the URL's handle matched against the signed-in viewer, not a
 * `role` field. The list below is always Sophie's; what changes is who is
 * looking at it — as Sophie it is her own list, as Marc it is a friend's view
 * of it.
 *
 * Reservation state no longer comes from the store, so these tests pass no
 * `initial: { reserved }`. It arrives from an RPC — answered under test by
 * src/lib/mockTransport.ts — which REFUSES an owner outright rather than
 * handing over data for the screen to filter. What a viewer sees is therefore
 * decided by who they are, and both viewers query the same seeded state.
 */
const LIST_PATH = '/u/:handle/listes/:slug';
const LIST = '/u/sophie/listes/anniversaire';
const asOwner = { route: LIST, path: LIST_PATH, viewer: SOPHIE };
const asFriend = { route: LIST, path: LIST_PATH, viewer: MARC };

it('lists every gift', () => {
  renderScreen(<Wishlist />, asFriend);
  for (const g of GIFTS) {
    expect(screen.getByText(g.name)).toBeInTheDocument();
  }
});

it('switches between grid and rows', async () => {
  const user = userEvent.setup();
  renderScreen(<Wishlist />, asFriend);
  const toggle = screen.getByRole('button', { name: 'Vue liste' });
  await user.click(toggle);
  expect(screen.getByRole('button', { name: 'Vue grille' })).toBeInTheDocument();
});

it('opens a gift detail', async () => {
  const user = userEvent.setup();
  renderScreen(<Wishlist />, asFriend);
  await user.click(screen.getByText('AirPods Pro 3'));
  expect(screen.getByTestId('path')).toHaveTextContent(
    '/u/sophie/listes/anniversaire/g1',
  );
});

it('sends a collaborative gift to the pot screen', async () => {
  const user = userEvent.setup();
  renderScreen(<Wishlist />, asFriend);
  await user.click(screen.getByText('MacBook Air 15″ M4'));
  expect(screen.getByTestId('path')).toHaveTextContent(
    '/u/sophie/listes/anniversaire/g3/cagnotte',
  );
});

describe('the secrecy rule on the list', () => {
  /**
   * Put a reservation of each kind into the transport before each test.
   *
   * The seed already has g2 held by someone else; this adds g1 held by the
   * viewer, so both flags ("Réservé par vous" and "Déjà réservé") and the
   * "2 réservées" counter have something to render.
   *
   * Per-test, not once: setup.ts resets the transport before every test so
   * that one test's reservation cannot leak into the next, which would make
   * the suite pass or fail on file order.
   *
   * This is what makes the owner assertions below meaningful — there IS
   * something for their view to leak.
   */
  beforeEach(() => {
    resetMockData({ reserved: { g1: 'you', g2: 'other' } });
  });

  it('flags reserved gifts for a friend', async () => {
    renderScreen(<Wishlist />, asFriend);
    // Async now: the flags follow the RPC answer, not the first paint.
    expect(await screen.findByText('Réservé par vous')).toBeInTheDocument();
    expect(await screen.findByText('Déjà réservé')).toBeInTheDocument();
  });

  it('shows the owner no reservation flag at all', async () => {
    // The control. Prove the flags CAN render from the very state the owner is
    // about to query — otherwise the assertions below would also pass against
    // a list with nothing reserved, i.e. they would pass with the server's
    // refusal removed.
    const { unmount } = renderScreen(<Wishlist />, asFriend);
    expect(await screen.findByText('Réservé par vous')).toBeInTheDocument();
    expect(await screen.findByText('Déjà réservé')).toBeInTheDocument();
    unmount();

    renderScreen(<Wishlist />, asOwner);
    // Wait for the screen to SETTLE before asserting absence: the owner's RPC
    // must actually have been issued and refused for "nothing rendered" to
    // mean anything. Asserting immediately would pass trivially, before any
    // answer could have arrived.
    await settle();

    expect(screen.queryByText('Réservé par vous')).not.toBeInTheDocument();
    expect(screen.queryByText('Déjà réservé')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Le propriétaire ne le voit pas'),
    ).not.toBeInTheDocument();
  });

  it('never shows the owner a count of reserved gifts', async () => {
    // Same control: a friend sees the counter, so the owner's missing counter
    // below is the refusal working rather than an empty list.
    const { unmount } = renderScreen(<Wishlist />, asFriend);
    expect(await screen.findByText(/réservées/)).toBeInTheDocument();
    unmount();

    renderScreen(<Wishlist />, asOwner);
    await settle();
    // The friend view says "6 envies · 2 réservées"; the owner must not.
    expect(screen.queryByText(/réservées/)).not.toBeInTheDocument();
    expect(screen.getByText(`${GIFTS.length} envies`)).toBeInTheDocument();
  });

  it('still shows the friend the reserved count', async () => {
    renderScreen(<Wishlist />, asFriend);
    // g1 (mine) and g2 (someone else) from the beforeEach seed.
    expect(await screen.findByText(/2 réservées/)).toBeInTheDocument();
  });

  it('keeps the cagnotte badge for everyone, it reveals nobody', () => {
    renderScreen(<Wishlist />, asOwner);
    // A pot's existence is public: the owner asked for the gift. Who paid is not.
    expect(screen.getAllByText('Cagnotte').length).toBeGreaterThan(0);
  });
});

/**
 * Wait until the screen has stopped changing, then let it change once more.
 *
 * This exists because the obvious settle is a trap. Waiting for `6 envies`
 * LOOKS like it proves the reservation query came back — that line renders
 * without its " · N réservées" suffix only when the map is empty — but it also
 * matches the very first paint, before any request has resolved. An absence
 * assertion behind that wait passes even when the server is leaking: the leak
 * simply arrives a tick later. Verified by stubbing the transport to answer an
 * owner with a friend's data; the naive wait still passed.
 *
 * So settle on quiescence instead: poll until the rendered text is unchanged
 * across consecutive macrotasks. A late-arriving answer — including one that
 * should not have been sent — lands inside that window and is therefore
 * visible to the assertions that follow.
 */
async function settle() {
  let previous = '';
  await waitFor(
    () => {
      const current = document.body.textContent ?? '';
      const stable = current === previous;
      previous = current;
      expect(stable).toBe(true);
    },
    { interval: 10 },
  );
}
