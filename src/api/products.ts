import { supabase } from '../lib/supabase';

/**
 * Product ingestion.
 *
 * Pasting a link is how the catalogue gets built, and the catalogue is what
 * makes collaborative filtering possible at all: two people wanting the same
 * thing only becomes a signal if it resolves to the same row. So this boundary
 * matters more than it looks — a scraper that produces three rows for one SKU
 * caps recommendation quality before a single model is written.
 *
 * The actual scraping (Open Graph, JSON-LD, schema.org Product) runs in an
 * Edge Function in P7. This is the client's half of that call.
 */

export type ScrapedProduct = {
  /** Null when the page yielded nothing usable — the caller should fall back
   *  to a free-text wish rather than inventing a product. */
  product_id: string | null;
  title: string;
  price_cents: number | null;
  currency: string;
  image_url: string | null;
  description: string | null;
  merchant: string | null;
  /** Where the data came from, shown to the user so they can sanity-check it. */
  source: string;
};

/**
 * Fetch and normalise a product page.
 *
 * Deliberately returns rather than throws on an unusable page: a link that
 * cannot be scraped is an ordinary outcome (paywalls, JS-only pages, a typo),
 * and the add flow should degrade to "write it yourself" instead of showing an
 * error. Genuine failures — network, function down — still throw.
 */
export async function scrapeUrl(url: string): Promise<ScrapedProduct> {
  const { data, error } = await supabase.functions.invoke<{
    product: ScrapedProduct | null;
    extracted_by?: string;
  }>('scrape-product', { body: { url } });

  if (error) throw error;
  // A readable page with no product in it is not an error — see above — but
  // the caller still needs to be told, so it throws and the screen offers the
  // free-text path. The distinction that matters is that the SERVER answered.
  if (!data?.product) throw new Error('no product found');
  return data.product;
}

/** Normalises a URL enough to reject obvious nonsense before a round trip. */
export function looksLikeUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const u = new URL(
      trimmed.startsWith('http') ? trimmed : `https://${trimmed}`,
    );
    // A bare word parses as a URL with no dot in the host; require one.
    return u.hostname.includes('.');
  } catch {
    return false;
  }
}
