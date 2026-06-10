import fs from 'fs/promises';
import path from 'path';
import { config } from '../config/index.js';
import { LogEntry, ToolResult } from '../types/index.js';

// Allowed log files/directories — strict allowlist (no path traversal)
const ALLOWED_LOG_PATHS: Record<string, string> = {
  syslog: 'syslog',
  kern: 'kern.log',
  auth: 'auth.log',
  nginx_access: 'nginx/access.log',
  nginx_error: 'nginx/error.log',
  docker: 'docker.log',
  dpkg: 'dpkg.log',
  apt: 'apt/history.log',
  ufw: 'ufw.log',
};

export async function readRecentLogs(params: {
  logFile: string;
  lines?: number;
  filter?: string;
}): Promise<ToolResult<LogEntry>> {
  const { logFile, lines = 100, filter } = params;

  // Validate log file against allowlist
  const relPath = ALLOWED_LOG_PATHS[logFile];
  if (!relPath) {
    return {
      success: false,
      timestamp: new Date().toISOString(),
      error: `Invalid log file "${logFile}". Allowed: ${Object.keys(ALLOWED_LOG_PATHS).join(', ')}`,
    };
  }

  // Clamp lines between 1 and 500
  const safeLines = Math.min(Math.max(1, lines), 500);

  const fullPath = path.join(config.host.logs, relPath);

  // Prevent any path traversal attacks even after allowlist check
  if (!fullPath.startsWith(config.host.logs)) {
    return {
      success: false,
      timestamp: new Date().toISOString(),
      error: 'Path traversal detected — access denied.',
    };
  }

  try {
    // Read last N lines efficiently by reading file in chunks from end
    const fileContent = await fs.readFile(fullPath, 'utf-8');
    const allLines = fileContent.split('\n').filter(Boolean);
    const totalLines = allLines.length;

    let resultLines = allLines.slice(-safeLines);

    // Apply optional filter
    if (filter) {
      resultLines = resultLines.filter((line) =>
        line.toLowerCase().includes(filter.toLowerCase())
      );
    }

    return {
      success: true,
      timestamp: new Date().toISOString(),
      data: {
        file: fullPath,
        lines: resultLines,
        totalLines,
        readLines: resultLines.length,
      },
    };
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return {
        success: false,
        timestamp: new Date().toISOString(),
        error: `Log file not found: ${fullPath}. Is /var/log mounted at /host_logs?`,
      };
    }
    if (error.code === 'EACCES') {
      return {
        success: false,
        timestamp: new Date().toISOString(),
        error: `Permission denied reading ${fullPath}. Ensure container user has read access.`,
      };
    }
    return {
      success: false,
      timestamp: new Date().toISOString(),
      error: error.message,
    };
  }
}

export function getAllowedLogFiles(): string[] {
  return Object.keys(ALLOWED_LOG_PATHS);
}
