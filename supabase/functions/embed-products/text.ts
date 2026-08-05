/**
 * Building the text a product gets embedded from.
 *
 * Kept pure and separate so it can be tested without a model or a network.
 *
 * What goes into this string decides what "similar" means. Too little and
 * every product in a category collapses together; too much — a full marketing
 * description — and the signal drowns in adjectives that every listing shares
 * ("qualité premium", "livraison rapide").
 */

export type EmbeddableProduct = {
  title: string;
  brand?: string | null;
  category?: string | null;
  tags?: string[] | null;
  description?: string | null;
};

/** Marketing filler that appears on every listing and distinguishes nothing. */
const BOILERPLATE = [
  /livraison (gratuite|rapide|offerte)/gi,
  /garantie \d+ ans?/gi,
  /qualit[ée] (premium|sup[ée]rieure)/gi,
  /meilleur prix/gi,
  /en stock/gi,
  /satisfait ou rembours[ée]/gi,
  /paiement s[ée]curis[ée]/gi,
];

/**
 * Composes the embedding input.
 *
 * Order matters more than it looks: sentence encoders weight earlier tokens
 * slightly higher, and the title is the part that actually identifies the
 * product. The description comes last and is truncated, because a 2 000-word
 * page would otherwise dominate a 4-word title.
 */
export function embeddingText(p: EmbeddableProduct): string {
  const parts: string[] = [p.title.trim()];

  if (p.brand?.trim()) parts.push(p.brand.trim());
  if (p.category?.trim()) parts.push(p.category.trim());

  const tags = (p.tags ?? []).filter(Boolean).slice(0, 6);
  if (tags.length) parts.push(tags.join(', '));

  if (p.description?.trim()) {
    let desc = p.description;
    for (const re of BOILERPLATE) desc = desc.replace(re, ' ');
    desc = desc.replace(/\s+/g, ' ').trim();
    // 300 characters is roughly two sentences: enough to say what the thing
    // is, not enough to bury the title.
    if (desc) parts.push(desc.slice(0, 300));
  }

  return parts.join(' · ');
}

/**
 * Which products need embedding.
 *
 * A product needs one when it has none, OR when the model that produced its
 * vector is not the model in use. Vectors from different models occupy
 * different spaces: cosine distance between them is not merely inaccurate, it
 * is meaningless, and it degrades silently rather than erroring.
 */
export function needsEmbedding(
  row: { embedding: unknown; embedding_model: string | null },
  currentModel: string,
): boolean {
  return row.embedding == null || row.embedding_model !== currentModel;
}

/** L2 normalisation, so cosine similarity is a plain dot product. */
export function normalise(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  // A zero vector cannot be normalised; returning it unchanged keeps it
  // harmless — it is equidistant from everything rather than infinite.
  if (norm === 0) return v;
  return v.map((x) => x / norm);
}
