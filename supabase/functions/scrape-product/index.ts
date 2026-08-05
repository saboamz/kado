import { createClient } from 'jsr:@supabase/supabase-js@2';
import { parseProduct } from './parse.ts';
import { isFetchableUrl, normaliseForFetch } from './guard.ts';

/**
 * Fetch a merchant page, extract a product, and upsert it into the catalogue.
 *
 * Runs server-side rather than in the browser for three reasons: merchant
 * pages do not send CORS headers, the anon client must not be trusted to
 * decide what a product is, and a URL supplied by a user must never be fetched
 * from somewhere with network access to internal services without a guard.
 */

const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 8_000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  // The caller must be signed in. Anonymous scraping would turn this into an
  // open URL-fetching proxy for anyone who found the endpoint.
  const auth = req.headers.get('Authorization');
  if (!auth) return json({ error: 'unauthorized' }, 401);

  let url: string;
  try {
    ({ url } = await req.json());
  } catch {
    return json({ error: 'bad request' }, 400);
  }

  const target = normaliseForFetch(url);
  if (!target || !(await isFetchableUrl(target))) {
    // Deliberately vague: the caller does not need to know whether their URL
    // was rejected for being malformed or for pointing at a private address,
    // and the difference is a probe.
    return json({ error: 'unfetchable', product: null }, 422);
  }

  // --- fetch ---
  let html: string;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(target, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        // Merchants serve a different page to an unknown agent; identify
        // honestly rather than impersonating a browser.
        'user-agent': 'KadoBot/1.0 (+https://kado.app/bot)',
        'accept-language': 'fr-FR,fr;q=0.9,en;q=0.6',
        accept: 'text/html,application/xhtml+xml',
      },
    });
    clearTimeout(timer);

    if (!res.ok) return json({ error: 'fetch failed', product: null }, 422);

    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('html')) {
      return json({ error: 'not a web page', product: null }, 422);
    }

    // Read a bounded prefix. The metadata we want is in <head>, and a
    // multi-megabyte page should not be able to exhaust the function's memory.
    const reader = res.body?.getReader();
    if (!reader) return json({ error: 'empty response', product: null }, 422);

    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
    await reader.cancel().catch(() => {});
    html = new TextDecoder().decode(
      chunks.reduce((acc, c) => {
        const merged = new Uint8Array(acc.length + c.length);
        merged.set(acc);
        merged.set(c, acc.length);
        return merged;
      }, new Uint8Array()),
    );
  } catch {
    return json({ error: 'fetch failed', product: null }, 422);
  }

  const parsed = parseProduct(html);
  if (!parsed.title) {
    // An unusable page is an ordinary outcome — paywalls, JS-only rendering, a
    // typo — so it is a 200 with a null product rather than an error. The add
    // flow degrades to "write it yourself" instead of showing a failure.
    return json({ product: null, reason: 'no product found' });
  }

  // --- upsert ---
  //
  // service_role, because upsert_product is SECURITY DEFINER and the catalogue
  // must not be writable directly by a signed-in user. This key exists only in
  // the function's environment; CI greps the client bundle for it.
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const host = new URL(target).hostname.replace(/^www\./, '');
  const { data: merchant } = await admin
    .from('merchants')
    .select('id, name')
    .contains('domains', [host])
    .maybeSingle();

  const { data: productId, error } = await admin.rpc('upsert_product', {
    p_title: parsed.title,
    p_source_url: target,
    p_merchant_id: merchant?.id ?? null,
    p_brand: parsed.brand,
    p_description: parsed.description,
    p_image_url: parsed.imageUrl,
    p_price_cents: parsed.priceCents,
    p_currency: parsed.currency ?? 'EUR',
    p_gtin: parsed.gtin,
  });

  if (error) {
    // The product was read successfully; only the catalogue write failed. Hand
    // back what was parsed so the user's add flow still works — a wish with no
    // product_id is a free-text wish, which is a supported shape.
    console.error('upsert_product failed', error);
    return json({
      product: {
        product_id: null,
        title: parsed.title,
        price_cents: parsed.priceCents,
        currency: parsed.currency ?? 'EUR',
        image_url: parsed.imageUrl,
        description: parsed.description,
        merchant: merchant?.name ?? host,
        source: `${host} · récupéré automatiquement`,
      },
    });
  }

  return json({
    product: {
      product_id: productId,
      title: parsed.title,
      price_cents: parsed.priceCents,
      currency: parsed.currency ?? 'EUR',
      image_url: parsed.imageUrl,
      description: parsed.description,
      merchant: merchant?.name ?? host,
      source: `${host} · récupéré automatiquement`,
    },
    // Which extractor won, so a bad catalogue row can be traced to its parser
    // months later without re-fetching the page.
    extracted_by: parsed.source,
  });
});
