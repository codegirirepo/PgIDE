import { getPool, getConnectionConfig } from './connectionManager.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

function buildConnEnv(config: any): Record<string, string> {
  return {
    ...process.env as Record<string, string>,
    PGHOST: config.host,
    PGPORT: String(config.port),
    PGDATABASE: config.database,
    PGUSER: config.user,
    PGPASSWORD: config.password || '',
  };
}

// --- SQL Dump (pg_dump) ---
export async function dumpDatabase(connectionId: string, options: {
  schemaOnly?: boolean;
  dataOnly?: boolean;
  tables?: string[];
  schema?: string;
} = {}): Promise<string> {
  const config = getConnectionConfig(connectionId);
  if (!config) throw new Error('Connection not found');

  const args: string[] = ['--format=plain', '--no-owner', '--no-privileges'];
  if (options.schemaOnly) args.push('--schema-only');
  if (options.dataOnly) args.push('--data-only');
  if (options.schema) args.push(`--schema=${options.schema}`);
  if (options.tables?.length) {
    for (const t of options.tables) args.push(`--table=${t}`);
  }

  const env = buildConnEnv(config);

  try {
    const { stdout } = await execAsync(`pg_dump ${args.join(' ')}`, { env, maxBuffer: 100 * 1024 * 1024 });
    return stdout;
  } catch (e: any) {
    throw new Error(`pg_dump failed: ${e.stderr || e.message}`);
  }
}

// --- SQL Import (execute SQL directly via pool) ---
export async function importSQL(connectionId: string, sql: string): Promise<{ success: boolean; message: string }> {
  const pool = getPool(connectionId);
  if (!pool) throw new Error('Not connected');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    return { success: true, message: 'Import completed successfully' };
  } catch (e: any) {
    await client.query('ROLLBACK');
    throw new Error(`Import failed: ${e.message}`);
  } finally {
    client.release();
  }
}

// --- List available schemas for dump ---
export async function getDumpSchemas(connectionId: string): Promise<string[]> {
  const pool = getPool(connectionId);
  if (!pool) throw new Error('Not connected');
  const res = await pool.query(`
    SELECT schema_name FROM information_schema.schemata
    WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
    ORDER BY schema_name
  `);
  return res.rows.map(r => r.schema_name);
}
