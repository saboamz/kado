/**
 * Turning a merchant page into a catalogue row.
 *
 * Kept separate from index.ts so it can be tested without a Deno server or a
 * network: everything here is a pure function over an HTML string.
 *
 * The quality of this file caps the quality of collaborative filtering. Two
 * people wanting the same thing only becomes a signal if it resolves to the
 * same product row, so a parser that returns slightly different titles for the
 * same SKU fragments the catalogue and starves the model — and it looks like a
 * model problem, months later, when it is a parsing problem today.
 */

export type ParsedProduct = {
  title: string | null;
  brand: string | null;
  description: string | null;
  imageUrl: string | null;
  priceCents: number | null;
  currency: string | null;
  gtin: string | null;
  /** Which extractor won, for debugging a bad row later. */
  source: 'json-ld' | 'open-graph' | 'microdata' | 'html' | 'none';
};

/** Decodes the handful of entities that actually show up in product titles. */
export function decodeEntities(s: string): string {
  const named: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    eacute: 'é',
    egrave: 'è',
    ecirc: 'ê',
    agrave: 'à',
    ccedil: 'ç',
    ugrave: 'ù',
    ocirc: 'ô',
    icirc: 'î',
    euro: '€',
  };
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => named[name.toLowerCase()] ?? m);
}

const clean = (s: string | null | undefined): string | null => {
  if (!s) return null;
  const out = decodeEntities(s).replace(/\s+/g, ' ').trim();
  return out || null;
};

/**
 * Parses a price into integer cents.
 *
 * The hard part is that '1.299' is one thousand two hundred ninety-nine euros
 * in German and one euro twenty-nine in English. The rule used here: whichever
 * of `.` or `,` appears LAST is the decimal separator, and a separator
 * followed by exactly three digits with no other separator is a thousands
 * group. Getting this wrong by 100x is worse than returning null, so anything
 * ambiguous returns null rather than a guess.
 */
export function parsePriceCents(raw: string | number | null): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? Math.round(raw * 100) : null;
  }

  // \u00a0 and \u202f are the no-break and narrow no-break spaces French
  // prices use as thousands separators. Written as escapes rather than pasted
  // literals: they are invisible in a diff, and a linter is right to flag one.
  const text = String(raw).replace(/[\s\u00a0\u202f]/g, '');
  const digits = text.replace(/[^0-9.,]/g, '');
  if (!digits) return null;

  const lastDot = digits.lastIndexOf('.');
  const lastComma = digits.lastIndexOf(',');
  const lastSep = Math.max(lastDot, lastComma);

  let normalised: string;
  if (lastSep === -1) {
    normalised = digits;
  } else {
    const tail = digits.slice(lastSep + 1);
    // Exactly three trailing digits with no other separator is ambiguous
    // ('1.299'), and the thousands reading is far more common on a price.
    const onlySeparator =
      digits.indexOf('.') === lastDot && digits.indexOf(',') === lastComma;
    if (tail.length === 3 && onlySeparator) {
      normalised = digits.replace(/[.,]/g, '');
    } else if (tail.length > 2) {
      // Four or more decimals is not a price.
      return null;
    } else {
      normalised = digits.slice(0, lastSep).replace(/[.,]/g, '') + '.' + tail;
    }
  }

  const value = Number(normalised);
  if (!Number.isFinite(value) || value < 0) return null;
  // A price over a million euros is a parse error, not a product.
  if (value > 1_000_000) return null;
  return Math.round(value * 100);
}

/** Every <script type="application/ld+json"> block, parsed and flattened. */
function jsonLdNodes(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const re =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  for (const match of html.matchAll(re)) {
    try {
      const parsed = JSON.parse(match[1].trim());
      // A block may be one node, an array, or a @graph wrapper.
      const nodes = Array.isArray(parsed)
        ? parsed
        : Array.isArray((parsed as { '@graph'?: unknown[] })['@graph'])
          ? ((parsed as { '@graph': unknown[] })['@graph'] as unknown[])
          : [parsed];
      for (const n of nodes) {
        if (n && typeof n === 'object') out.push(n as Record<string, unknown>);
      }
    } catch {
      // Merchants ship malformed JSON-LD routinely; one bad block must not
      // lose the good ones.
      continue;
    }
  }
  return out;
}

const typeOf = (node: Record<string, unknown>): string[] => {
  const t = node['@type'];
  return (Array.isArray(t) ? t : [t]).filter(Boolean).map(String);
};

function firstOffer(node: Record<string, unknown>): Record<string, unknown> | null {
  const offers = node.offers;
  if (!offers) return null;
  const list = Array.isArray(offers) ? offers : [offers];
  return (list.find((o) => o && typeof o === 'object') ??
    null) as Record<string, unknown> | null;
}

/** `<meta property="og:x" content="y">`, either attribute order. */
export function metaContent(html: string, key: string): string | null {
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${esc}["'][^>]+content=["']([^"']*)["']`,
      'i',
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${esc}["']`,
      'i',
    ),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return clean(m[1]);
  }
  return null;
}

/**
 * Extracts a product, preferring the most structured source available.
 *
 * Order matters: JSON-LD is authored for machines and carries a GTIN, which is
 * the only globally unique key we get. Open Graph is nearly universal but
 * carries no identity. The <title> tag is the last resort and the worst for
 * deduplication, since it usually has the merchant name glued on.
 */
export function parseProduct(html: string): ParsedProduct {
  const empty: ParsedProduct = {
    title: null,
    brand: null,
    description: null,
    imageUrl: null,
    priceCents: null,
    currency: null,
    gtin: null,
    source: 'none',
  };

  // --- JSON-LD ---
  const product = jsonLdNodes(html).find((n) =>
    typeOf(n).some((t) => t.endsWith('Product')),
  );

  if (product) {
    const offer = firstOffer(product);
    const brandNode = product.brand;
    const brand =
      typeof brandNode === 'string'
        ? brandNode
        : brandNode && typeof brandNode === 'object'
          ? String((brandNode as { name?: unknown }).name ?? '')
          : null;

    const image = Array.isArray(product.image)
      ? product.image[0]
      : product.image;

    return {
      title: clean(String(product.name ?? '')),
      brand: clean(brand),
      description: clean(String(product.description ?? '')),
      imageUrl:
        clean(
          typeof image === 'string'
            ? image
            : ((image as { url?: string } | undefined)?.url ?? ''),
        ) ?? null,
      priceCents: parsePriceCents(
        (offer?.price as string | number | undefined) ??
          (offer?.lowPrice as string | number | undefined) ??
          null,
      ),
      currency: clean(String(offer?.priceCurrency ?? '')) ?? null,
      // gtin13 is the European EAN; the bare `gtin` field is newer.
      gtin:
        clean(
          String(
            product.gtin13 ?? product.gtin ?? product.gtin12 ?? product.ean ?? '',
          ),
        ) ?? null,
      source: 'json-ld',
    };
  }

  // --- Open Graph ---
  const ogTitle = metaContent(html, 'og:title');
  if (ogTitle) {
    return {
      ...empty,
      title: ogTitle,
      brand: metaContent(html, 'og:site_name'),
      description: metaContent(html, 'og:description'),
      imageUrl: metaContent(html, 'og:image'),
      priceCents: parsePriceCents(
        metaContent(html, 'product:price:amount') ??
          metaContent(html, 'og:price:amount'),
      ),
      currency:
        metaContent(html, 'product:price:currency') ??
        metaContent(html, 'og:price:currency'),
      source: 'open-graph',
    };
  }

  // --- microdata ---
  const itempropName = html.match(
    /itemprop=["']name["'][^>]*>([^<]{2,200})</i,
  );
  if (itempropName) {
    return {
      ...empty,
      title: clean(itempropName[1]),
      priceCents: parsePriceCents(
        html.match(/itemprop=["']price["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
          null,
      ),
      source: 'microdata',
    };
  }

  // --- <title> ---
  const titleTag = html.match(/<title[^>]*>([\s\S]{1,300}?)<\/title>/i);
  if (titleTag) {
    // Merchant titles are usually "Product — Brand" or "Product | Shop".
    // Taking the first segment is a guess, and a guess is exactly why this is
    // the last resort: it is the shape most likely to fragment the catalogue.
    const raw = clean(titleTag[1]) ?? '';
    const first = raw.split(/\s+[|–—·]\s+/)[0];
    return { ...empty, title: first || raw || null, source: 'html' };
  }

  return empty;
}
