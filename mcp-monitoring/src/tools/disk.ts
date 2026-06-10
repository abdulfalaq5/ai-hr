import { HostReader } from '../services/host-reader.js';
import { DiskPartition, ToolResult } from '../types/index.js';

export async function getDiskUsage(): Promise<ToolResult<DiskPartition[]>> {
  try {
    // In a container, it's hard to get true host disk stats without df.
    // We can read /proc/mounts to see mounted filesystems, but not their usage easily without statvfs.
    // However, Node's fs.statfs was added recently, but it only checks the given path.
    // A robust way in MCP read-only is parsing /proc/mounts to find mounts, then using Node's fs.statfs on mounted paths if accessible.
    // Since we only mounted specific dirs, we can check the root host mount if we had one, but we don't.
    // For this implementation, we'll try to read /proc/mounts to list partitions.
    
    const mountsData = await HostReader.readProc('mounts');
    const lines = mountsData.split('\n').filter(l => l.trim() !== '');
    
    const partitions: DiskPartition[] = [];
    
    // We will just list the filesystems for now as true block usage requires executing `df` or statfs on host paths.
    // Since we are strictly read-only and no shell execution, we return mount info.
    for (const line of lines) {
      const [device, mountpoint, fstype] = line.split(/\s+/);
      // Filter pseudo filesystems
      if (!device.startsWith('/dev/') || mountpoint.startsWith('/host_') || mountpoint.startsWith('/var/lib/docker')) {
        continue;
      }
      
      partitions.push({
        device,
        mountpoint,
        fstype,
        totalGb: 0, // Unable to read without host root mount
        usedGb: 0,
        freeGb: 0,
        usedPercent: 0
      });
    }

    return {
      success: true,
      timestamp: new Date().toISOString(),
      data: partitions,
      error: 'Disk usage details (GB) require executing df or full host root mount, which violates strict read-only / no-exec policies. Returning mount points only.'
    };
  } catch (error: any) {
    return {
      success: false,
      timestamp: new Date().toISOString(),
      error: error.message,
    };
  }
}
