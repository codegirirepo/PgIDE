import pg from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { encrypt, decrypt } from '../utils/encryption.js';

const { Pool, Client } = pg;

export interface ConnectionConfig {
  id?: string;
  name: string;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
}

interface StoredConnection {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  user: string;
  encryptedPassword: string;
  ssl: boolean;
}

interface ActiveConnection {
  pool: pg.Pool;
  config: StoredConnection;
}

const savedConnections = new Map<string, StoredConnection>();
const activePools = new Map<string, ActiveConnection>();
const runningQueries = new Map<string, pg.PoolClient>();

export function saveConnection(config: ConnectionConfig): StoredConnection {
  const id = config.id || uuidv4();
  const stored: StoredConnection = {
    id,
    name: config.name,
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    encryptedPassword: encrypt(config.password),
    ssl: config.ssl || false,
  };
  savedConnections.set(id, stored);
  return stored;
}

export function getSavedConnections(): Omit<StoredConnection, 'encryptedPassword'>[] {
  return Array.from(savedConnections.values()).map(({ encryptedPassword, ...rest }) => rest);
}

export function deleteConnection(id: string): boolean {
  disconnectPool(id);
  return savedConnections.delete(id);
}

export async function testConnection(config: ConnectionConfig): Promise<{ success: boolean; message: string; version?: string }> {
  const client = new Client({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    ssl: config.ssl ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 5000,
  });
  try {
    await client.connect();
    const res = await client.query('SELECT version()');
    await client.end();
    return { success: true, message: 'Connection successful', version: res.rows[0].version };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

export async function connectPool(id: string): Promise<{ success: boolean; message: string }> {
  const stored = savedConnections.get(id);
  if (!stored) return { success: false, message: 'Connection not found' };
  if (activePools.has(id)) return { success: true, message: 'Already connected' };

  const pool = new Pool({
    host: stored.host,
    port: stored.port,
    database: stored.database,
    user: stored.user,
    password: decrypt(stored.encryptedPassword),
    ssl: stored.ssl ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  try {
    const client = await pool.connect();
    client.release();
    activePools.set(id, { pool, config: stored });
    return { success: true, message: 'Connected' };
  } catch (err: any) {
    await pool.end();
    return { success: false, message: err.message };
  }
}

export function disconnectPool(id: string): void {
  const active = activePools.get(id);
  if (active) {
    active.pool.end();
    activePools.delete(id);
  }
}

export function getPool(connectionId: string): pg.Pool | null {
  return activePools.get(connectionId)?.pool || null;
}

export function registerRunningQuery(queryId: string, client: pg.PoolClient): void {
  runningQueries.set(queryId, client);
}

export function cancelRunningQuery(queryId: string): boolean {
  const client = runningQueries.get(queryId);
  if (!client) return false;
  (client as any).connection?.stream?.destroy();
  runningQueries.delete(queryId);
  return true;
}

export function unregisterRunningQuery(queryId: string): void {
  runningQueries.delete(queryId);
}

export function isConnected(id: string): boolean {
  return activePools.has(id);
}

export function getConnectionConfig(id: string): { host: string; port: number; database: string; user: string; password: string } | null {
  const stored = savedConnections.get(id);
  if (!stored) return null;
  return {
    host: stored.host,
    port: stored.port,
    database: stored.database,
    user: stored.user,
    password: decrypt(stored.encryptedPassword),
  };
}
