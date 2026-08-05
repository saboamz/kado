import { describe, expect, it } from 'vitest';
import { embeddingText, needsEmbedding, normalise } from './text';

/**
 * What a product gets embedded from decides what "similar" means, so these
 * assert the composition rather than the model.
 */

describe('embeddingText', () => {
  it('leads with the title', () => {
    // Sentence encoders weight earlier tokens slightly higher, and the title
    // is the part that identifies the product.
    const t = embeddingText({ title: 'Cafetière Chemex 6 tasses', brand: 'Chemex' });
    expect(t.startsWith('Cafetière Chemex 6 tasses')).toBe(true);
  });

  it('includes brand, category and tags', () => {
    const t = embeddingText({
      title: 'Vase en grès émaillé',
      brand: 'Atelier',
      category: 'Maison',
      tags: ['céramique', 'artisanal'],
    });
    expect(t).toContain('Atelier');
    expect(t).toContain('Maison');
    expect(t).toContain('céramique');
  });

  it('strips marketing boilerplate', () => {
    // Every listing says "livraison gratuite"; a phrase shared by the whole
    // catalogue distinguishes nothing and dilutes the parts that do.
    const t = embeddingText({
      title: 'Sac de randonnée 30 L',
      description: 'Dos ventilé. Livraison gratuite. Garantie 2 ans. Satisfait ou remboursé.',
    });
    expect(t).toContain('Dos ventilé');
    expect(t.toLowerCase()).not.toContain('livraison gratuite');
    expect(t.toLowerCase()).not.toContain('garantie 2 ans');
  });

  it('truncates the description so it cannot bury the title', () => {
    const t = embeddingText({
      title: 'Produit',
      description: 'x'.repeat(2000),
    });
    expect(t.length).toBeLessThan(400);
  });

  it('works from a title alone', () => {
    expect(embeddingText({ title: 'Week-end en Islande' })).toBe(
      'Week-end en Islande',
    );
  });

  it('caps the number of tags', () => {
    const t = embeddingText({
      title: 'P',
      tags: Array.from({ length: 20 }, (_, i) => `tag${i}`),
    });
    expect(t).not.toContain('tag9');
  });
});

describe('needsEmbedding', () => {
  const MODEL = 'multilingual-e5-small';

  it('embeds a product that has none', () => {
    expect(
      needsEmbedding({ embedding: null, embedding_model: null }, MODEL),
    ).toBe(true);
  });

  it('re-embeds a vector from a different model', () => {
    // Vectors from different models occupy different spaces: cosine distance
    // between them is meaningless rather than merely inaccurate, and it
    // degrades silently.
    expect(
      needsEmbedding({ embedding: [0.1], embedding_model: 'ada-002' }, MODEL),
    ).toBe(true);
  });

  it('leaves a current vector alone', () => {
    expect(
      needsEmbedding({ embedding: [0.1], embedding_model: MODEL }, MODEL),
    ).toBe(false);
  });
});

describe('normalise', () => {
  it('produces a unit vector', () => {
    const v = normalise([3, 4]);
    expect(Math.hypot(...v)).toBeCloseTo(1);
  });

  it('leaves a zero vector alone rather than dividing by zero', () => {
    // Unnormalisable, but harmless: equidistant from everything rather than
    // full of NaN, which would poison every comparison it touched.
    expect(normalise([0, 0, 0])).toEqual([0, 0, 0]);
  });
});
