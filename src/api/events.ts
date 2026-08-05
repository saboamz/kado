import { supabase } from '../lib/supabase';

/**
 * Telemetry that feeds recommendations.
 *
 * Only browsing events go through here. Reserving, contributing and releasing
 * are recorded server-side by the RPCs that perform them, so a giving event
 * exists exactly when the thing it describes did — and so a client cannot
 * manufacture one. See the whitelist in supabase/migrations/0011_events.sql.
 */

/** The kinds a client is permitted to log. Anything else the server refuses. */
export type ClientEventKind =
  | 'view_product'
  | 'view_wish'
  | 'like_wish'
  | 'click_out'
  | 'dismiss_reco';

export type EventContext = {
  productId?: string;
  wishItemId?: string;
  /** Whose list this touched. */
  recipientId?: string;
  /** Set when the event followed a recommendation, so per-tier CTR is real. */
  source?: string;
};

/**
 * One browsing session, for de-duplicating views.
 *
 * A view is weak evidence to begin with; the same view counted forty times
 * because someone scrolled up and down would drown the signal it belongs to.
 * sessionStorage rather than localStorage: a session is a visit, not a device.
 */
function sessionId(): string | undefined {
  if (typeof sessionStorage === 'undefined') return undefined;
  let id = sessionStorage.getItem('kado.session');
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem('kado.session', id);
  }
  return id;
}

/** Views already logged this session, so a re-render is not a second view. */
const seen = new Set<string>();

/**
 * Record an event. Never throws.
 *
 * Telemetry must not be able to break a page: a failed log is a lost row, and
 * a lost row is worth strictly less than a broken screen. Errors go to the
 * console so they are still findable in development.
 */
export async function logEvent(
  kind: ClientEventKind,
  ctx: EventContext = {},
): Promise<void> {
  // De-duplicate views within a session. Clicks and dismissals are deliberate
  // acts and are always recorded, even repeated ones.
  if (kind === 'view_product' || kind === 'view_wish') {
    const key = `${kind}:${ctx.productId ?? ctx.wishItemId ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
  }

  try {
    const { error } = await supabase.rpc('log_event', {
      p_kind: kind,
      p_product: ctx.productId ?? null,
      p_wish_item: ctx.wishItemId ?? null,
      p_recipient: ctx.recipientId ?? null,
      p_session: sessionId() ?? null,
      p_source: (ctx.source as never) ?? null,
    });
    if (error) console.warn('log_event failed', error.message);
  } catch (e) {
    console.warn('log_event failed', e);
  }
}

/** Clears the session's view de-duplication. Tests only. */
export function resetEventDedup() {
  seen.clear();
}
