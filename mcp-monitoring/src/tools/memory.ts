import { HostReader } from '../services/host-reader.js';
import { MemoryUsage, ToolResult } from '../types/index.js';

export async function getMemoryUsage(): Promise<ToolResult<MemoryUsage>> {
  try {
    const memInfo = await HostReader.readProc('meminfo');
    const lines = memInfo.split('\n');

    const getValue = (key: string): number => {
      const line = lines.find((l) => l.startsWith(`${key}:`));
      if (!line) return 0;
      const parts = line.split(/\s+/);
      // Value in KB, convert to MB
      return Math.round(parseInt(parts[1] || '0', 10) / 1024);
    };

    const totalMb = getValue('MemTotal');
    const freeMb = getValue('MemFree');
    const availableMb = getValue('MemAvailable');
    const buffersMb = getValue('Buffers');
    const cachedMb = getValue('Cached');
    const swapTotalMb = getValue('SwapTotal');
    const swapFreeMb = getValue('SwapFree');

    const buffersCacheMb = buffersMb + cachedMb;
    // Calculate used memory excluding buffers/cache (how much apps are actually using)
    const usedMb = totalMb - freeMb - buffersCacheMb;
    const usedPercent = totalMb > 0 ? (usedMb / totalMb) * 100 : 0;

    const swapUsedMb = swapTotalMb - swapFreeMb;
    const swapFreePercent = swapTotalMb > 0 ? (swapFreeMb / swapTotalMb) * 100 : 0;

    return {
      success: true,
      timestamp: new Date().toISOString(),
      data: {
        totalMb,
        usedMb,
        freeMb,
        availableMb,
        usedPercent,
        buffersCacheMb,
        swapTotalMb,
        swapUsedMb,
        swapFreePercent,
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
