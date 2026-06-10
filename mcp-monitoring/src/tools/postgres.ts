import pg from 'pg';
import { config } from '../config/index.js';
import { PostgresStatus, ToolResult } from '../types/index.js';

const { Pool } = pg;

export async function getPostgresStatus(): Promise<ToolResult<PostgresStatus>> {
  // Skip if credentials are not configured
  if (!config.postgres.user || !config.postgres.password) {
    return {
      success: false,
      timestamp: new Date().toISOString(),
      error: 'PostgreSQL monitoring credentials not configured (POSTGRES_MONITOR_USER / POSTGRES_MONITOR_PASSWORD)',
    };
  }

  const pool = new Pool({
    host: config.postgres.host,
    port: config.postgres.port,
    database: config.postgres.database,
    user: config.postgres.user,
    password: config.postgres.password,
    connectionTimeoutMillis: config.postgres.connectionTimeoutMillis,
    max: 1,
    idleTimeoutMillis: 5000,
    statement_timeout: config.postgres.statement_timeout,
    query_timeout: config.postgres.query_timeout,
  });

  const client = await pool.connect().catch((err: Error) => {
    throw new Error(`Connection failed: ${err.message}`);
  });

  try {
    // READ-ONLY queries only
    const [versionRes, uptimeRes, connRes, dbSizeRes, dbListRes] = await Promise.all([
      client.query<{ version: string }>('SELECT version()'),
      client.query<{ uptime: string }>(`SELECT date_trunc('second', current_timestamp - pg_postmaster_start_time()) AS uptime`),
      client.query<{ active: string; max: string }>(`SELECT count(*) FILTER (WHERE state = 'active') AS active, current_setting('max_connections') AS max FROM pg_stat_activity`),
      client.query<{ size: string }>(`SELECT pg_database_size(current_database())::text AS size`),
      client.query<{ datname: string }>(`SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname`),
    ]);

    return {
      success: true,
      timestamp: new Date().toISOString(),
      data: {
        connected: true,
        version: versionRes.rows[0]?.version?.split(' ').slice(0, 2).join(' '),
        uptime: uptimeRes.rows[0]?.uptime,
        activConnections: parseInt(connRes.rows[0]?.active || '0', 10),
        maxConnections: parseInt(connRes.rows[0]?.max || '0', 10),
        dbSizeMb: parseFloat((parseInt(dbSizeRes.rows[0]?.size || '0', 10) / (1024 * 1024)).toFixed(2)),
        databases: dbListRes.rows.map((r) => r.datname),
      },
    };
  } catch (error: any) {
    return {
      success: false,
      timestamp: new Date().toISOString(),
      data: { connected: false },
      error: error.message,
    };
  } finally {
    client.release();
    await pool.end();
  }
}
