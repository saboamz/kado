import { logEvent, resetEventDedup } from './events';
import { mockEvents, resetMockData, setMockViewer } from '../lib/mockTransport';

/**
 * The client half of the event log.
 *
 * The whitelist itself is enforced in SQL and tested there
 * (supabase/tests/0003_events.test.sql). What these cover is the client's
 * behaviour around it: that telemetry cannot break a page, and that a view
 * counted once stays counted once.
 */
beforeEach(() => {
  resetMockData();
  resetEventDedup();
  setMockViewer('marc');
});

it('records a browsing event', async () => {
  await logEvent('view_product', { productId: 'p1' });
  expect(mockEvents()).toEqual(['view_product']);
});

it('counts a view once per session, however many times it renders', async () => {
  // A view is weak evidence to begin with; the same one counted forty times
  // because someone scrolled would drown the signal it belongs to.
  await logEvent('view_product', { productId: 'p1' });
  await logEvent('view_product', { productId: 'p1' });
  await logEvent('view_product', { productId: 'p1' });
  expect(mockEvents()).toEqual(['view_product']);
});

it('still counts a different product', async () => {
  await logEvent('view_product', { productId: 'p1' });
  await logEvent('view_product', { productId: 'p2' });
  expect(mockEvents()).toHaveLength(2);
});

it('records every deliberate act, even repeated', async () => {
  // Clicking out twice is two decisions, unlike scrolling past something twice.
  await logEvent('click_out', { productId: 'p1' });
  await logEvent('click_out', { productId: 'p1' });
  expect(mockEvents()).toEqual(['click_out', 'click_out']);
});

it('never throws, whatever the server says', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  // 'purchase' is refused by the whitelist in both the SQL and the mock.
  // Telemetry must not be able to break a page: a lost row is worth strictly
  // less than a broken screen.
  await expect(
    logEvent('purchase' as never, { productId: 'p1' }),
  ).resolves.toBeUndefined();
  expect(warn).toHaveBeenCalled();
  expect(mockEvents()).toEqual([]);
  warn.mockRestore();
});
