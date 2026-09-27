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
