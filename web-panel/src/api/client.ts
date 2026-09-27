/**
 * Typed API client for the Lance Memory Web Portal.
 * Talks to the FastMCP server's REST adapter (web_panel_api.py) endpoints.
 */
import type {
  ProjectPartition,
  LanceMemoryRecord,
  CategoryDefinition,
  DatabaseAuditReport,
  TelemetryMetrics,
  DuplicateCandidate,
  ClusterPoint,
  MCPServerStatus,
  MCPToolDefinition,
  SemanticBucket,
  MemoryStatus,
} from '../types';

// ---------------------------------------------------------------------------
// Safe fetch helper (re-exported from utils for backward compatibility)
// ---------------------------------------------------------------------------

export async function safeFetchJson<T>(
  url: string,
  options?: RequestInit,
  retries = 3,
  delayMs = 800,
): Promise<T | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      return (await res.json()) as T;
    } catch (err) {
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
      } else {
        console.warn(`[apiClient] Network request to ${url} deferred:`, err);
        return null;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export async function fetchProjects(): Promise<ProjectPartition[]> {
  const data = await safeFetchJson<ProjectPartition[]>('/api/projects');
  return data ?? [];
}

export async function fetchProject(projectId: string): Promise<ProjectPartition | null> {
  // The backend returns project detail via the list endpoint filtered by id,
  // but we can also use the categories endpoint to get a single project view.
  const projects = await fetchProjects();
  return projects.find((p) => p.id === projectId) ?? null;
}

export async function createProject(name: string, description: string, folderPath?: string): Promise<ProjectPartition> {
  const res = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description, folder_path: folderPath }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to create project');
  }
  return res.json();
}

export async function updateProjectFolder(projectId: string, folderPath: string): Promise<{ project: ProjectPartition }> {
  const res = await fetch(`/api/projects/${projectId}/folder`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder_path: folderPath }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to update folder');
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function fetchCategories(projectId: string): Promise<Record<string, CategoryDefinition>> {
  const project = await fetchProject(projectId);
  return project?.categories ?? {};
}

export async function addCategory(
  projectId: string,
  data: { name: string; description: string; bucket: SemanticBucket },
): Promise<ProjectPartition> {
  const res = await fetch(`/api/projects/${projectId}/categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to add category');
  }
  return res.json();
}

export async function updateCategory(
  projectId: string,
  categoryName: string,
  data: { newName?: string; description?: string; bucket?: SemanticBucket },
): Promise<ProjectPartition> {
  const res = await fetch(`/api/projects/${projectId}/categories/${categoryName}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to update category');
  }
  return res.json();
}

export async function migrateCategory(
  projectId: string,
  category: string,
  targetProjectId: string,
  mode: 'copy' | 'move',
): Promise<{ records_affected: number }> {
  const res = await fetch(`/api/projects/${projectId}/categories/${category}/migrate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target_project_id: targetProjectId, mode }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Migration failed');
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Memories
// ---------------------------------------------------------------------------

export interface MemoryFilters {
  category?: string;
  bucket?: string;
  verified?: boolean;
  status?: MemoryStatus | 'all';
  search?: string;
  limit?: number;
  offset?: number;
  include_vectors?: boolean;
}

export async function fetchMemories(projectId: string, filters?: MemoryFilters): Promise<{
  total: number;
  records: LanceMemoryRecord[];
}> {
  const params = new URLSearchParams();
  if (filters?.category) params.set('category', filters.category);
  if (filters?.bucket) params.set('bucket', filters.bucket);
  if (filters?.verified !== undefined) params.set('verified', String(filters.verified));
  if (filters?.status) params.set('status', filters.status);
  if (filters?.search) params.set('search', filters.search);
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.offset) params.set('offset', String(filters.offset));
  if (filters?.include_vectors) params.set('include_vectors', 'true');

  const qs = params.toString();
  const url = `/api/projects/${projectId}/memories${qs ? `?${qs}` : ''}`;
  const data = await safeFetchJson<{ total: number; records: LanceMemoryRecord[] }>(url);
  return data ?? { total: 0, records: [] };
}

export async function createMemory(
  projectId: string,
  data: {
    text: string;
    category: string;
    symbol?: string;
    entity_type?: string;
    verified?: boolean;
    tags?: string[];
  },
): Promise<LanceMemoryRecord> {
  const res = await fetch(`/api/projects/${projectId}/memories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to create memory');
  }
  return res.json();
}

export async function updateMemory(
  projectId: string,
  recordId: string,
  data: Partial<LanceMemoryRecord>,
): Promise<LanceMemoryRecord> {
  const res = await fetch(`/api/projects/${projectId}/memories/${recordId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to update memory');
  }
  return res.json();
}

export async function deleteMemory(projectId: string, recordId: string): Promise<{ deleted: boolean }> {
  const res = await fetch(`/api/projects/${projectId}/memories/${recordId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to delete memory');
  }
  return res.json();
}

export async function archiveMemory(projectId: string, recordId: string): Promise<LanceMemoryRecord> {
  const res = await fetch(`/api/projects/${projectId}/memories/${recordId}/archive`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to archive memory');
  }
  return res.json();
}

export async function promoteMemory(projectId: string, recordId: string): Promise<LanceMemoryRecord> {
  const res = await fetch(`/api/projects/${projectId}/memories/${recordId}/promote`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to promote memory');
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export async function searchMemories(
  projectId: string,
  query: string,
  mode: 'hybrid' | 'vector' | 'fts' = 'hybrid',
  limit = 30,
): Promise<{ results: LanceMemoryRecord[]; total_matches: number }> {
  const res = await fetch('/api/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: projectId, query, mode, limit }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Search failed');
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Telemetry & Audit
// ---------------------------------------------------------------------------

export async function fetchTelemetry(): Promise<{ metrics: TelemetryMetrics }> {
  const data = await safeFetchJson<{ metrics: TelemetryMetrics }>('/api/telemetry');
  return data ?? {
    metrics: {
      active_qps: 0,
      p50_latency_ms: 0,
      p95_latency_ms: 0,
      total_queries_24h: 0,
      ollama_status: 'offline',
      lancedb_status: 'offline',
      mcp_status: 'idle',
      dim_size: 768,
      vector_cache_hit_rate: 0,
      system_memory_mb: 0,
    },
  };
}

export async function fetchAudit(): Promise<DatabaseAuditReport | null> {
  return safeFetchJson<DatabaseAuditReport>('/api/database/audit');
}

export async function quickFix(params: {
  entityType: 'project' | 'category';
  projectId: string;
  categoryKey?: string;
  description?: string;
  bucket?: string;
}): Promise<{ fixed: boolean; project: ProjectPartition }> {
  const res = await fetch('/api/database/quick-fix', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Quick fix failed');
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Dedup Scan & Clusters
// ---------------------------------------------------------------------------

export async function dedupScan(
  projectId: string,
  threshold = 0.15,
): Promise<{ duplicates: DuplicateCandidate[]; scanned_count: number }> {
  const res = await fetch(`/api/projects/${projectId}/dedup-scan?threshold=${threshold}`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Dedup scan failed');
  }
  return res.json();
}

export async function fetchClusters(projectId: string): Promise<ClusterPoint[]> {
  const data = await safeFetchJson<ClusterPoint[]>(`/api/projects/${projectId}/clusters`);
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Recent Memories
// ---------------------------------------------------------------------------

export async function fetchRecentMemories(limit = 30, projectId?: string): Promise<{
  total: number;
  recent: LanceMemoryRecord[];
}> {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  if (projectId && projectId !== 'all') params.set('project_id', projectId);
  const data = await safeFetchJson<{ total: number; recent: LanceMemoryRecord[] }>(
    `/api/memories/recent?${params.toString()}`,
  );
  return data ?? { total: 0, recent: [] };
}

// ---------------------------------------------------------------------------
// MCP Status & Tools
// ---------------------------------------------------------------------------

export async function fetchMCPStatus(): Promise<MCPServerStatus> {
  const data = await safeFetchJson<MCPServerStatus>('/api/mcp/status');
  return data ?? {
    server_name: 'memory-portal',
    version: '4.0.3',
    protocol_version: '2024-11-05',
    status: 'offline',
    transport: 'streamable-http',
    uptime_seconds: 0,
    endpoint: '/mcp',
    rpc_endpoint: '/api/mcp/execute',
    total_tools: 5,
    database_partitions: 0,
    total_indexed_memories: 0,
    active_clients: [],
    capabilities: { tools: true, resources: false, prompts: false, logging: true },
    config_snippet: {},
  };
}

export async function fetchMCPTools(): Promise<{ tools: MCPToolDefinition[]; count: number }> {
  const data = await safeFetchJson<{ tools: MCPToolDefinition[]; count: number }>('/api/mcp/tools');
  return data ?? { tools: [], count: 0 };
}

export async function executeMCPTool(
  tool: string,
  args: Record<string, unknown>,
): Promise<{ data: unknown; isError: boolean; duration_ms: number }> {
  const res = await fetch('/api/mcp/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool, arguments: args }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'MCP tool execution failed');
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// AI Enhance
// ---------------------------------------------------------------------------

export async function enhanceDescription(
  categoryName: string,
  currentDescription: string,
): Promise<{ suggestion: string }> {
  const res = await fetch('/api/ai/enhance-description', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category_name: categoryName, current_description: currentDescription }),
  });
  if (!res.ok) {
    return { suggestion: currentDescription };
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Maintenance
// ---------------------------------------------------------------------------

export async function fetchMaintenanceTasks(): Promise<{
  tasks: Array<Record<string, unknown>>;
  logs: Array<Record<string, unknown>>;
}> {
  const data = await safeFetchJson<{ tasks: Array<Record<string, unknown>>; logs: Array<Record<string, unknown>> }>(
    '/api/maintenance/tasks',
  );
  return data ?? { tasks: [], logs: [] };
}

// ---------------------------------------------------------------------------
// Simulation (for testing audit alerts)
// ---------------------------------------------------------------------------

export async function simulateMissingRequirement(
  type: 'missing_category_desc' | 'missing_project_desc',
  projectId?: string,
): Promise<{ simulated: boolean }> {
  const res = await fetch('/api/database/simulate-missing-requirement', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, projectId }),
  });
  if (!res.ok) {
    throw new Error('Simulation failed');
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Maintenance Lab (Reindex, Token Estimate, Export/Import)
// ---------------------------------------------------------------------------

export async function reindexProject(projectId: string): Promise<{
  reindexed: boolean;
  project_id: string;
  fts_index_status: string;
  timestamp: string;
}> {
  const res = await fetch(`/api/projects/${projectId}/reindex`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Reindex failed');
  }
  return res.json();
}

export async function tokenEstimate(
  projectId: string,
  text?: string,
): Promise<{
  project_id: string;
  total_records?: number;
  total_estimated_tokens?: number;
  records?: Array<{
    record_id: string;
    memory_id: string;
    text_preview: string;
    estimated_tokens: number;
  }>;
  text?: string;
  estimated_tokens?: number;
  character_count?: number;
}> {
  const res = await fetch(`/api/projects/${projectId}/token-estimate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(text ? { text } : {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Token estimate failed');
  }
  return res.json();
}

export async function exportProject(projectId: string): Promise<{
  project_id: string;
  exported_at: string;
  record_count: number;
  records: LanceMemoryRecord[];
}> {
  const res = await fetch(`/api/projects/${projectId}/export`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Export failed');
  }
  return res.json();
}

export async function importProject(
  projectId: string,
  records: Array<{
    text: string;
    category?: string;
    symbol?: string;
    verified?: boolean;
    bucket?: string;
    tags?: string[];
    agent_id?: string;
    run_id?: string;
    source_type?: string;
    source_ref?: string;
    entity_type?: string;
  }>,
): Promise<{
  project_id: string;
  imported_count: number;
  records: LanceMemoryRecord[];
}> {
  const res = await fetch(`/api/projects/${projectId}/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ records }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Import failed');
  }
  return res.json();
}
