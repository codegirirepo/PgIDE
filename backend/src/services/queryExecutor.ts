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
  if (trimmed.startsWith('SELECT') || trimmed.startsWith('WITH') || trimmed.startsWith('EXPLAIN')) return 'SELECT';
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

async function executeSingle(client: any, sql: string, req: QueryRequest): Promise<QueryResult> {
  const start = Date.now();
  try {
    const queryType = detectQueryType(sql);
    const cleanSql = stripTrailingSemicolon(sql);

    if (queryType === 'SELECT' && req.limit && !hasLimitClause(cleanSql)) {
      // Fetch limit+1 rows to detect if more rows exist, without expensive COUNT(*)
      const fetchLimit = req.limit + 1;
      const paginatedSql = `${cleanSql} LIMIT ${fetchLimit} OFFSET ${req.offset || 0}`;
      const result = await client.query(paginatedSql);
      const hasMore = result.rows.length > req.limit;
      const rows = hasMore ? result.rows.slice(0, req.limit) : result.rows;
      return {
        queryId: '',
        columns: result.fields.map((f: any) => ({ name: f.name, dataType: getDataTypeName(f.dataTypeID) })),
        rows,
        rowCount: rows.length,
        hasMore,
        command: result.command,
        duration: Date.now() - start,
      };
    }

    const result = await client.query(cleanSql);
    return {
      queryId: '',
      columns: result.fields?.map((f: any) => ({ name: f.name, dataType: getDataTypeName(f.dataTypeID) })) || [],
      rows: result.rows || [],
      rowCount: result.rowCount || 0,
      command: result.command,
      duration: Date.now() - start,
    };
  } catch (err: any) {
    return {
      queryId: '',
      columns: [],
      rows: [],
      rowCount: 0,
      command: '',
      duration: Date.now() - start,
      error: err.message,
    };
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

    for (const stmt of statements) {
      const result = await executeSingle(client, stmt, req);
      result.queryId = queryId;
      results.push(result);
      // Stop on first error
      if (result.error) break;
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
};

function getDataTypeName(oid: number): string {
  return OID_MAP[oid] || `oid:${oid}`;
}
