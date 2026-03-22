import { getPool } from './connectionManager.js';

// ─── Plan History (in-memory) ───
interface PlanHistoryEntry {
  id: string;
  connectionId: string;
  sql: string;
  plan: any;
  settings?: Record<string, string>;
  timestamp: number;
}
const planHistory: PlanHistoryEntry[] = [];

// ─── 1. EXPLAIN ANALYZER ───
export async function getExplainPlan(connectionId: string, sql: string) {
  const pool = getPool(connectionId);
  if (!pool) throw new Error('Not connected');
  const cleanSql = sql.replace(/;\s*$/, '').trim();
  const res = await pool.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${cleanSql}`);
  return res.rows[0]['QUERY PLAN'];
}

// ─── EXPLAIN with custom GUC settings ───
export async function getExplainWithSettings(
  connectionId: string, sql: string, settings: Record<string, string>
) {
  const pool = getPool(connectionId);
  if (!pool) throw new Error('Not connected');
  const client = await pool.connect();
  try {
    const allowed = ['work_mem', 'random_page_cost', 'seq_page_cost', 'effective_cache_size',
      'enable_seqscan', 'enable_indexscan', 'enable_hashjoin', 'enable_mergejoin',
      'enable_nestloop', 'enable_sort', 'enable_hashagg', 'enable_material',
      'parallel_tuple_cost', 'parallel_setup_cost', 'max_parallel_workers_per_gather'];
    for (const [k, v] of Object.entries(settings)) {
      if (allowed.includes(k)) await client.query(`SET LOCAL ${k} = '${v.replace(/'/g, "''")}'`);
    }
    const cleanSql = sql.replace(/;\s*$/, '').trim();
    const res = await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${cleanSql}`);
    await client.query('RESET ALL');
    return res.rows[0]['QUERY PLAN'];
  } finally {
    client.release();
  }
}

// ─── Plan History ───
export function savePlanToHistory(connectionId: string, sql: string, plan: any, settings?: Record<string, string>) {
  const entry: PlanHistoryEntry = {
    id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    connectionId, sql, plan, settings, timestamp: Date.now(),
  };
  planHistory.unshift(entry);
  if (planHistory.length > 100) planHistory.length = 100;
  return entry;
}

export function getPlanHistory(connectionId?: string) {
  return connectionId ? planHistory.filter(p => p.connectionId === connectionId) : planHistory;
}

export function clearPlanHistory() {
  planHistory.length = 0;
}

// ─── 2. INDEX ADVISOR ───
export async function getIndexAdvice(connectionId: string, sql: string) {
  const pool = getPool(connectionId);
  if (!pool) throw new Error('Not connected');
  const cleanSql = sql.replace(/;\s*$/, '').trim();
  const planRes = await pool.query(`EXPLAIN (FORMAT JSON) ${cleanSql}`);
  const plan = planRes.rows[0]['QUERY PLAN'];

  const suggestions: { table: string; columns: string[]; reason: string; createSql: string }[] = [];
  const visited = new Set<string>();

  function walk(node: any) {
    if (!node) return;
    if (node['Node Type'] === 'Seq Scan' && node['Relation Name']) {
      const table = node['Relation Name'];
      const schema = node['Schema'] || 'public';
      const alias = node['Alias'] || table;
      const filterCols: string[] = [];

      const filter = node['Filter'] || '';
      const matches = filter.match(/\((\w+)\./g) || filter.match(/(\w+)\s*[=<>!]/g) || [];
      for (const m of matches) {
        const col = m.replace(/[().\s=<>!]/g, '');
        if (col && col !== alias && col !== table) filterCols.push(col);
      }

      const rows = node['Plan Rows'] || 0;
      if (rows > 100 || filterCols.length > 0) {
        const key = `${schema}.${table}.${filterCols.sort().join(',')}`;
        if (!visited.has(key)) {
          visited.add(key);
          const idxCols = filterCols.length > 0 ? filterCols : ['<column>'];
          const idxName = `idx_${table}_${idxCols.join('_')}`.substring(0, 63);
          suggestions.push({
            table: `"${schema}"."${table}"`,
            columns: idxCols,
            reason: `Sequential scan on ${table} (est. ${rows} rows)${filterCols.length ? ` with filter on ${filterCols.join(', ')}` : ''}`,
            createSql: `CREATE INDEX ${idxName} ON "${schema}"."${table}" (${idxCols.map(c => `"${c}"`).join(', ')});`,
          });
        }
      }
    }
    if (node['Plans']) node['Plans'].forEach(walk);
  }

  if (Array.isArray(plan)) plan.forEach((p: any) => walk(p.Plan || p));
  else walk(plan?.Plan || plan);

  return { plan, suggestions };
}

// ─── 3. TABLE STATS DASHBOARD ───
export async function getTableStats(connectionId: string) {
  const pool = getPool(connectionId);
  if (!pool) throw new Error('Not connected');
  const res = await pool.query(`
    SELECT
      schemaname AS schema,
      relname AS table,
      n_live_tup AS live_rows,
      n_dead_tup AS dead_rows,
      CASE WHEN n_live_tup > 0 THEN round(100.0 * n_dead_tup / (n_live_tup + n_dead_tup), 1) ELSE 0 END AS dead_pct,
      last_vacuum,
      last_autovacuum,
      last_analyze,
      last_autoanalyze,
      seq_scan,
      idx_scan,
      CASE WHEN (seq_scan + COALESCE(idx_scan, 0)) > 0
        THEN round(100.0 * COALESCE(idx_scan, 0) / (seq_scan + COALESCE(idx_scan, 0)), 1)
        ELSE 0 END AS idx_hit_pct,
      pg_total_relation_size(quote_ident(schemaname)||'.'||quote_ident(relname)) AS total_size
    FROM pg_stat_user_tables
    ORDER BY n_dead_tup DESC
  `);

  // Cache hit ratio
  const cacheRes = await pool.query(`
    SELECT
      sum(heap_blks_hit) AS hit,
      sum(heap_blks_read) AS read,
      CASE WHEN sum(heap_blks_hit) + sum(heap_blks_read) > 0
        THEN round(100.0 * sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read)), 2)
        ELSE 0 END AS cache_hit_ratio
    FROM pg_statio_user_tables
  `);

  return {
    tables: res.rows,
    cacheHitRatio: cacheRes.rows[0]?.cache_hit_ratio || 0,
  };
}

// ─── 4. SCHEMA DIFF ───
export async function getSchemaDiff(connId1: string, connId2: string) {
  const pool1 = getPool(connId1);
  const pool2 = getPool(connId2);
  if (!pool1 || !pool2) throw new Error('Both connections must be active');

  const schemaQuery = `
    SELECT table_schema AS schema, table_name AS name, column_name, data_type,
           is_nullable, column_default, character_maximum_length
    FROM information_schema.columns
    WHERE table_schema NOT IN ('pg_catalog','information_schema','pg_toast')
    ORDER BY table_schema, table_name, ordinal_position
  `;

  const [r1, r2] = await Promise.all([pool1.query(schemaQuery), pool2.query(schemaQuery)]);

  // Build maps: schema.table -> columns
  const buildMap = (rows: any[]) => {
    const m = new Map<string, Map<string, any>>();
    for (const r of rows) {
      const key = `${r.schema}.${r.name}`;
      if (!m.has(key)) m.set(key, new Map());
      m.get(key)!.set(r.column_name, r);
    }
    return m;
  };

  const map1 = buildMap(r1.rows);
  const map2 = buildMap(r2.rows);
  const allTables = new Set([...map1.keys(), ...map2.keys()]);

  const diffs: {
    table: string;
    status: 'added' | 'removed' | 'modified';
    details: { column: string; change: string }[];
  }[] = [];

  for (const table of allTables) {
    const cols1 = map1.get(table);
    const cols2 = map2.get(table);

    if (!cols1) {
      diffs.push({ table, status: 'added', details: [{ column: '*', change: 'Table exists only in target' }] });
      continue;
    }
    if (!cols2) {
      diffs.push({ table, status: 'removed', details: [{ column: '*', change: 'Table exists only in source' }] });
      continue;
    }

    const details: { column: string; change: string }[] = [];
    const allCols = new Set([...cols1.keys(), ...cols2.keys()]);
    for (const col of allCols) {
      const c1 = cols1.get(col);
      const c2 = cols2.get(col);
      if (!c1) { details.push({ column: col, change: 'Column only in target' }); continue; }
      if (!c2) { details.push({ column: col, change: 'Column only in source' }); continue; }
      const changes: string[] = [];
      if (c1.data_type !== c2.data_type) changes.push(`type: ${c1.data_type} → ${c2.data_type}`);
      if (c1.is_nullable !== c2.is_nullable) changes.push(`nullable: ${c1.is_nullable} → ${c2.is_nullable}`);
      if (c1.column_default !== c2.column_default) changes.push(`default: ${c1.column_default || 'null'} → ${c2.column_default || 'null'}`);
      if (changes.length) details.push({ column: col, change: changes.join('; ') });
    }
    if (details.length) diffs.push({ table, status: 'modified', details });
  }

  return diffs;
}

// ─── 5. MIGRATION GENERATOR ───
export async function generateMigration(connId1: string, connId2: string) {
  const diffs = await getSchemaDiff(connId1, connId2);
  const statements: string[] = [];

  for (const diff of diffs) {
    const [schema, table] = diff.table.includes('.') ? diff.table.split('.') : ['public', diff.table];
    if (diff.status === 'removed') {
      statements.push(`-- Table "${schema}"."${table}" exists only in source\n-- DROP TABLE IF EXISTS "${schema}"."${table}";`);
    } else if (diff.status === 'added') {
      statements.push(`-- Table "${schema}"."${table}" exists only in target — needs CREATE TABLE`);
    } else {
      for (const d of diff.details) {
        if (d.change.includes('only in target')) {
          statements.push(`-- ALTER TABLE "${schema}"."${table}" ADD COLUMN "${d.column}" <type>;`);
        } else if (d.change.includes('only in source')) {
          statements.push(`-- ALTER TABLE "${schema}"."${table}" DROP COLUMN "${d.column}";`);
        } else if (d.change.includes('type:')) {
          const match = d.change.match(/type: (\S+) → (\S+)/);
          if (match) {
            statements.push(`ALTER TABLE "${schema}"."${table}" ALTER COLUMN "${d.column}" TYPE ${match[2]};`);
          }
        } else if (d.change.includes('nullable:')) {
          const toNotNull = d.change.includes('→ NO');
          statements.push(`ALTER TABLE "${schema}"."${table}" ALTER COLUMN "${d.column}" ${toNotNull ? 'SET NOT NULL' : 'DROP NOT NULL'};`);
        }
      }
    }
  }

  return { diffs, sql: statements.join('\n') };
}

// ─── 6. pg_stat_statements ───
export async function getSlowQueries(connectionId: string) {
  const pool = getPool(connectionId);
  if (!pool) throw new Error('Not connected');

  // Check if extension exists
  try {
    const check = await pool.query(`SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements'`);
    if (check.rows.length === 0) {
      return { available: false, queries: [], message: 'pg_stat_statements extension is not installed. Run: CREATE EXTENSION pg_stat_statements;' };
    }
  } catch {
    return { available: false, queries: [], message: 'Cannot check pg_stat_statements availability' };
  }

  try {
    const res = await pool.query(`
      SELECT
        queryid,
        query,
        calls,
        round(total_exec_time::numeric, 2) AS total_time_ms,
        round(mean_exec_time::numeric, 2) AS avg_time_ms,
        round(min_exec_time::numeric, 2) AS min_time_ms,
        round(max_exec_time::numeric, 2) AS max_time_ms,
        rows,
        shared_blks_hit,
        shared_blks_read,
        CASE WHEN shared_blks_hit + shared_blks_read > 0
          THEN round(100.0 * shared_blks_hit / (shared_blks_hit + shared_blks_read), 1)
          ELSE 0 END AS cache_hit_pct
      FROM pg_stat_statements
      WHERE query NOT LIKE '%pg_stat_statements%'
      ORDER BY total_exec_time DESC
      LIMIT 50
    `);
    return { available: true, queries: res.rows };
  } catch (e: any) {
    // Fallback for older PG versions with different column names
    try {
      const res = await pool.query(`
        SELECT queryid, query, calls,
          round(total_time::numeric, 2) AS total_time_ms,
          round(mean_time::numeric, 2) AS avg_time_ms,
          rows, shared_blks_hit, shared_blks_read
        FROM pg_stat_statements
        WHERE query NOT LIKE '%pg_stat_statements%'
        ORDER BY total_time DESC LIMIT 50
      `);
      return { available: true, queries: res.rows };
    } catch (e2: any) {
      return { available: false, queries: [], message: e2.message };
    }
  }
}

// ─── 7. ER DIAGRAM DATA ───
export async function getERDiagram(connectionId: string, schema: string) {
  const pool = getPool(connectionId);
  if (!pool) throw new Error('Not connected');

  const tablesRes = await pool.query(`
    SELECT table_name AS name
    FROM information_schema.tables
    WHERE table_schema = $1 AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `, [schema]);

  const columnsRes = await pool.query(`
    SELECT table_name, column_name, data_type, is_nullable,
           CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END AS is_pk
    FROM information_schema.columns c
    LEFT JOIN (
      SELECT ku.table_name, ku.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage ku ON tc.constraint_name = ku.constraint_name AND tc.table_schema = ku.table_schema
      WHERE tc.table_schema = $1 AND tc.constraint_type = 'PRIMARY KEY'
    ) pk ON c.table_name = pk.table_name AND c.column_name = pk.column_name
    WHERE c.table_schema = $1
    ORDER BY c.table_name, c.ordinal_position
  `, [schema]);

  const fkRes = await pool.query(`
    SELECT
      tc.table_name AS source_table,
      kcu.column_name AS source_column,
      ccu.table_name AS target_table,
      ccu.column_name AS target_column,
      tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
    WHERE tc.table_schema = $1 AND tc.constraint_type = 'FOREIGN KEY'
  `, [schema]);

  // Group columns by table
  const tableMap = new Map<string, any[]>();
  for (const col of columnsRes.rows) {
    if (!tableMap.has(col.table_name)) tableMap.set(col.table_name, []);
    tableMap.get(col.table_name)!.push(col);
  }

  const tables = tablesRes.rows.map(t => ({
    name: t.name,
    columns: tableMap.get(t.name) || [],
  }));

  return { tables, relationships: fkRes.rows };
}

// ─── 8. VACUUM TABLE ───
export async function vacuumTable(connectionId: string, schema: string, table: string) {
  const pool = getPool(connectionId);
  if (!pool) throw new Error('Not connected');
  const q = `VACUUM ANALYZE "${schema.replace(/"/g, '""')}"."${table.replace(/"/g, '""')}"`;
  await pool.query(q);
  return { success: true, message: `VACUUM ANALYZE completed on "${schema}"."${table}"` };
}

// ─── 9. ROW EDIT ───
export async function getPrimaryKeyColumns(connectionId: string, schema: string, table: string) {
  const pool = getPool(connectionId);
  if (!pool) throw new Error('Not connected');
  const res = await pool.query(`
    SELECT ku.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage ku ON tc.constraint_name = ku.constraint_name AND tc.table_schema = ku.table_schema
    WHERE tc.table_schema = $1 AND tc.table_name = $2 AND tc.constraint_type = 'PRIMARY KEY'
    ORDER BY ku.ordinal_position
  `, [schema, table]);
  return res.rows.map(r => r.column_name);
}
