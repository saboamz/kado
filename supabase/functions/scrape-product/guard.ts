/**
 * Deciding whether a user-supplied URL is safe to fetch.
 *
 * This function runs inside the infrastructure, so "fetch whatever the user
 * pasted" is server-side request forgery: `http://169.254.169.254/` is the
 * cloud metadata endpoint, `http://localhost:5432` is the database, and both
 * are reachable from here and from nowhere the user can reach themselves.
 *
 * The rules are allow-list first (scheme, port), then deny-list on the
 * resolved address — because a hostname like `internal.example.com` can point
 * at 10.0.0.1, so checking the literal string is not enough.
 */

/** Only these. `file:`, `ftp:`, `gopher:` and `data:` are all attacks here. */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/** Merchant sites live on 80/443. Anything else is someone probing. */
const ALLOWED_PORTS = new Set(['', '80', '443']);

/** Adds a scheme when the user pasted a bare host, and strips the fragment. */
export function normaliseForFetch(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2048) return null;

  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (!ALLOWED_PROTOCOLS.has(u.protocol)) return null;
    if (!ALLOWED_PORTS.has(u.port)) return null;
    if (!u.hostname.includes('.')) return null; // bare words, and `localhost`
    u.hash = '';
    return u.toString();
  } catch {
    return null;
  }
}

/** True when the address is one the internet cannot route to. */
export function isPrivateAddress(ip: string): boolean {
  // IPv4
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = v4.slice(1).map(Number);
    return (
      a === 0 || // this network
      a === 10 || // private
      a === 127 || // loopback
      (a === 169 && b === 254) || // link-local, and the cloud metadata endpoint
      (a === 172 && b >= 16 && b <= 31) || // private
      (a === 192 && b === 168) || // private
      (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
      a >= 224 // multicast and reserved
    );
  }

  const v6 = ip.toLowerCase();
  return (
    v6 === '::' ||
    v6 === '::1' || // loopback
    v6.startsWith('fe80') || // link-local
    v6.startsWith('fc') || // unique local
    v6.startsWith('fd') ||
    // IPv4-mapped: ::ffff:169.254.169.254 must not slip past the v4 rules.
    (v6.startsWith('::ffff:') && isPrivateAddress(v6.slice(7)))
  );
}

/**
 * Resolves the hostname and rejects private targets.
 *
 * NOTE the limit: between this check and the fetch, DNS could change its
 * answer — the classic TOCTOU rebinding attack. Closing that properly means
 * pinning the resolved address for the connection, which Deno's fetch does not
 * expose. The residual risk is accepted here because the fetch response is
 * parsed for product metadata and never echoed back verbatim, so a successful
 * rebind yields the attacker a parse of a page they already control. If this
 * function ever starts returning raw response bodies, that calculus changes
 * and this comment is the reason to revisit.
 */
export async function isFetchableUrl(url: string): Promise<boolean> {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return false;
  }

  // A literal address needs no lookup, and Deno.resolveDns would reject it.
  if (/^[\d.]+$/.test(host) || host.includes(':')) {
    return !isPrivateAddress(host.replace(/^\[|\]$/g, ''));
  }

  try {
    const records = await Promise.allSettled([
      Deno.resolveDns(host, 'A'),
      Deno.resolveDns(host, 'AAAA'),
    ]);
    const addresses = records
      .filter((r): r is PromiseFulfilledResult<string[]> => r.status === 'fulfilled')
      .flatMap((r) => r.value);

    // No address is not "safe by default" — it is a name we cannot vet.
    if (addresses.length === 0) return false;

    // EVERY address must be public: a hostname with one public and one private
    // A record would otherwise pass and then connect to the private one.
    return addresses.every((ip) => !isPrivateAddress(ip));
  } catch {
    return false;
  }
}
