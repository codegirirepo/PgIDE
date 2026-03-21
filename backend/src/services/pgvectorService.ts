import { getPool } from './connectionManager.js';

export interface PgVectorStatus {
  installed: boolean;
  version: string | null;
  vectorColumns: VectorColumnInfo[];
  vectorIndexes: VectorIndexInfo[];
  hints: PgVectorHint[];
}

export interface VectorColumnInfo {
  schema: string;
  table: string;
  column: string;
  dimensions: number | null;
  hasIndex: boolean;
  rowEstimate: number;
  storageSetting: string | null;
}

export interface VectorIndexInfo {
  schema: string;
  table: string;
  indexName: string;
  indexMethod: string; // hnsw | ivfflat
  opclass: string;
  definition: string;
}

export interface PgVectorHint {
  type: 'info' | 'warning' | 'suggestion';
  category: string;
  message: string;
  sql?: string;
}

export async function getPgVectorStatus(connectionId: string): Promise<PgVectorStatus> {
  const pool = getPool(connectionId);
  if (!pool) throw new Error('Not connected');

  // Check if pgvector is installed
  const extRes = await pool.query(`
    SELECT extversion FROM pg_extension WHERE extname = 'vector'
  `);
  const installed = extRes.rows.length > 0;
  const version = installed ? extRes.rows[0].extversion : null;

  if (!installed) {
    return {
      installed: false, version: null, vectorColumns: [], vectorIndexes: [],
      hints: [{
        type: 'info', category: 'extension',
        message: 'pgvector is not installed. Install it to enable vector similarity search.',
        sql: 'CREATE EXTENSION vector;',
      }],
    };
  }

  // Get vector columns
  const colRes = await pool.query(`
    SELECT n.nspname AS schema, c.relname AS table, a.attname AS column,
           CASE WHEN a.atttypmod > 0 THEN a.atttypmod ELSE NULL END AS dimensions,
           c.reltuples::bigint AS row_estimate
    FROM pg_attribute a
    JOIN pg_class c ON a.attrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    JOIN pg_type t ON a.atttypid = t.oid
    WHERE t.typname = 'vector' AND a.attnum > 0 AND NOT a.attisdropped
      AND n.nspname NOT IN ('pg_catalog','information_schema')
    ORDER BY n.nspname, c.relname, a.attname
  `);

  // Get vector indexes
  const idxRes = await pool.query(`
    SELECT n.nspname AS schema, ct.relname AS table, ci.relname AS index_name,
           am.amname AS index_method, opc.opcname AS opclass,
           pg_get_indexdef(i.indexrelid) AS definition
    FROM pg_index i
    JOIN pg_class ci ON i.indexrelid = ci.oid
    JOIN pg_class ct ON i.indrelid = ct.oid
    JOIN pg_namespace n ON ct.relnamespace = n.oid
    JOIN pg_am am ON ci.relam = am.oid
    JOIN pg_opclass opc ON i.indclass[0] = opc.oid
    WHERE am.amname IN ('hnsw','ivfflat')
      AND n.nspname NOT IN ('pg_catalog','information_schema')
    ORDER BY n.nspname, ct.relname
  `);

  const indexedCols = new Set(
    idxRes.rows.map((r: any) => `${r.schema}.${r.table}`)
  );

  const vectorColumns: VectorColumnInfo[] = colRes.rows.map((r: any) => ({
    schema: r.schema, table: r.table, column: r.column,
    dimensions: r.dimensions, hasIndex: indexedCols.has(`${r.schema}.${r.table}`),
    rowEstimate: Number(r.row_estimate), storageSetting: null,
  }));

  const vectorIndexes: VectorIndexInfo[] = idxRes.rows.map((r: any) => ({
    schema: r.schema, table: r.table, indexName: r.index_name,
    indexMethod: r.index_method, opclass: r.opclass, definition: r.definition,
  }));

  // Generate hints
  const hints: PgVectorHint[] = [];

  for (const col of vectorColumns) {
    if (!col.hasIndex && col.rowEstimate > 1000) {
      hints.push({
        type: 'warning', category: 'index',
        message: `"${col.schema}"."${col.table}"."${col.column}" has ~${col.rowEstimate.toLocaleString()} rows but no vector index. Queries will use sequential scan.`,
        sql: `CREATE INDEX ON "${col.schema}"."${col.table}" USING hnsw ("${col.column}" vector_cosine_ops);`,
      });
    }
    if (col.dimensions && col.dimensions > 2000) {
      hints.push({
        type: 'warning', category: 'dimensions',
        message: `"${col.schema}"."${col.table}"."${col.column}" has ${col.dimensions} dimensions. High dimensions increase memory usage and reduce index performance.`,
      });
    }
    if (col.rowEstimate > 100_000_000) {
      hints.push({
        type: 'suggestion', category: 'scale',
        message: `"${col.schema}"."${col.table}" has ~${(col.rowEstimate / 1e6).toFixed(0)}M rows. Consider partitioning or Aurora PostgreSQL for billion-scale vector workloads.`,
      });
    }
  }

  return { installed, version, vectorColumns, vectorIndexes, hints };
}

// Analyze SQL for pgvector-specific suggestions
export function analyzeVectorSQL(sql: string): PgVectorHint[] {
  const hints: PgVectorHint[] = [];
  const upper = sql.toUpperCase();

  // Detect vector type usage without extension
  if (/\bVECTOR\s*\(/i.test(sql) && /CREATE\s+TABLE/i.test(upper)) {
    hints.push({
      type: 'info', category: 'extension',
      message: 'Ensure pgvector extension is installed before creating vector columns.',
      sql: 'CREATE EXTENSION IF NOT EXISTS vector;',
    });
  }

  // Detect distance operators without ORDER BY LIMIT pattern
  if (/<->|<#>|<=>/g.test(sql) && /SELECT/i.test(upper)) {
    if (!/LIMIT/i.test(upper)) {
      hints.push({
        type: 'suggestion', category: 'query',
        message: 'Vector similarity queries should use ORDER BY ... LIMIT N for efficient index usage.',
      });
    }
  }

  // Detect large vector dimensions in CREATE TABLE
  const dimMatch = sql.match(/vector\s*\(\s*(\d+)\s*\)/i);
  if (dimMatch) {
    const dims = parseInt(dimMatch[1], 10);
    if (dims > 2000) {
      hints.push({
        type: 'warning', category: 'dimensions',
        message: `${dims} dimensions is very high. Consider dimensionality reduction. HNSW indexes support up to 2,000 dimensions by default.`,
      });
    }
  }

  // Suggest work_mem for vector operations
  if (/<->|<#>|<=>/g.test(sql) && upper.includes('ORDER BY')) {
    hints.push({
      type: 'suggestion', category: 'performance',
      message: 'For large vector operations, consider: SET work_mem = \'256MB\'; before your query.',
    });
  }

  return hints;
}
