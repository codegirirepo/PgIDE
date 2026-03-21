import { getPool } from './connectionManager.js';

export async function getDatabases(connectionId: string) {
  const pool = getPool(connectionId);
  if (!pool) throw new Error('Not connected');
  const res = await pool.query(`
    SELECT datname AS name, pg_database_size(datname) AS size
    FROM pg_database WHERE datistemplate = false ORDER BY datname
  `);
  return res.rows;
}

export async function getSchemas(connectionId: string) {
  const pool = getPool(connectionId);
  if (!pool) throw new Error('Not connected');
  const res = await pool.query(`
    SELECT schema_name AS name FROM information_schema.schemata
    WHERE schema_name NOT IN ('pg_toast','pg_catalog','information_schema')
      AND schema_name NOT LIKE 'pg_temp_%'
      AND schema_name NOT LIKE 'pg_toast_temp_%'
    ORDER BY schema_name
  `);
  return res.rows;
}

export async function getTables(connectionId: string, schema: string) {
  const pool = getPool(connectionId);
  if (!pool) throw new Error('Not connected');
  const res = await pool.query(`
    SELECT table_name AS name, pg_total_relation_size(quote_ident(table_schema)||'.'||quote_ident(table_name)) AS size
    FROM information_schema.tables
    WHERE table_schema = $1 AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `, [schema]);
  return res.rows;
}

export async function getViews(connectionId: string, schema: string) {
  const pool = getPool(connectionId);
  if (!pool) throw new Error('Not connected');
  const res = await pool.query(`
    SELECT table_name AS name FROM information_schema.views
    WHERE table_schema = $1 ORDER BY table_name
  `, [schema]);
  return res.rows;
}

export async function getFunctions(connectionId: string, schema: string) {
  const pool = getPool(connectionId);
  if (!pool) throw new Error('Not connected');
  const res = await pool.query(`
    SELECT p.proname AS name,
           CASE p.prokind WHEN 'f' THEN 'FUNCTION' WHEN 'p' THEN 'PROCEDURE' WHEN 'a' THEN 'AGGREGATE' WHEN 'w' THEN 'WINDOW' END AS type,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = $1
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        JOIN pg_extension e ON d.refobjid = e.oid
        WHERE d.objid = p.oid AND d.deptype = 'e'
      )
    ORDER BY p.proname
  `, [schema]);
  return res.rows;
}

export async function getFunctionDefinition(connectionId: string, schema: string, funcName: string, args: string) {
  const pool = getPool(connectionId);
  if (!pool) throw new Error('Not connected');
  const identifier = args
    ? `"${schema}"."${funcName}"(${args})`
    : `"${schema}"."${funcName}"`;
  const res = await pool.query(`
    SELECT pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = $1 AND p.proname = $2
    ${args ? `AND pg_get_function_identity_arguments(p.oid) = $3` : ''}
    LIMIT 1
  `, args ? [schema, funcName, args] : [schema, funcName]);
  if (res.rows.length === 0) throw new Error(`Function ${identifier} not found`);
  return res.rows[0].definition;
}

export async function getColumns(connectionId: string, schema: string, table: string) {
  const pool = getPool(connectionId);
  if (!pool) throw new Error('Not connected');
  const res = await pool.query(`
    SELECT c.column_name AS name, c.data_type, c.is_nullable, c.column_default,
           c.character_maximum_length, c.numeric_precision, c.numeric_scale,
           CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END AS is_primary_key
    FROM information_schema.columns c
    LEFT JOIN (
      SELECT ku.column_name FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage ku ON tc.constraint_name = ku.constraint_name
      WHERE tc.table_schema = $1 AND tc.table_name = $2 AND tc.constraint_type = 'PRIMARY KEY'
    ) pk ON c.column_name = pk.column_name
    WHERE c.table_schema = $1 AND c.table_name = $2
    ORDER BY c.ordinal_position
  `, [schema, table]);
  return res.rows;
}

export async function getIndexes(connectionId: string, schema: string, table: string) {
  const pool = getPool(connectionId);
  if (!pool) throw new Error('Not connected');
  const res = await pool.query(`
    SELECT indexname AS name, indexdef AS definition
    FROM pg_indexes WHERE schemaname = $1 AND tablename = $2
    ORDER BY indexname
  `, [schema, table]);
  return res.rows;
}

export async function getConstraints(connectionId: string, schema: string, table: string) {
  const pool = getPool(connectionId);
  if (!pool) throw new Error('Not connected');
  const res = await pool.query(`
    SELECT tc.constraint_name AS name, tc.constraint_type AS type,
           string_agg(kcu.column_name, ', ') AS columns,
           ccu.table_schema AS foreign_schema, ccu.table_name AS foreign_table,
           string_agg(ccu.column_name, ', ') AS foreign_columns
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    LEFT JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
    WHERE tc.table_schema = $1 AND tc.table_name = $2
    GROUP BY tc.constraint_name, tc.constraint_type, ccu.table_schema, ccu.table_name
    ORDER BY tc.constraint_type, tc.constraint_name
  `, [schema, table]);
  return res.rows;
}

export async function getAutocompleteSuggestions(connectionId: string) {
  const pool = getPool(connectionId);
  if (!pool) throw new Error('Not connected');

  const [tables, columns, functions] = await Promise.all([
    pool.query(`
      SELECT table_schema AS schema, table_name AS name, 'table' AS type
      FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema')
      UNION ALL
      SELECT schemaname, viewname, 'view' FROM pg_views WHERE schemaname NOT IN ('pg_catalog','information_schema')
    `),
    pool.query(`
      SELECT table_schema AS schema, table_name, column_name AS name, data_type
      FROM information_schema.columns WHERE table_schema NOT IN ('pg_catalog','information_schema')
    `),
    pool.query(`
      SELECT routine_schema AS schema, routine_name AS name, 'function' AS type
      FROM information_schema.routines WHERE routine_schema NOT IN ('pg_catalog','information_schema')
    `),
  ]);

  return {
    tables: tables.rows,
    columns: columns.rows,
    functions: functions.rows,
  };
}
