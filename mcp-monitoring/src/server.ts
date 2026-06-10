// =============================================================================
// MCP Monitoring Server - Main Entry Point
// =============================================================================
// Exposes 11 read-only tools via MCP SDK + HTTP health endpoint
// =============================================================================

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express, { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import crypto from 'crypto';

import { config } from './config/index.js';
import { agentService } from './agent/agent.service.js';
import { getCpuUsage } from './tools/cpu.js';
import { getMemoryUsage } from './tools/memory.js';
import { getDiskUsage } from './tools/disk.js';
import { getNetworkStatus } from './tools/network.js';
import { getDockerContainers, getDockerStats } from './tools/docker.js';
import { getPostgresStatus } from './tools/postgres.js';
import { getRabbitMQStatus } from './tools/rabbitmq.js';
import { getNginxStatus } from './tools/nginx.js';
import { getCloudflaredStatus } from './tools/cloudflare.js';
import { readRecentLogs, getAllowedLogFiles } from './tools/logs.js';

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------
const log = {
  info: (msg: string, ...args: unknown[]) => console.log(`[INFO] ${new Date().toISOString()} ${msg}`, ...args),
  warn: (msg: string, ...args: unknown[]) => console.warn(`[WARN] ${new Date().toISOString()} ${msg}`, ...args),
  error: (msg: string, ...args: unknown[]) => console.error(`[ERROR] ${new Date().toISOString()} ${msg}`, ...args),
};

// ---------------------------------------------------------------------------
// MCP Server setup
// ---------------------------------------------------------------------------
function createMcpServer() {
  const server = new McpServer({
    name: 'mcp-monitoring',
    version: '1.0.0',
  });



  // Helper to register tools that require specific roles
  const registerSecuredTool = <T extends Record<string, z.ZodType<any>>>(
    name: string,
    description: string,
    parameters: T,
    handler: (args: { [K in keyof T]: z.infer<T[K]> }) => Promise<unknown>
  ) => {
    server.tool(name, description, parameters, (async (args: any) => {

      try {
        const result = await handler(args);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        log.error(`Error in tool ${name}:`, err.message);
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: err.message }, null, 2) }],
          isError: true,
        };
      }
    }) as any);
  };


  // ---- Tool: get_cpu_usage ---------------------------------------------------
  registerSecuredTool(
    'get_cpu_usage',
    'Read CPU usage statistics from the host including load averages and per-core count. READ-ONLY.',
    {},
    async () => {
      log.info('[tool] get_cpu_usage called');
      return await getCpuUsage();
    }
  );

  // ---- Tool: get_memory_usage ------------------------------------------------
  registerSecuredTool(
    'get_memory_usage',
    'Read memory and swap usage from the host. Returns total, used, free, available, buffers/cache in MB. READ-ONLY.',
    {},
    async () => {
      log.info('[tool] get_memory_usage called');
      return await getMemoryUsage();
    }
  );

  // ---- Tool: get_disk_usage --------------------------------------------------
  registerSecuredTool(
    'get_disk_usage',
    'List mounted disk partitions from the host /proc/mounts. READ-ONLY.',
    {},
    async () => {
      log.info('[tool] get_disk_usage called');
      return await getDiskUsage();
    }
  );

  // ---- Tool: get_network_status ----------------------------------------------
  registerSecuredTool(
    'get_network_status',
    'Read network interface statistics (bytes, packets, errors) from host /proc/net/dev. READ-ONLY.',
    {},
    async () => {
      log.info('[tool] get_network_status called');
      return await getNetworkStatus();
    }
  );

  // ---- Tool: get_docker_containers -------------------------------------------
  registerSecuredTool(
    'get_docker_containers',
    'List all Docker containers (running and stopped) with their status, image, ports, and networks. READ-ONLY.',
    {
      all: z.boolean().optional().default(true).describe('Include stopped containers (default: true)'),
    },
    async () => {
      log.info('[tool] get_docker_containers called');
      return await getDockerContainers();
    }
  );

  // ---- Tool: get_docker_stats ------------------------------------------------
  registerSecuredTool(
    'get_docker_stats',
    'Get live resource stats for all running Docker containers (CPU %, memory, network I/O, block I/O). READ-ONLY.',
    {},
    async () => {
      log.info('[tool] get_docker_stats called');
      return await getDockerStats();
    }
  );

  // ---- Tool: get_postgres_status ---------------------------------------------
  registerSecuredTool(
    'get_postgres_status',
    'Check PostgreSQL connectivity and read status metrics (version, uptime, connections, DB list). READ-ONLY.',
    {},
    async () => {
      log.info('[tool] get_postgres_status called');
      return await getPostgresStatus();
    }
  );

  // ---- Tool: get_rabbitmq_status ---------------------------------------------
  registerSecuredTool(
    'get_rabbitmq_status',
    'Read RabbitMQ cluster status via Management HTTP API (queues, messages, consumers, nodes). READ-ONLY.',
    {},
    async () => {
      log.info('[tool] get_rabbitmq_status called');
      return await getRabbitMQStatus();
    }
  );

  // ---- Tool: get_nginx_status ------------------------------------------------
  registerSecuredTool(
    'get_nginx_status',
    'Check if nginx is running by scanning /proc and reading nginx stub_status endpoint. READ-ONLY.',
    {},
    async () => {
      log.info('[tool] get_nginx_status called');
      return await getNginxStatus();
    }
  );

  // ---- Tool: get_cloudflared_status ------------------------------------------
  registerSecuredTool(
    'get_cloudflared_status',
    'Check Cloudflare tunnel status via Cloudflare API (read-only token required). READ-ONLY.',
    {},
    async () => {
      log.info('[tool] get_cloudflared_status called');
      return await getCloudflaredStatus();
    }
  );

  // ---- Tool: read_recent_logs ------------------------------------------------
  registerSecuredTool(
    'read_recent_logs',
    `Read the last N lines from a host log file. Allowed log files: ${getAllowedLogFiles().join(', ')}. Optional filter string. READ-ONLY.`,
    {
      logFile: z
        .enum(getAllowedLogFiles() as [string, ...string[]])
        .describe(`Log file key. One of: ${getAllowedLogFiles().join(', ')}`),
      lines: z
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .default(100)
        .describe('Number of lines to read from the end of the file (1-500, default 100)'),
      filter: z
        .string()
        .optional()
        .describe('Optional case-insensitive substring filter applied to each line'),
    },
    async ({ logFile, lines, filter }) => {
      log.info('[tool] read_recent_logs called', { logFile, lines, filter });
      return await readRecentLogs({ logFile, lines, filter });
    }
  );


  return server;
}

// ---------------------------------------------------------------------------
// Express HTTP server (health endpoint + MCP transport)
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json());

// Health endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'healthy', service: 'mcp-monitoring', version: '1.0.0' });
});

// MCP endpoint (Streamable HTTP transport)
const sessions = new Map<string, { server: McpServer; transport: StreamableHTTPServerTransport }>();

app.all('/mcp', async (req: Request, res: Response) => {
  const sessionId = req.headers['mcp-session-id'] as string;

  let session = sessionId
    ? sessions.get(sessionId)
    : undefined;

  if (!session) {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
    });

    const serverInstance = createMcpServer();

    transport.onclose = () => {
      if (transport.sessionId) {
        sessions.delete(transport.sessionId);
      }
    };

    await serverInstance.connect(transport);

    session = { server: serverInstance, transport };
  }

  await session.transport.handleRequest(req, res, req.body);

  if (session.transport.sessionId && !sessions.has(session.transport.sessionId)) {
    sessions.set(session.transport.sessionId, session);
  }
});

// ---------------------------------------------------------------------------
// Agent REST endpoint (for AI-SPV forwarding)
// ---------------------------------------------------------------------------
app.post('/ask', async (req: Request, res: Response) => {
  const question = req.body.question;
  if (!question || typeof question !== 'string') {
    res.status(400).json({ error: 'Missing or invalid "question" in request body' });
    return;
  }

  log.info(`[AGENT] Received question: ${question}`);
  
  try {
    const answer = await agentService.ask(question);
    res.json({ answer });
  } catch (error: any) {
    log.error(`[AGENT] Error answering question: ${error.message}`);
    res.status(500).json({ error: 'Internal server error while processing question.' });
  }
});

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not Found' });
});

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  log.error('Unhandled error', err.message);
  res.status(500).json({ error: 'Internal Server Error' });
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
const port = config.server.port;
app.listen(port, '0.0.0.0', () => {
  log.info(`MCP Monitoring Server started on port ${port}`);
  log.info(`Health endpoint: http://0.0.0.0:${port}/health`);
  log.info(`MCP endpoint:    http://0.0.0.0:${port}/mcp`);
  log.info(`Log level:       ${config.server.logLevel}`);
  log.info(`Environment:     ${config.server.nodeEnv}`);
});
