import { v4 as uuidv4 } from 'uuid';
import { getPool, registerRunningQuery, unregisterRunningQuery } from './connectionManager.js';

export interface QueryResult {
  queryId: string;
  columns: { name: string; dataType: string }[];
  rows: any[];
  rowCount: number;
  totalRows?: number;
  hasMore?: boolean;
  command: string;
  duration: number;
  error?: string;
}

export interface BatchResult {
  queryId: string;
  results: QueryResult[];
  totalDuration: number;
}

export interface QueryRequest {
  connectionId: string;
  sql: string;
  offset?: number;
  limit?: number;
  timeout?: number;
}

function stripTrailingSemicolon(sql: string): string {
  return sql.replace(/;\s*$/, '').trim();
}

function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inDollarQuote = false;
  let dollarTag = '';
  let i = 0;

  while (i < sql.length) {
    const ch = sql[i];

    // Dollar-quoted strings: $tag$...$tag$
    if (!inSingleQuote && !inDoubleQuote && ch === '$') {
      const tagMatch = sql.slice(i).match(/^\$([a-zA-Z0-9_]*)\$/);
      if (tagMatch) {
        const tag = tagMatch[0];
        if (inDollarQuote && tag === dollarTag) {
          current += tag;
          i += tag.length;
          inDollarQuote = false;
          dollarTag = '';
          continue;
        } else if (!inDollarQuote) {
          inDollarQuote = true;
          dollarTag = tag;
          current += tag;
          i += tag.length;
          continue;
        }
      }
    }

    if (inDollarQuote) {
      current += ch;
      i++;
      continue;
    }

    // Single-quoted strings
    if (ch === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      current += ch;
      i++;
      continue;
    }

    // Double-quoted identifiers
    if (ch === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      current += ch;
      i++;
      continue;
    }

    // Inside a string, just accumulate
    if (inSingleQuote || inDoubleQuote) {
      current += ch;
      i++;
      continue;
    }

    // Line comments
    if (ch === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i);
      if (end === -1) { current += sql.slice(i); break; }
      current += sql.slice(i, end + 1);
      i = end + 1;
      continue;
    }

    // Block comments
    if (ch === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      if (end === -1) { current += sql.slice(i); break; }
      current += sql.slice(i, end + 2);
      i = end + 2;
      continue;
    }

    // Statement separator
    if (ch === ';') {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = '';
      i++;
      continue;
    }

    current += ch;
    i++;
  }

  const trimmed = current.trim();
  if (trimmed) statements.push(trimmed);

  return statements;
}

function detectQueryType(sql: string): 'SELECT' | 'MODIFY' | 'OTHER' {
  const trimmed = sql.trim().toUpperCase();
  if (trimmed.startsWith('SELECT') || trimmed.startsWith('WITH') || trimmed.startsWith('EXPLAIN') || trimmed.startsWith('FETCH') || trimmed.startsWith('TABLE')) return 'SELECT';
  if (trimmed.startsWith('INSERT') || trimmed.startsWith('UPDATE') || trimmed.startsWith('DELETE')) return 'MODIFY';
  return 'OTHER';
}

function hasLimitClause(sql: string): boolean {
  // Strip strings, comments, and dollar-quotes, then check for LIMIT keyword
  const stripped = sql
    .replace(/\$[a-zA-Z0-9_]*\$[\s\S]*?\$[a-zA-Z0-9_]*\$/g, '')
    .replace(/'[^']*'/g, '')
    .replace(/"[^"]*"/g, '')
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  return /\bLIMIT\b/i.test(stripped);
}

const REFCURSOR_OID = 1790;

function isFetchCursor(sql: string): boolean {
  return /^\s*FETCH\b/i.test(sql);
}

function isRefcursorResult(result: any): string[] {
  if (!result.fields || !result.rows?.length) return [];
  const cursors: string[] = [];
  for (const field of result.fields) {
    if (field.dataTypeID === REFCURSOR_OID) {
      for (const row of result.rows) {
        const val = row[field.name];
        if (typeof val === 'string' && val) cursors.push(val);
      }
    }
  }
  return cursors;
}

async function executeSingle(client: any, sql: string, req: QueryRequest, inTransaction: boolean): Promise<QueryResult[]> {
  const start = Date.now();
  try {
    const queryType = detectQueryType(sql);
    const cleanSql = stripTrailingSemicolon(sql);

    // FETCH cursor statements have their own row-count syntax — never append LIMIT/OFFSET
    if (queryType === 'SELECT' && req.limit && !hasLimitClause(cleanSql) && !isFetchCursor(cleanSql)) {
      const fetchLimit = req.limit + 1;
      const paginatedSql = `${cleanSql} LIMIT ${fetchLimit} OFFSET ${req.offset || 0}`;
      const result = await client.query(paginatedSql);

      // Auto-fetch refcursors returned by the query
      const cursors = isRefcursorResult(result);
      if (cursors.length > 0) {
        if (!inTransaction) {
          // Not in a transaction — cursors are already dead. Re-run inside a transaction.
          return await rerunWithTransaction(client, cleanSql, start);
        }
        return await autoFetchCursors(client, result, cursors, start, false);
      }

      const hasMore = result.rows.length > req.limit;
      const rows = hasMore ? result.rows.slice(0, req.limit) : result.rows;
      return [{
        queryId: '',
        columns: result.fields.map((f: any) => ({ name: f.name, dataType: getDataTypeName(f.dataTypeID) })),
        rows,
        rowCount: rows.length,
        hasMore,
        command: result.command,
        duration: Date.now() - start,
      }];
    }

    const result = await client.query(cleanSql);

    // Auto-fetch refcursors
    const cursors = isRefcursorResult(result);
    if (cursors.length > 0) {
      if (!inTransaction) {
        return await rerunWithTransaction(client, cleanSql, start);
      }
      return await autoFetchCursors(client, result, cursors, start, false);
    }

    return [{
      queryId: '',
      columns: result.fields?.map((f: any) => ({ name: f.name, dataType: getDataTypeName(f.dataTypeID) })) || [],
      rows: result.rows || [],
      rowCount: result.rowCount || 0,
      command: result.command,
      duration: Date.now() - start,
    }];
  } catch (err: any) {
    return [{
      queryId: '',
      columns: [],
      rows: [],
      rowCount: 0,
      command: '',
      duration: Date.now() - start,
      error: err.message,
    }];
  }
}

async function autoFetchCursors(client: any, originalResult: any, cursors: string[], start: number, needsTransaction: boolean): Promise<QueryResult[]> {
  const results: QueryResult[] = [];
  let beganTx = false;

  // First result: the original output showing refcursor names
  results.push({
    queryId: '',
    columns: originalResult.fields?.map((f: any) => ({ name: f.name, dataType: getDataTypeName(f.dataTypeID) })) || [],
    rows: originalResult.rows || [],
    rowCount: originalResult.rowCount || 0,
    command: originalResult.command,
    duration: Date.now() - start,
  });

  // Refcursors require an active transaction — if we're not already in one, start one
  if (needsTransaction) {
    try {
      await client.query('BEGIN');
      beganTx = true;
    } catch { /* already in a transaction, that's fine */ }
  }

  // Subsequent results: fetched data from each cursor
  for (const cursor of cursors) {
    try {
      const fetchRes = await client.query(`FETCH ALL FROM "${cursor.replace(/"/g, '""')}"`);
      results.push({
        queryId: '',
        columns: fetchRes.fields?.map((f: any) => ({ name: f.name, dataType: getDataTypeName(f.dataTypeID) })) || [],
        rows: fetchRes.rows || [],
        rowCount: fetchRes.rows?.length || 0,
        command: `FETCH ALL FROM "${cursor}"`,
        duration: Date.now() - start,
      });
    } catch {
      results.push({
        queryId: '',
        columns: [{ name: 'refcursor', dataType: 'refcursor' }],
        rows: [{ refcursor: cursor }],
        rowCount: 1,
        command: originalResult.command,
        duration: Date.now() - start,
        error: `Could not auto-fetch cursor "${cursor}". Use BEGIN before calling the function, then FETCH ALL FROM "${cursor}".`,
      });
    }
  }

  if (beganTx) {
    try { await client.query('COMMIT'); } catch { /* ignore */ }
  }

  return results;
}

async function rerunWithTransaction(client: any, sql: string, start: number): Promise<QueryResult[]> {
  try {
    await client.query('BEGIN');
    const result = await client.query(sql);
    const cursors = isRefcursorResult(result);
    if (cursors.length > 0) {
      // autoFetchCursors already prepends the original refcursor result
      const fetched = await autoFetchCursors(client, result, cursors, start, false);
      await client.query('COMMIT');
      return fetched;
    }
    await client.query('COMMIT');
    return [{
      queryId: '',
      columns: result.fields?.map((f: any) => ({ name: f.name, dataType: getDataTypeName(f.dataTypeID) })) || [],
      rows: result.rows || [],
      rowCount: result.rowCount || 0,
      command: result.command,
      duration: Date.now() - start,
    }];
  } catch (err: any) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    return [{
      queryId: '',
      columns: [],
      rows: [],
      rowCount: 0,
      command: '',
      duration: Date.now() - start,
      error: err.message,
    }];
  }
}

export async function executeQuery(req: QueryRequest): Promise<BatchResult> {
  const pool = getPool(req.connectionId);
  if (!pool) throw new Error('Not connected. Please connect first.');

  const queryId = uuidv4();
  const client = await pool.connect();
  registerRunningQuery(queryId, client);

  const totalStart = Date.now();
  try {
    if (req.timeout) {
      await client.query(`SET statement_timeout = ${req.timeout}`);
    }

    const statements = splitStatements(req.sql);
    const results: QueryResult[] = [];
    let inTransaction = false;

    for (const stmt of statements) {
      const upper = stmt.trim().toUpperCase();
      if (upper === 'BEGIN' || upper.startsWith('BEGIN ') || upper.startsWith('START TRANSACTION')) inTransaction = true;

      const stmtResults = await executeSingle(client, stmt, req, inTransaction);
      for (const result of stmtResults) {
        result.queryId = queryId;
        results.push(result);
        if (result.error) break;
      }
      if (results.some(r => r.error)) break;

      if (upper === 'COMMIT' || upper === 'END' || upper === 'ROLLBACK') inTransaction = false;
    }

    return {
      queryId,
      results,
      totalDuration: Date.now() - totalStart,
    };
  } catch (err: any) {
    return {
      queryId,
      results: [{
        queryId,
        columns: [],
        rows: [],
        rowCount: 0,
        command: '',
        duration: Date.now() - totalStart,
        error: err.message,
      }],
      totalDuration: Date.now() - totalStart,
    };
  } finally {
    unregisterRunningQuery(queryId);
    client.release();
  }
}

const OID_MAP: Record<number, string> = {
  16: 'boolean', 20: 'bigint', 21: 'smallint', 23: 'integer', 25: 'text',
  26: 'oid', 700: 'real', 701: 'double precision', 1042: 'char', 1043: 'varchar',
  1082: 'date', 1083: 'time', 1114: 'timestamp', 1184: 'timestamptz',
  1700: 'numeric', 2950: 'uuid', 3802: 'jsonb', 114: 'json', 1009: 'text[]',
  1007: 'integer[]', 1016: 'bigint[]', 1015: 'varchar[]',
  1790: 'refcursor',
};

function getDataTypeName(oid: number): string {
  return OID_MAP[oid] || `oid:${oid}`;
}
