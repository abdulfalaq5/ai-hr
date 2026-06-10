// =============================================================================
// Host Reader Service - Reads proc/sys/log from read-only host mounts
// =============================================================================
import fs from 'fs/promises';
import path from 'path';
import { config } from '../config/index.js';

export class HostReader {
  /**
   * Reads a file from the host's /proc mount
   */
  static async readProc(filename: string): Promise<string> {
    const filepath = path.join(config.host.proc, filename);
    try {
      return await fs.readFile(filepath, 'utf-8');
    } catch (error: any) {
      throw new Error(`Failed to read proc file ${filename}: ${error.message}`);
    }
  }

  /**
   * Reads a file from the host's /sys mount
   */
  static async readSys(filename: string): Promise<string> {
    const filepath = path.join(config.host.sys, filename);
    try {
      return await fs.readFile(filepath, 'utf-8');
    } catch (error: any) {
      throw new Error(`Failed to read sys file ${filename}: ${error.message}`);
    }
  }

  /**
   * Checks if a host mount exists
   */
  static async checkMounts(): Promise<{
    proc: boolean;
    sys: boolean;
    logs: boolean;
    docker: boolean;
  }> {
    const checkDir = async (dir: string) => {
      try {
        const stats = await fs.stat(dir);
        return stats.isDirectory() || stats.isSocket();
      } catch {
        return false;
      }
    };

    return {
      proc: await checkDir(config.host.proc),
      sys: await checkDir(config.host.sys),
      logs: await checkDir(config.host.logs),
      docker: await checkDir(config.host.dockerSock),
    };
  }
}
