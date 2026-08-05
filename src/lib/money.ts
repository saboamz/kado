/**
 * Money formatting.
 *
 * Amounts cross every boundary as integer cents plus a currency, and are
 * formatted only at the moment they are shown. The prototype stored formatted
 * strings ('1 599 €'), which meant a price could be displayed but never
 * summed, compared or converted — and meant POT_TOTAL had to be kept in sync
 * with a string by hand.
 *
 * Note the spaces Intl emits are U+202F and U+00A0, not ordinary ones. Tests
 * matching these strings need \s rather than a literal space.
 */
export function formatMoney(
  cents: number | null | undefined,
  currency = 'EUR',
  locale = 'fr-FR',
): string {
  if (cents == null) return '';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency || 'EUR',
    // Whole euros are the common case and the decimals are noise; show them
    // only when there actually are cents.
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}
