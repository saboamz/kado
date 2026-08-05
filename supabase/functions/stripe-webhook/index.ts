import { createClient } from 'jsr:@supabase/supabase-js@2';

/**
 * Stripe webhook receiver.
 *
 * This endpoint is public — Stripe has to reach it — so the ONLY thing
 * standing between it and anyone who can POST is the signature check. Without
 * it, a stranger could mark any contribution captured by guessing an intent
 * id, and the pot would show money that never existed.
 *
 * The database does the rest: private.handle_psp_event is idempotent by
 * primary key, because Stripe delivers at least once and retries on success
 * too.
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

/**
 * Verifies Stripe's `Stripe-Signature` header.
 *
 * Implemented directly rather than pulling the Stripe SDK: the SDK's verifier
 * is the only part needed, and it is thirty lines of HMAC.
 *
 * Two details that are the whole point:
 *   - the comparison is constant-time, because a fast-exit compare leaks the
 *     expected signature one byte at a time to anyone willing to time it;
 *   - the timestamp is checked, because a valid signature replayed a year
 *     later is still a valid signature.
 */
async function verifySignature(
  payload: string,
  header: string | null,
  secret: string,
  toleranceSeconds = 300,
): Promise<boolean> {
  if (!header) return false;

  const parts = Object.fromEntries(
    header.split(',').map((p) => {
      const [k, ...v] = p.split('=');
      return [k.trim(), v.join('=')];
    }),
  );

  const timestamp = Number(parts.t);
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  // Replay window. Stripe signs the timestamp into the payload precisely so
  // this check is possible.
  const age = Math.abs(Date.now() / 1000 - timestamp);
  if (age > toleranceSeconds) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestamp}.${payload}`),
  );
  const expected = [...new Uint8Array(mac)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Constant time: same work whatever the input, so nothing is learned from
  // how long a rejection took.
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!secret) {
    // Refuse rather than skip verification. A misconfigured deployment that
    // silently accepted unsigned events would be indistinguishable from a
    // working one until someone noticed free money in a pot.
    console.error('STRIPE_WEBHOOK_SECRET is not set');
    return json({ error: 'not configured' }, 500);
  }

  // The RAW body: any reserialisation changes the bytes and breaks the HMAC.
  const raw = await req.text();
  const ok = await verifySignature(raw, req.headers.get('Stripe-Signature'), secret);
  if (!ok) return json({ error: 'invalid signature' }, 400);

  let event: {
    id: string;
    type: string;
    data: { object: { id?: string; payment_intent?: string } };
  };
  try {
    event = JSON.parse(raw);
  } catch {
    return json({ error: 'bad payload' }, 400);
  }

  // For a charge event the intent is a field; for an intent event it is the
  // object's own id.
  const intentId =
    event.data?.object?.payment_intent ?? event.data?.object?.id ?? null;

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const { data, error } = await admin.rpc('handle_psp_event', {
    p_event_id: event.id,
    p_event_type: event.type,
    p_intent_id: intentId,
    p_payload: event as unknown as Record<string, unknown>,
  });

  if (error) {
    // 500 so Stripe retries. The handler is idempotent, so a retry after a
    // partial failure is safe — which is what makes returning 500 the correct
    // response rather than a risk.
    console.error('handle_psp_event failed', error);
    return json({ error: 'processing failed' }, 500);
  }

  // 200 for everything the database understood, including 'duplicate' and
  // 'ignored'. Anything else tells Stripe to retry an event that will never
  // succeed, forever.
  return json({ received: true, result: data });
});
