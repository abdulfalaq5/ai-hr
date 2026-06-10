// =============================================================================
// Types - Shared TypeScript interfaces and types
// =============================================================================

export interface ToolResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

export interface CpuUsage {
  totalPercent: number;
  userPercent: number;
  systemPercent: number;
  iowaitPercent: number;
  idlePercent: number;
  cores: number;
  loadAvg: {
    oneMin: number;
    fiveMin: number;
    fifteenMin: number;
  };
}

export interface MemoryUsage {
  totalMb: number;
  usedMb: number;
  freeMb: number;
  availableMb: number;
  usedPercent: number;
  buffersCacheMb: number;
  swapTotalMb: number;
  swapUsedMb: number;
  swapFreePercent: number;
}

export interface DiskPartition {
  device: string;
  mountpoint: string;
  fstype: string;
  totalGb: number;
  usedGb: number;
  freeGb: number;
  usedPercent: number;
}

export interface NetworkInterface {
  name: string;
  rxBytesTotal: number;
  txBytesTotal: number;
  rxPacketsTotal: number;
  txPacketsTotal: number;
  rxErrors: number;
  txErrors: number;
  isUp: boolean;
}

export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  created: string;
  ports: string[];
  networks: string[];
}

export interface DockerContainerStats {
  id: string;
  name: string;
  cpuPercent: number;
  memoryUsageMb: number;
  memoryLimitMb: number;
  memoryPercent: number;
  netRxMb: number;
  netTxMb: number;
  blockReadMb: number;
  blockWriteMb: number;
}

export interface PostgresStatus {
  connected: boolean;
  version?: string;
  uptime?: string;
  activConnections?: number;
  maxConnections?: number;
  dbSizeMb?: number;
  databases?: string[];
}

export interface RabbitMQStatus {
  connected: boolean;
  version?: string;
  uptimeSeconds?: number;
  totalQueues?: number;
  totalMessages?: number;
  totalMessagesReady?: number;
  totalMessagesUnacked?: number;
  consumers?: number;
  nodes?: Array<{
    name: string;
    running: boolean;
    memUsedMb: number;
  }>;
}

export interface NginxStatus {
  running: boolean;
  pid?: number;
  activeConnections?: number;
  accepts?: number;
  handled?: number;
  requests?: number;
  reading?: number;
  writing?: number;
  waiting?: number;
  version?: string;
  configTest?: string;
}

export interface CloudflaredStatus {
  running: boolean;
  tunnels?: Array<{
    id: string;
    name: string;
    status: string;
    connections: number;
  }>;
  accountTag?: string;
  error?: string;
}

export interface LogEntry {
  file: string;
  lines: string[];
  totalLines: number;
  readLines: number;
}
