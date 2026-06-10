import { HostReader } from '../services/host-reader.js';
import { CpuUsage, ToolResult } from '../types/index.js';

export async function getCpuUsage(): Promise<ToolResult<CpuUsage>> {
  try {
    // Read /proc/stat
    const statData = await HostReader.readProc('stat');
    const lines = statData.split('\n');
    const cpuLine = lines.find((line) => line.startsWith('cpu '));
    const cpuCores = lines.filter((line) => line.startsWith('cpu') && line !== cpuLine).length;

    if (!cpuLine) {
      throw new Error('Could not parse CPU stats from /proc/stat');
    }

    const parts = cpuLine.trim().split(/\s+/).slice(1).map(Number);
    // user, nice, system, idle, iowait, irq, softirq, steal, guest, guest_nice
    const [user, nice, system, idle, iowait, irq, softirq, steal] = parts;

    const userTime = user + nice;
    const systemTime = system + irq + softirq;
    const idleTime = idle + iowait;
    const totalTime = userTime + systemTime + idleTime + steal;

    // We can't do exact interval diffing without state, so this is since boot.
    // In a real system, you'd calculate diffs over time, but for MCP a snapshot is okay or we fetch loadavg.
    
    // Read /proc/loadavg
    const loadAvgData = await HostReader.readProc('loadavg');
    const [oneMin, fiveMin, fifteenMin] = loadAvgData.trim().split(/\s+/).map(Number);

    return {
      success: true,
      timestamp: new Date().toISOString(),
      data: {
        totalPercent: ((userTime + systemTime) / totalTime) * 100, // Overall since boot
        userPercent: (userTime / totalTime) * 100,
        systemPercent: (systemTime / totalTime) * 100,
        iowaitPercent: (iowait / totalTime) * 100,
        idlePercent: (idle / totalTime) * 100,
        cores: cpuCores,
        loadAvg: {
          oneMin,
          fiveMin,
          fifteenMin,
        },
      },
    };
  } catch (error: any) {
    return {
      success: false,
      timestamp: new Date().toISOString(),
      error: error.message,
    };
  }
}
