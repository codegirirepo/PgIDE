import type { PgVectorHint } from '@/types';

// Common embedding model dimensions
export const EMBEDDING_MODELS: Record<string, { dims: number; desc: string }> = {
  'OpenAI text-embedding-3-small': { dims: 1536, desc: 'Default OpenAI embedding' },
  'OpenAI text-embedding-3-large': { dims: 3072, desc: 'High-quality OpenAI embedding' },
  'Cohere embed-english-v3': { dims: 1024, desc: 'Cohere English embedding' },
  'sentence-transformers/all-MiniLM-L6-v2': { dims: 384, desc: 'Fast, lightweight' },
  'sentence-transformers/all-mpnet-base-v2': { dims: 768, desc: 'Good quality/speed balance' },
  'BAAI/bge-large-en-v1.5': { dims: 1024, desc: 'High-quality open-source' },
  'Amazon Titan Embeddings V2': { dims: 1024, desc: 'AWS Bedrock embedding' },
};

export const DISTANCE_OPERATORS = [
  { op: '<->', name: 'L2 (Euclidean)', desc: 'Best for normalized vectors, general purpose', opclass: 'vector_l2_ops' },
  { op: '<=>', name: 'Cosine', desc: 'Most common for text embeddings, direction-based', opclass: 'vector_cosine_ops' },
  { op: '<#>', name: 'Inner Product', desc: 'Best for dot-product similarity (MaxSim)', opclass: 'vector_ip_ops' },
];

export const VECTOR_SNIPPETS = {
  createTable: `CREATE TABLE items (
  id bigserial PRIMARY KEY,
  content text,
  embedding vector(1536)  -- adjust dimensions for your model
);`,
  hnswIndex: `-- HNSW: best recall & performance, slower to build
CREATE INDEX ON items USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);`,
  ivfflatIndex: `-- IVFFlat: faster build, good for large datasets
CREATE INDEX ON items USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);  -- sqrt(row_count) is a good starting point`,
  similaritySearch: `-- Cosine similarity search (most common for embeddings)
SELECT id, content, embedding <=> '[...]' AS distance
FROM items
ORDER BY embedding <=> '[...]'
LIMIT 10;`,
  hybridSearch: `-- Hybrid: combine vector similarity + full-text search
SELECT id, content,
  (embedding <=> $1) * 0.7 + (1 - ts_rank(to_tsvector(content), plainto_tsquery($2))) * 0.3 AS score
FROM items
WHERE to_tsvector(content) @@ plainto_tsquery($2)
ORDER BY score
LIMIT 10;`,
  ragPattern: `-- RAG retrieval pattern
-- 1. Generate embedding for user query via your model API
-- 2. Find relevant context:
SELECT content FROM documents
ORDER BY embedding <=> $1  -- $1 = query embedding
LIMIT 5;
-- 3. Pass retrieved content + user query to LLM`,
  perfTuning: `-- Performance tuning for vector operations
SET maintenance_work_mem = '2GB';  -- for faster index builds
SET work_mem = '256MB';            -- for large vector queries
-- HNSW: increase ef_search for better recall (default 40)
SET hnsw.ef_search = 100;
-- IVFFlat: increase probes for better recall (default 1)
SET ivfflat.probes = 10;`,
};

// Client-side SQL analysis for instant feedback
export function analyzeSQL(sql: string): PgVectorHint[] {
  const hints: PgVectorHint[] = [];
  const upper = sql.toUpperCase();

  // Detect CREATE TABLE with vector columns
  if (/CREATE\s+TABLE/i.test(sql) && /\bvector\s*\(/i.test(sql)) {
    hints.push({
      type: 'info', category: 'extension',
      message: 'Ensure pgvector is installed: CREATE EXTENSION IF NOT EXISTS vector;',
      sql: 'CREATE EXTENSION IF NOT EXISTS vector;',
    });

    const dimMatch = sql.match(/vector\s*\(\s*(\d+)\s*\)/i);
    if (dimMatch) {
      const dims = parseInt(dimMatch[1], 10);
      const model = Object.entries(EMBEDDING_MODELS).find(([, v]) => v.dims === dims);
      if (model) {
        hints.push({ type: 'info', category: 'model', message: `Dimension ${dims} matches ${model[0]} (${model[1].desc}).` });
      }
      if (dims > 2000) {
        hints.push({ type: 'warning', category: 'dimensions', message: `${dims} dimensions is high. HNSW supports up to 2,000 by default. Consider dimensionality reduction or increasing max_dimensions.` });
      }
    }

    // Suggest adding an index after table creation
    const tableMatch = sql.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?(\w+)"?\.)?"?(\w+)"?/i);
    const colMatch = sql.match(/("?\w+"?)\s+vector\s*\(/i);
    if (tableMatch && colMatch) {
      const table = tableMatch[2];
      const col = colMatch[1].replace(/"/g, '');
      hints.push({
        type: 'suggestion', category: 'index',
        message: `Add an HNSW index for fast similarity search on "${col}".`,
        sql: `CREATE INDEX ON "${table}" USING hnsw ("${col}" vector_cosine_ops);`,
      });
    }
  }

  // Detect distance operators
  if (/<->|<#>|<=>/g.test(sql) && /SELECT/i.test(upper)) {
    if (/<->/.test(sql)) {
      hints.push({ type: 'info', category: 'operator', message: '<-> is L2/Euclidean distance. Use <=> for cosine distance (more common for text embeddings).' });
    }
    if (!upper.includes('LIMIT')) {
      hints.push({ type: 'warning', category: 'query', message: 'Vector similarity queries should include ORDER BY ... LIMIT N for index usage. Without LIMIT, the index cannot be used.' });
    }
    if (!upper.includes('ORDER BY')) {
      hints.push({ type: 'warning', category: 'query', message: 'Use ORDER BY with the distance operator to get nearest neighbors.' });
    }
  }

  // Detect CREATE INDEX for vector
  if (/CREATE\s+INDEX/i.test(sql) && /USING\s+(hnsw|ivfflat)/i.test(sql)) {
    const method = sql.match(/USING\s+(hnsw|ivfflat)/i)?.[1]?.toLowerCase();
    if (method === 'hnsw') {
      if (!/ef_construction/i.test(sql)) {
        hints.push({ type: 'suggestion', category: 'index', message: 'Consider setting ef_construction (default 64). Higher values = better recall but slower build. Example: WITH (m = 16, ef_construction = 200)' });
      }
      hints.push({ type: 'suggestion', category: 'performance', message: 'For faster HNSW index builds: SET maintenance_work_mem = \'2GB\';', sql: "SET maintenance_work_mem = '2GB';" });
    }
    if (method === 'ivfflat') {
      if (!/lists/i.test(sql)) {
        hints.push({ type: 'suggestion', category: 'index', message: 'Set lists parameter. Good starting point: sqrt(row_count). Example: WITH (lists = 100)' });
      }
    }
  }

  // Detect EXPLAIN on vector queries
  if (/EXPLAIN/i.test(upper) && /<->|<#>|<=>/g.test(sql)) {
    hints.push({ type: 'info', category: 'explain', message: 'If you see "Seq Scan" on a vector column, add an HNSW or IVFFlat index.' });
  }

  return hints;
}
