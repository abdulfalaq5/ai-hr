import Docker from 'dockerode';
import { config } from '../config/index.js';
import { DockerContainer, DockerContainerStats, ToolResult } from '../types/index.js';

// Docker daemon connection via socket (read-only mount)
const docker = new Docker({ socketPath: config.host.dockerSock });

export async function getDockerContainers(): Promise<ToolResult<DockerContainer[]>> {
  try {
    const containers = await docker.listContainers({ all: true });
    
    const formatted = containers.map((c) => {
      const ports = c.Ports.map(p => `${p.PublicPort || p.PrivatePort}/${p.Type}`).filter(Boolean);
      const networks = Object.keys(c.NetworkSettings?.Networks || {});

      return {
        id: c.Id.substring(0, 12),
        name: c.Names[0]?.replace('/', '') || 'unknown',
        image: c.Image,
        status: c.Status,
        state: c.State,
        created: new Date(c.Created * 1000).toISOString(),
        ports,
        networks,
      };
    });

    return {
      success: true,
      timestamp: new Date().toISOString(),
      data: formatted,
    };
  } catch (error: any) {
    return {
      success: false,
      timestamp: new Date().toISOString(),
      error: `Docker API Error: ${error.message}. Ensure ${config.host.dockerSock} is mounted.`,
    };
  }
}

export async function getDockerStats(): Promise<ToolResult<DockerContainerStats[]>> {
  try {
    const containers = await docker.listContainers({ all: false }); // only running
    const statsPromises = containers.map(async (c) => {
      const container = docker.getContainer(c.Id);
      const stats = await container.stats({ stream: false });

      // Calculate CPU percent (Docker approach)
      const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - (stats.precpu_stats?.cpu_usage?.total_usage || 0);
      const systemDelta = stats.cpu_stats.system_cpu_usage - (stats.precpu_stats?.system_cpu_usage || 0);
      let cpuPercent = 0.0;
      if (systemDelta > 0.0 && cpuDelta > 0.0) {
        cpuPercent = (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100.0;
      }

      // Memory
      const memUsage = stats.memory_stats.usage || 0;
      const memLimit = stats.memory_stats.limit || 0;
      const memPercent = memLimit > 0 ? (memUsage / memLimit) * 100.0 : 0.0;

      // Network
      let netRx = 0;
      let netTx = 0;
      if (stats.networks) {
        for (const net of Object.values(stats.networks) as any[]) {
          netRx += net.rx_bytes;
          netTx += net.tx_bytes;
        }
      }

      // Block I/O
      let blockRead = 0;
      let blockWrite = 0;
      if (stats.blkio_stats?.io_service_bytes_recursive) {
        for (const io of stats.blkio_stats.io_service_bytes_recursive) {
          if (io.op.toLowerCase() === 'read') blockRead += io.value;
          if (io.op.toLowerCase() === 'write') blockWrite += io.value;
        }
      }

      return {
        id: c.Id.substring(0, 12),
        name: c.Names[0]?.replace('/', '') || 'unknown',
        cpuPercent,
        memoryUsageMb: memUsage / (1024 * 1024),
        memoryLimitMb: memLimit / (1024 * 1024),
        memoryPercent: memPercent,
        netRxMb: netRx / (1024 * 1024),
        netTxMb: netTx / (1024 * 1024),
        blockReadMb: blockRead / (1024 * 1024),
        blockWriteMb: blockWrite / (1024 * 1024),
      };
    });

    const results = await Promise.all(statsPromises);

    return {
      success: true,
      timestamp: new Date().toISOString(),
      data: results,
    };
  } catch (error: any) {
    return {
      success: false,
      timestamp: new Date().toISOString(),
      error: `Docker API Error: ${error.message}. Ensure ${config.host.dockerSock} is mounted.`,
    };
  }
}
