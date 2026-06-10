import { HostReader } from '../services/host-reader.js';
import { NetworkInterface, ToolResult } from '../types/index.js';

export async function getNetworkStatus(): Promise<ToolResult<NetworkInterface[]>> {
  try {
    const netDev = await HostReader.readProc('net/dev');
    const lines = netDev.split('\n').slice(2); // Skip header lines

    const interfaces: NetworkInterface[] = [];

    for (const line of lines) {
      if (line.trim() === '') continue;
      
      const [namePart, ...stats] = line.trim().split(/\s+/);
      const name = namePart.replace(':', '');
      
      if (!name) continue;

      const rxBytes = parseInt(stats[0] || '0', 10);
      const rxPackets = parseInt(stats[1] || '0', 10);
      const rxErrors = parseInt(stats[2] || '0', 10);
      
      const txBytes = parseInt(stats[8] || '0', 10);
      const txPackets = parseInt(stats[9] || '0', 10);
      const txErrors = parseInt(stats[10] || '0', 10);

      interfaces.push({
        name,
        rxBytesTotal: rxBytes,
        txBytesTotal: txBytes,
        rxPacketsTotal: rxPackets,
        txPacketsTotal: txPackets,
        rxErrors,
        txErrors,
        isUp: rxBytes > 0 || txBytes > 0, // simplistic up/down inference
      });
    }

    return {
      success: true,
      timestamp: new Date().toISOString(),
      data: interfaces,
    };
  } catch (error: any) {
    return {
      success: false,
      timestamp: new Date().toISOString(),
      error: error.message,
    };
  }
}
