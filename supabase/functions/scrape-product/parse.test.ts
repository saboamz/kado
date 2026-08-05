import { describe, expect, it } from 'vitest';
import { parseProduct, parsePriceCents, metaContent } from './parse';
import { isPrivateAddress, normaliseForFetch } from './guard';

/**
 * The parser and the guard, tested as pure functions.
 *
 * These run under the app's own vitest rather than `deno test`, so they are in
 * the same CI job as everything else. Nothing here touches the network.
 */

describe('parsePriceCents', () => {
  it('reads plain decimals', () => {
    expect(parsePriceCents('279')).toBe(27900);
    expect(parsePriceCents('279.00')).toBe(27900);
    expect(parsePriceCents(279)).toBe(27900);
    expect(parsePriceCents(52.5)).toBe(5250);
  });

  it('reads French formatting', () => {
    expect(parsePriceCents('279,00 €')).toBe(27900);
    expect(parsePriceCents('1 599,00 €')).toBe(159900);
    // Narrow no-break space, which is what Intl and most French sites emit.
    expect(parsePriceCents('1 599,00 €')).toBe(159900);
  });

  it('reads English formatting', () => {
    expect(parsePriceCents('$1,599.00')).toBe(159900);
    expect(parsePriceCents('1,299.99')).toBe(129999);
  });

  /**
   * The 100x bug. '1.299' is one euro twenty-nine in one convention and one
   * thousand two hundred ninety-nine in another, and getting it wrong turns a
   * MacBook into a coffee. Three trailing digits with no other separator is
   * read as thousands, which is overwhelmingly the more common case on a price.
   */
  it('treats a lone three-digit group as thousands, not decimals', () => {
    expect(parsePriceCents('1.299')).toBe(129900);
    expect(parsePriceCents('1,299')).toBe(129900);
    // With a second separator the last one is unambiguous.
    expect(parsePriceCents('1.299,50')).toBe(129950);
    expect(parsePriceCents('1,299.50')).toBe(129950);
  });

  it('returns null rather than guessing', () => {
    expect(parsePriceCents(null)).toBeNull();
    expect(parsePriceCents('')).toBeNull();
    expect(parsePriceCents('sur devis')).toBeNull();
    // Four decimals is not a price.
    expect(parsePriceCents('1.29999')).toBeNull();
    // Neither is a number that large.
    expect(parsePriceCents('99999999')).toBeNull();
  });
});

describe('parseProduct', () => {
  it('prefers JSON-LD, and takes the GTIN with it', () => {
    const html = `<html><head>
      <meta property="og:title" content="Wrong title">
      <script type="application/ld+json">${JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: 'AirPods Pro 3',
        brand: { '@type': 'Brand', name: 'Apple' },
        gtin13: '0195949723001',
        image: 'https://cdn.example/airpods.jpg',
        description: 'Réduction de bruit active.',
        offers: { '@type': 'Offer', price: '279.00', priceCurrency: 'EUR' },
      })}</script></head><body></body></html>`;

    const p = parseProduct(html);
    expect(p.source).toBe('json-ld');
    expect(p.title).toBe('AirPods Pro 3');
    expect(p.brand).toBe('Apple');
    // The only globally unique key available, and the reason JSON-LD wins.
    expect(p.gtin).toBe('0195949723001');
    expect(p.priceCents).toBe(27900);
    expect(p.currency).toBe('EUR');
  });

  it('finds a Product inside a @graph wrapper', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@graph': [
        { '@type': 'WebSite', name: 'Boutique' },
        { '@type': 'Product', name: 'Cafetière Chemex 6 tasses' },
      ],
    })}</script>`;
    expect(parseProduct(html).title).toBe('Cafetière Chemex 6 tasses');
  });

  it('survives one malformed JSON-LD block among good ones', () => {
    // Merchants ship broken JSON-LD routinely; losing the whole page over it
    // would drop products that are otherwise perfectly readable.
    const html = `
      <script type="application/ld+json">{ this is not json }</script>
      <script type="application/ld+json">${JSON.stringify({
        '@type': 'Product',
        name: 'Vase en grès émaillé',
      })}</script>`;
    expect(parseProduct(html).title).toBe('Vase en grès émaillé');
  });

  it('falls back to Open Graph', () => {
    const html = `<meta property="og:title" content="Sac de randonnée 30 L">
      <meta property="og:description" content="Dos ventilé.">
      <meta property="product:price:amount" content="135.00">
      <meta property="product:price:currency" content="EUR">`;
    const p = parseProduct(html);
    expect(p.source).toBe('open-graph');
    expect(p.title).toBe('Sac de randonnée 30 L');
    expect(p.priceCents).toBe(13500);
  });

  it('reads meta tags whatever the attribute order', () => {
    expect(
      metaContent('<meta content="Titre" property="og:title">', 'og:title'),
    ).toBe('Titre');
  });

  it('decodes the entities that appear in French titles', () => {
    const html = `<meta property="og:title" content="Cafeti&egrave;re &amp; Th&eacute;i&egrave;re">`;
    expect(parseProduct(html).title).toBe('Cafetière & Théière');
  });

  it('strips the merchant name from a <title> fallback', () => {
    // The worst source for deduplication: "Product — Shop" and "Product | Shop"
    // are the same product, and keeping the suffix would fragment them.
    expect(parseProduct('<title>MacBook Air 15" M4 — Apple</title>').title).toBe(
      'MacBook Air 15" M4',
    );
    expect(parseProduct('<title>MacBook Air 15" M4 | Fnac</title>').title).toBe(
      'MacBook Air 15" M4',
    );
  });

  it('reports nothing found rather than inventing a title', () => {
    const p = parseProduct('<html><body><p>Rien ici</p></body></html>');
    expect(p.title).toBeNull();
    expect(p.source).toBe('none');
  });
});

describe('the SSRF guard', () => {
  it('accepts an ordinary merchant URL', () => {
    expect(normaliseForFetch('https://www.apple.com/fr/airpods')).toContain(
      'apple.com',
    );
    // A bare host is what people actually paste.
    expect(normaliseForFetch('apple.com/fr/airpods')).toMatch(/^https:\/\//);
  });

  it('rejects schemes that are attacks here', () => {
    expect(normaliseForFetch('file:///etc/passwd')).toBeNull();
    expect(normaliseForFetch('data:text/html,<h1>x')).toBeNull();
    expect(normaliseForFetch('gopher://x.com/')).toBeNull();
  });

  it('rejects non-web ports', () => {
    // Port scanning from inside the infrastructure.
    expect(normaliseForFetch('http://example.com:5432/')).toBeNull();
    expect(normaliseForFetch('http://example.com:6379/')).toBeNull();
    expect(normaliseForFetch('http://example.com:443/')).not.toBeNull();
  });

  it('rejects hosts with no dot, which includes localhost', () => {
    expect(normaliseForFetch('http://localhost/')).toBeNull();
    expect(normaliseForFetch('http://intranet/')).toBeNull();
  });

  it('knows which addresses the internet cannot route to', () => {
    // The one that matters most: the cloud metadata endpoint hands out
    // credentials to anything that can reach it.
    expect(isPrivateAddress('169.254.169.254')).toBe(true);
    expect(isPrivateAddress('127.0.0.1')).toBe(true);
    expect(isPrivateAddress('10.1.2.3')).toBe(true);
    expect(isPrivateAddress('172.16.0.1')).toBe(true);
    expect(isPrivateAddress('172.32.0.1')).toBe(false); // just outside the range
    expect(isPrivateAddress('192.168.1.1')).toBe(true);
    expect(isPrivateAddress('100.64.0.1')).toBe(true);
    expect(isPrivateAddress('::1')).toBe(true);
    expect(isPrivateAddress('fd00::1')).toBe(true);
    // IPv4-mapped IPv6 must not be a way around the v4 rules.
    expect(isPrivateAddress('::ffff:169.254.169.254')).toBe(true);
    expect(isPrivateAddress('93.184.216.34')).toBe(false);
  });
});
