import { HostReader } from '../services/host-reader.js';
import { NginxStatus, ToolResult } from '../types/index.js';
import axios from 'axios';

export async function getNginxStatus(): Promise<ToolResult<NginxStatus>> {
  const result: NginxStatus = { running: false };

  // 1. Check if nginx process exists via /proc
  try {
    const processesDir = await import('fs/promises').then(fs => fs.readdir(`${'/host_proc'}`));
    let nginxPid: number | undefined;

    for (const pidStr of processesDir) {
      if (!/^\d+$/.test(pidStr)) continue;
      try {
        const cmdline = await HostReader.readProc(`${pidStr}/cmdline`);
        if (cmdline.includes('nginx')) {
          nginxPid = parseInt(pidStr, 10);
          break;
        }
      } catch {
        // Process may have ended between listing and reading
        continue;
      }
    }

    if (nginxPid) {
      result.running = true;
      result.pid = nginxPid;
    }
  } catch {
    // /host_proc not accessible or empty — continue to try stub_status
  }

  // 2. Try nginx stub_status endpoint (if nginx is configured to expose it internally)
  // Common setup: nginx exposes /nginx_status on 127.0.0.1:8080 or similar
  const nginxStatusUrls = [
    'http://localhost:8080/nginx_status',
    'http://127.0.0.1:8080/nginx_status',
    'http://nginx/nginx_status',      // if nginx is on docker network
  ];

  for (const url of nginxStatusUrls) {
    try {
      const res = await axios.get(url, { timeout: 3000 });
      if (res.status === 200 && typeof res.data === 'string') {
        // Parse nginx stub_status output:
        // Active connections: 291
        // server accepts handled requests
        //  16630948 16630948 31070465
        // Reading: 6 Writing: 179 Waiting: 106
        const data: string = res.data;
        const activeMatch = data.match(/Active connections:\s*(\d+)/);
        const serverLine = data.match(/\s*(\d+)\s+(\d+)\s+(\d+)/);
        const rwwMatch = data.match(/Reading:\s*(\d+)\s+Writing:\s*(\d+)\s+Waiting:\s*(\d+)/);

        result.running = true;
        result.activeConnections = activeMatch ? parseInt(activeMatch[1], 10) : undefined;
        result.accepts = serverLine ? parseInt(serverLine[1], 10) : undefined;
        result.handled = serverLine ? parseInt(serverLine[2], 10) : undefined;
        result.requests = serverLine ? parseInt(serverLine[3], 10) : undefined;
        result.reading = rwwMatch ? parseInt(rwwMatch[1], 10) : undefined;
        result.writing = rwwMatch ? parseInt(rwwMatch[2], 10) : undefined;
        result.waiting = rwwMatch ? parseInt(rwwMatch[3], 10) : undefined;
        break;
      }
    } catch {
      // Try next URL
      continue;
    }
  }

  return {
    success: true,
    timestamp: new Date().toISOString(),
    data: result,
  };
}
