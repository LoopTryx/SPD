import * as os from "node:os";

interface CpuCounters {
  idle: number;
  total: number;
}
export interface SystemAnalytics {
  cpuPercentage: number;
  memoryPercentage: number;
  uptimeSeconds: number;
}

export function calculateCpuUsage(
  previous: CpuCounters,
  current: CpuCounters,
): number {
  const totalDelta = current.total - previous.total;
  if (totalDelta <= 0) return 0;
  return Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (1 - Math.max(0, current.idle - previous.idle) / totalDelta) * 100,
      ),
    ),
  );
}
export function calculateMemoryPercentage(total: number, free: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round(((total - free) / total) * 100)));
}
function sampleCpu(): CpuCounters {
  return os
    .cpus()
    .reduce(
      (result, cpu) => ({
        idle: result.idle + cpu.times.idle,
        total:
          result.total +
          Object.values(cpu.times).reduce((sum, value) => sum + value, 0),
      }),
      { idle: 0, total: 0 },
    );
}
export class SystemAnalyticsMonitor {
  private previous = sampleCpu();
  read(): SystemAnalytics {
    const current = sampleCpu();
    const value = {
      cpuPercentage: calculateCpuUsage(this.previous, current),
      memoryPercentage: calculateMemoryPercentage(os.totalmem(), os.freemem()),
      uptimeSeconds: Math.round(os.uptime()),
    };
    this.previous = current;
    return value;
  }
}
let monitor: SystemAnalyticsMonitor | null = null;
export function getSystemAnalyticsMonitor(): SystemAnalyticsMonitor {
  return (monitor ??= new SystemAnalyticsMonitor());
}
