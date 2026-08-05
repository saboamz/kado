import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GiftDetail } from './GiftDetail';
import { renderScreen, MARC, SOPHIE } from '../test/render';
import { resetMockData } from '../lib/mockTransport';

/**
 * Ownership is the URL's handle matched against the signed-in viewer, not a
 * `role` field. The list is always Sophie's; what changes is who is looking —
 * as Sophie it is her own gift, as Marc it is a friend's view of it.
 *
 * Reservation and pot state now arrive from RPCs — answered under test by
 * src/lib/mockTransport.ts — instead of the store, so these tests seed the
 * transport with resetMockData() rather than passing `initial: { reserved }`.
 * That is the whole point of the migration: the transport REFUSES an owner
 * outright instead of handing the screen data to filter, so what a viewer sees
 * is decided by who they are. Anything downstream of that answer is
 * asynchronous — `findBy`, not `getBy`.
 */
const DETAIL_PATH = '/u/:handle/listes/:slug/:itemId';
const POT_PATH = '/u/:handle/listes/:slug/:itemId/cagnotte';
const LIST = '/u/sophie/listes/anniversaire';

const asFriend = (id: string) => ({
  route: `${LIST}/${id}`,
  path: DETAIL_PATH,
  viewer: MARC,
});
const asOwner = (id: string) => ({
  route: `${LIST}/${id}`,
  path: DETAIL_PATH,
  viewer: SOPHIE,
});
const onPot = {
  route: `${LIST}/g3/cagnotte`,
  path: POT_PATH,
  viewer: MARC,
};
const onPotAsOwner = {
  route: `${LIST}/g3/cagnotte`,
  path: POT_PATH,
  viewer: SOPHIE,
};

describe('the gift', () => {
  it('shows name, price, category and description', () => {
    renderScreen(<GiftDetail />, asFriend('g1'));
    expect(screen.getByRole('heading')).toHaveTextContent('AirPods Pro 3');
    expect(screen.getByText('279 €')).toBeInTheDocument();
    expect(screen.getByText('Tech')).toBeInTheDocument();
    expect(screen.getByText(/Réduction de bruit active/)).toBeInTheDocument();
  });

  it('credits the merchant', () => {
    renderScreen(<GiftDetail />, asFriend('g1'));
    expect(screen.getByText('Apple Store')).toBeInTheDocument();
    expect(screen.getByText('apple.com/fr/airpods-pro')).toBeInTheDocument();
  });

  it('labels the priority for assistive tech', () => {
    renderScreen(<GiftDetail />, asFriend('g5'));
    expect(screen.getByLabelText('Priorité 1 sur 3')).toBeInTheDocument();
    expect(screen.getByText('Ce serait sympa')).toBeInTheDocument();
  });

  it('goes back to the list', async () => {
    const user = userEvent.setup();
    renderScreen(<GiftDetail />, asFriend('g1'));
    await user.click(screen.getByRole('link', { name: 'Retour à la liste' }));
    expect(screen.getByTestId('path')).toHaveTextContent(LIST);
  });
});

describe('reserving as a friend', () => {
  it('reserves an available gift and reassures the reserver', async () => {
    const user = userEvent.setup();
    renderScreen(<GiftDetail />, asFriend('g1'));
    await user.click(
      await screen.findByRole('button', { name: 'Réserver ce cadeau' }),
    );
    expect(screen.getByTestId('toast')).toHaveTextContent(
      'Réservé — Sophie ne verra rien',
    );
    // Reserving round-trips through the RPC and then invalidates the query, so
    // the new label lands a tick after the click rather than synchronously.
    expect(
      await screen.findByRole('button', { name: 'Annuler ma réservation' }),
    ).toBeInTheDocument();
  });

  it('releases a gift it already holds', async () => {
    const user = userEvent.setup();
    resetMockData({ reserved: { g1: 'you' } });
    renderScreen(<GiftDetail />, asFriend('g1'));
    await user.click(
      await screen.findByRole('button', { name: 'Annuler ma réservation' }),
    );
    expect(screen.getByTestId('toast')).toHaveTextContent(
      'Réservation annulée',
    );
    expect(
      await screen.findByRole('button', { name: 'Réserver ce cadeau' }),
    ).toBeInTheDocument();
  });

  it('disables a gift another friend already took', async () => {
    resetMockData({ reserved: { g2: 'other' } });
    renderScreen(<GiftDetail />, asFriend('g2'));
    expect(
      await screen.findByRole('button', { name: 'Déjà réservé par un proche' }),
    ).toBeDisabled();
  });
});

describe('the secrecy rule on the detail screen', () => {
  /**
   * The call to action, which is a RENDER choice rather than a data one.
   *
   * Worth being precise about what this proves. The label comes from
   * `owner ? 'Modifier ce cadeau' : …` in GiftDetail, so it stays correct even
   * if the server started handing an owner reservation state — this test would
   * not catch that. It is still worth keeping: an owner offered a "Réserver"
   * button on their own gift is a real bug, just a UX one rather than a leak.
   *
   * The test that does bite on this screen is 'hides the whole pot from the
   * owner' below: Pot renders purely from what usePot returns, with no owner
   * branch to fall back on, so it fails the moment the server answers.
   */
  it('offers the owner editing, never reserving', async () => {
    resetMockData({ reserved: { g1: 'other' } });
    renderScreen(<GiftDetail />, asOwner('g1'));
    await settleAsOwner();
    expect(
      screen.getByRole('button', { name: 'Modifier ce cadeau' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Réserver|réservé/ }),
    ).not.toBeInTheDocument();
  });

  /**
   * The reassurance card's wording, which is likewise an owner branch in
   * GiftDetail rather than something derived from the server's answer. Same
   * caveat as above: it pins the copy an owner is shown, not the guarantee
   * behind it.
   *
   * The friend half is the useful part — it proves the card really does vary
   * with reservation state, so the owner wording is a deliberate branch and
   * not the card's only mode.
   */
  it('tells the owner no reservation data exists here', async () => {
    resetMockData({ reserved: { g1: 'other' } });

    const { unmount } = renderScreen(<GiftDetail />, asFriend('g1'));
    expect(
      await screen.findByText(/Sophie ne verra jamais cette réservation/),
    ).toBeInTheDocument();
    unmount();

    renderScreen(<GiftDetail />, asOwner('g1'));
    await settleAsOwner();
    expect(
      screen.getByText(/aucune information de réservation n'existe/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Sophie ne verra jamais cette réservation/),
    ).not.toBeInTheDocument();
  });

  it('hides the whole pot from the owner', async () => {
    // The control: the pot renders in full for a friend on this exact route.
    const { unmount } = renderScreen(<GiftDetail />, onPot);
    expect(
      await screen.findByRole('region', { name: 'Cagnotte' }),
    ).toBeInTheDocument();
    unmount();

    renderScreen(<GiftDetail />, onPotAsOwner);
    await settleAsOwner();
    // Not an empty section — no section at all. usePot hands back null because
    // the server declined to describe the pot.
    expect(
      screen.queryByRole('region', { name: 'Cagnotte' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/récoltés/)).not.toBeInTheDocument();
  });

  it('promises anonymity to a friend before they reserve', async () => {
    resetMockData({ reserved: {} });
    renderScreen(<GiftDetail />, asFriend('g1'));
    expect(
      await screen.findByText('Votre réservation restera invisible pour Sophie.'),
    ).toBeInTheDocument();
  });
});

describe('the cagnotte', () => {
  it('shows progress toward the target', async () => {
    renderScreen(<GiftDetail />, onPot);
    // The pot arrives from get_pot_state in CENTS: 65 000 raised of 159 900,
    // and Progress reports those raw values.
    const bar = await screen.findByRole('progressbar', { name: /Cagnotte à/ });
    expect(bar).toHaveAttribute('aria-valuenow', '65000');
    expect(bar).toHaveAttribute('aria-valuemax', '159900');
    // Intl formats with non-breaking spaces, so these match by pattern rather
    // than pasting invisible characters into the assertion.
    expect(await screen.findByText(/^650\s€ récoltés$/)).toBeInTheDocument();
    expect(screen.getByText(/sur\s1\s599\s€/)).toBeInTheDocument();
  });

  it('offers contribution amounts derived from the pot currency', async () => {
    const user = userEvent.setup();
    renderScreen(<GiftDetail />, onPot);
    // 20/50/100/200 €, formatted from AMOUNTS_CENTS.
    for (const amount of [20, 50, 100, 200]) {
      expect(
        await screen.findByRole('button', {
          name: new RegExp(`^${amount}\\s€$`),
        }),
      ).toBeInTheDocument();
    }
    // Choosing an amount retargets the call to action.
    await user.click(screen.getByRole('button', { name: /^100\s€$/ }));
    expect(
      screen.getByRole('button', { name: 'Participer avec 100 €' }),
    ).toBeInTheDocument();
  });

  it('contributes the chosen amount, anonymously', async () => {
    const user = userEvent.setup();
    renderScreen(<GiftDetail />, onPot);
    await user.click(await screen.findByRole('button', { name: /^100\s€$/ }));
    await user.click(
      screen.getByRole('button', { name: 'Participer avec 100 €' }),
    );
    // Anonymity is the promise the contribution flow makes; the running total
    // it produces is asserted separately below.
    expect(screen.getByTestId('toast')).toHaveTextContent(
      'votre participation est anonyme',
    );
  });

  /**
   * The running total moves, and it moves because the SERVER says so.
   *
   * Worth asserting separately from the toast: the toast is written from
   * `state.contrib` and would keep claiming a contribution even if none
   * reached the server. This reads the total back out of get_pot_state, so it
   * only passes if the contribute RPC actually ran and the pot query was
   * invalidated behind it.
   */
  it('adds the contribution to the running total', async () => {
    const user = userEvent.setup();
    renderScreen(<GiftDetail />, onPot);
    await user.click(await screen.findByRole('button', { name: /^100\s€$/ }));
    await user.click(
      screen.getByRole('button', { name: 'Participer avec 100 €' }),
    );
    expect(await screen.findByText(/^750\s€ récoltés$/)).toBeInTheDocument();
  });

  it('never overshoots the target', async () => {
    const user = userEvent.setup();
    // 1 550 € of a 1 599 € target, so a 200 € top-up would overshoot by 151 €.
    // The clamp lives server-side (`Math.min(POT_TOTAL * 100, …)`), which is
    // why this asserts the rendered total rather than any local arithmetic.
    resetMockData({ potRaisedCents: 155000 });
    renderScreen(<GiftDetail />, onPot);
    await user.click(await screen.findByRole('button', { name: /^200\s€$/ }));
    await user.click(
      screen.getByRole('button', { name: 'Participer avec 200 €' }),
    );
    expect(await screen.findByText(/^1\s599\s€ récoltés$/)).toBeInTheDocument();
  });

  it('falls back to a collaborative gift when the pot screen has none', async () => {
    // Arriving from the feed's cagnotte entry: the URL ends in /cagnotte but
    // points at g1, which has no pot of its own.
    renderScreen(<GiftDetail />, {
      route: `${LIST}/g1/cagnotte`,
      path: POT_PATH,
      viewer: MARC,
    });
    expect(
      await screen.findByRole('region', { name: 'Cagnotte' }),
    ).toBeInTheDocument();
  });
});

/**
 * Wait until the screen has stopped changing.
 *
 * Deliberately not "wait for the owner's reassurance card": that card is an
 * owner branch in GiftDetail, so it is present on the very first paint, before
 * any request has resolved. An absence assertion behind such a wait passes even
 * when the server is leaking — the leak just arrives a tick later. Verified by
 * stubbing the transport to answer an owner with a friend's data; the
 * card-based wait still passed, and the pot appeared immediately afterwards.
 *
 * Settling on quiescence instead — polling until the rendered text is
 * unchanged across consecutive macrotasks — puts any late answer inside the
 * window, where the assertions can see it.
 */
async function settleAsOwner() {
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
