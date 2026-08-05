import { createClient } from 'jsr:@supabase/supabase-js@2';
import { embeddingText, normalise } from './text.ts';

/**
 * Embeds products that have no vector, or a vector from an older model.
 *
 * Runs as a cron job over a batch rather than per-product on insert. Embedding
 * one product per invocation would make ingesting a real catalogue take days,
 * and a synchronous embed inside the scrape path would make adding a wish wait
 * on a model.
 *
 * THE MODEL MUST BE MULTILINGUAL. The catalogue is French: "Cafetière Chemex",
 * "Vase en grès émaillé", "Sac de randonnée". An English-only encoder maps
 * those to noise, and the failure is silent — recommendations get subtly worse
 * with nothing in the logs to say why.
 */

const MODEL = Deno.env.get('EMBEDDING_MODEL') ?? 'multilingual-e5-small';
const BATCH = Number(Deno.env.get('EMBED_BATCH') ?? 100);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

/**
 * Calls the embedding provider.
 *
 * Isolated so the provider can be swapped without touching the batching, and
 * so a change of provider is a change of one function rather than a rewrite.
 */
async function embed(texts: string[]): Promise<number[][]> {
  const endpoint = Deno.env.get('EMBEDDING_ENDPOINT');
  const key = Deno.env.get('EMBEDDING_API_KEY');
  if (!endpoint || !key) throw new Error('embedding provider not configured');

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ model: MODEL, input: texts }),
  });

  if (!res.ok) {
    throw new Error(`embedding provider returned ${res.status}`);
  }

  const body = await res.json();
  const vectors: number[][] = body.data?.map(
    (d: { embedding: number[] }) => d.embedding,
  );

  if (!Array.isArray(vectors) || vectors.length !== texts.length) {
    // A partial response would silently pair vectors with the wrong products,
    // which is worse than no embeddings at all: every recommendation would be
    // confidently wrong.
    throw new Error(
      `expected ${texts.length} vectors, got ${vectors?.length ?? 0}`,
    );
  }
  return vectors;
}

Deno.serve(async (req: Request) => {
  // Cron-invoked, so it authenticates with the service role rather than a user
  // session.
  const auth = req.headers.get('Authorization');
  if (auth !== `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`) {
    return json({ error: 'unauthorized' }, 401);
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  // Products with no vector, or one from a different model. The `or` covers
  // both in a single scan.
  const { data: rows, error } = await admin
    .from('products')
    .select('id, title, brand, description, category_id, embedding_model')
    .eq('status', 'active')
    .or(`embedding.is.null,embedding_model.neq.${MODEL}`)
    .limit(BATCH);

  if (error) return json({ error: error.message }, 500);
  if (!rows?.length) return json({ embedded: 0, model: MODEL });

  // Category labels and tags, fetched once for the batch rather than per row.
  const categoryIds = [...new Set(rows.map((r) => r.category_id).filter(Boolean))];
  const { data: categories } = categoryIds.length
    ? await admin.from('categories').select('id, label_fr').in('id', categoryIds)
    : { data: [] };
  const categoryLabel = new Map(
    (categories ?? []).map((c) => [c.id, c.label_fr]),
  );

  const texts = rows.map((r) =>
    embeddingText({
      title: r.title,
      brand: r.brand,
      category: r.category_id ? categoryLabel.get(r.category_id) : null,
      description: r.description,
    }),
  );

  let vectors: number[][];
  try {
    vectors = await embed(texts);
  } catch (e) {
    return json({ error: String(e), embedded: 0 }, 502);
  }

  // Written one row at a time rather than as a bulk upsert: an upsert on
  // products would need every column, and getting that wrong would overwrite a
  // title or a price with a stale value from this function's narrow select.
  let embedded = 0;
  for (let i = 0; i < rows.length; i++) {
    const { error: upErr } = await admin
      .from('products')
      .update({
        embedding: normalise(vectors[i]),
        embedding_model: MODEL,
      })
      .eq('id', rows[i].id);
    if (!upErr) embedded++;
  }

  return json({
    embedded,
    remaining_hint: rows.length === BATCH ? 'more likely pending' : 'batch drained',
    model: MODEL,
  });
});
