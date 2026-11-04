import { ProjectPartition, LanceMemoryRecord, ScheduledMaintenanceTask, ActiveQueryLog, MaintenanceRunLog } from './types';

// No pre-baked projects. Projects are created dynamically by the administrator.
export const INITIAL_PROJECTS: ProjectPartition[] = [];

// No pre-baked memories. All data is created via the web portal or FastMCP.
export const INITIAL_MEMORIES: LanceMemoryRecord[] = [];

// No pre-baked scheduled tasks.
export const INITIAL_SCHEDULED_TASKS: ScheduledMaintenanceTask[] = [];

// No pre-baked query logs.
export const INITIAL_QUERY_LOGS: ActiveQueryLog[] = [];

// No pre-baked maintenance logs.
export const INITIAL_MAINTENANCE_LOGS: MaintenanceRunLog[] = [];

/**
 * Deterministic pseudo-embedding used by the in-memory mock server when a record
 * has no stored vector, and to fake a query vector. The same seed always returns
 * the same unit-length 768-dimension vector (mulberry32 PRNG).
 */
export function generateSyntheticVector(seed: number, dims = 768): number[] {
  let state = (Math.trunc(Math.abs(seed)) >>> 0) || 1;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
  const vec = Array.from({ length: dims }, () => next() * 2 - 1);
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vec.map(v => v / norm);
}
