import axios from 'axios';
import { config } from '../config/index.js';
import { RabbitMQStatus, ToolResult } from '../types/index.js';

export async function getRabbitMQStatus(): Promise<ToolResult<RabbitMQStatus>> {
  if (!config.rabbitmq.user || !config.rabbitmq.password) {
    return {
      success: false,
      timestamp: new Date().toISOString(),
      error: 'RabbitMQ monitoring credentials not configured (RABBITMQ_MONITOR_USER / RABBITMQ_MONITOR_PASSWORD)',
    };
  }

  const baseURL = `http://${config.rabbitmq.host}:${config.rabbitmq.port}/api`;
  const auth = {
    username: config.rabbitmq.user,
    password: config.rabbitmq.password,
  };

  try {
    const [overviewRes, nodesRes, queuesRes] = await Promise.all([
      axios.get(`${baseURL}/overview`, { auth, timeout: 5000 }),
      axios.get(`${baseURL}/nodes`, { auth, timeout: 5000 }),
      axios.get(`${baseURL}/queues`, { auth, timeout: 5000 }),
    ]);

    const overview = overviewRes.data;
    const nodes: any[] = nodesRes.data;
    const queues: any[] = queuesRes.data;

    const totalMessages = queues.reduce((sum: number, q: any) => sum + (q.messages || 0), 0);
    const totalReady = queues.reduce((sum: number, q: any) => sum + (q.messages_ready || 0), 0);
    const totalUnacked = queues.reduce((sum: number, q: any) => sum + (q.messages_unacknowledged || 0), 0);
    const totalConsumers = queues.reduce((sum: number, q: any) => sum + (q.consumers || 0), 0);

    return {
      success: true,
      timestamp: new Date().toISOString(),
      data: {
        connected: true,
        version: overview.rabbitmq_version,
        uptimeSeconds: Math.round(overview.erlang_full_version ? (nodes[0]?.uptime || 0) / 1000 : 0),
        totalQueues: queues.length,
        totalMessages,
        totalMessagesReady: totalReady,
        totalMessagesUnacked: totalUnacked,
        consumers: totalConsumers,
        nodes: nodes.map((n: any) => ({
          name: n.name,
          running: n.running,
          memUsedMb: Math.round((n.mem_used || 0) / (1024 * 1024)),
        })),
      },
    };
  } catch (error: any) {
    const msg = error.response
      ? `HTTP ${error.response.status}: ${JSON.stringify(error.response.data)}`
      : error.message;
    return {
      success: false,
      timestamp: new Date().toISOString(),
      data: { connected: false },
      error: `RabbitMQ Management API Error: ${msg}`,
    };
  }
}
