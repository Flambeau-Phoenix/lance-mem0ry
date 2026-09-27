export type SemanticBucket = 'fact' | 'decision' | 'constraint' | 'preference' | 'procedure' | 'state';

export type EntityType = 
  | 'Rule' 
  | 'Directive' 
  | 'Preference' 
  | 'Hook' 
  | 'UI Element' 
  | 'Protocol'
  | 'State Schema'
  | 'Config'
  | 'General';

export type MemoryStatus = 'active' | 'archived' | 'deleted';

export interface LanceMemoryRecord {
  record_id: string;
  memory_id: string;
  project_id: string;
  text: string;
  vector?: number[];
  category: string;
  bucket: SemanticBucket;
  symbol: string;
  entity_type: EntityType;
  verified: boolean;
  tags: string[];
  agent_id: string;
  run_id: string;
  source_type: string;
  source_ref: string;
  created_at: string;
  updated_at: string;
  status: MemoryStatus;
  supersedes_id: string;
  importance?: number;
  access_count?: number;
  last_accessed_at?: string;
}

export interface CategoryDefinition {
  description: string;
  bucket: SemanticBucket;
  record_count?: number;
  /** True when records use this category but it is absent from categories.json. */
  unregistered?: boolean;
}

export type ProjectStatus = 'healthy' | 'syncing' | 'maintenance_due' | 'indexed';

export interface ProjectPartition {
  id: string;
  name: string;
  description: string;
  created_at: string;
  total_records: number;
  categories: Record<string, CategoryDefinition>;
  status: ProjectStatus;
  embedding_model: string;
  embedding_dimensions: number;
  fts_index_status: 'ready' | 'rebuilding';
  last_maintenance_at?: string;
  folder_path?: string;
}

export interface ActiveQueryLog {
  id: string;
  timestamp: string;
  project_id: string;
  query_text: string;
  search_mode: 'hybrid' | 'vector' | 'fts';
  latency_ms: number;
  hits_count: number;
  top_score: number;
  agent_caller: string;
  bm25_weight?: number;
  vector_weight?: number;
}

export interface TelemetryMetrics {
  active_qps: number;
  p50_latency_ms: number;
  p95_latency_ms: number;
  total_queries_24h: number;
  ollama_status: 'online' | 'standby' | 'offline';
  lancedb_status: 'online' | 'indexing';
  mcp_status: 'connected' | 'idle';
  dim_size: number;
  vector_cache_hit_rate: number;
  system_memory_mb: number;
}

export interface ScheduledMaintenanceTask {
  id: string;
  name: string;
  description: string;
  project_id?: string;
  frequency: 'hourly' | 'nightly' | 'weekly' | 'on_demand';
  cron_expression: string;
  scope: 'all' | string;
  task_type: 'dedup_scan' | 'blueprint_audit' | 'category_consistency' | 'decay_prune' | 'fts_reindex' | 'token_budget_audit';
  enabled: boolean;
  ai_provider: 'local_ollama' | 'cloud_gemini';
  last_run_at?: string;
  next_run_at: string;
  last_run_status?: 'success' | 'warning' | 'error';
}

export interface MaintenanceRunLog {
  id: string;
  task_id: string;
  task_name: string;
  project_id: string;
  executed_at: string;
  duration_ms: number;
  status: 'success' | 'warning' | 'error';
  ai_provider: 'local_ollama' | 'cloud_gemini';
  findings_count: number;
  summary: string;
  details: string[];
  actions_taken: string[];
}

export interface DuplicateCandidate {
  pair_id: string;
  mem1: LanceMemoryRecord;
  mem2: LanceMemoryRecord;
  cosine_distance: number;
  similarity_pct: number;
  common_tags: string[];
  recommendation: string;
}

export interface ClusterPoint {
  record_id: string;
  memory_id: string;
  text: string;
  symbol: string;
  category: string;
  bucket: SemanticBucket;
  verified: boolean;
  x: number;
  y: number;
}

export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface DatabaseAlert {
  id: string;
  severity: AlertSeverity;
  entityType: 'project' | 'category' | 'record' | 'system';
  entityId: string;
  entityName: string;
  projectId?: string;
  categoryKey?: string;
  title: string;
  message: string;
  missingRequirement: string;
  recommendation: string;
  autoFixable: boolean;
  fixed?: boolean;
}

export interface DatabaseAuditReport {
  timestamp: string;
  status: 'healthy' | 'has_warnings' | 'critical_issues';
  totalAlerts: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  alerts: DatabaseAlert[];
  metrics: {
    totalProjects: number;
    projectsWithMissingDesc: number;
    totalCategories: number;
    categoriesWithMissingDesc: number;
    totalRecords: number;
    recordsLackingSymbolOrTags: number;
  };
}

export interface MCPToolProperty {
  type: string;
  description: string;
  enum?: string[];
  default?: any;
}

export interface MCPToolDefinition {
  name: string;
  description: string;
  category: 'retrieval' | 'storage' | 'context' | 'lifecycle' | 'maintenance';
  inputSchema: {
    type: 'object';
    properties: Record<string, MCPToolProperty>;
    required?: string[];
  };
  sampleArguments: Record<string, any>;
}

export interface MCPServerStatus {
  server_name: string;
  version: string;
  protocol_version: string;
  status: 'online' | 'standby' | 'error';
  transport: string;
  uptime_seconds: number;
  endpoint: string;
  rpc_endpoint: string;
  total_tools: number;
  database_partitions: number;
  total_indexed_memories: number;
  active_clients: Array<{
    client: string;
    transport: string;
    status: string;
  }>;
  capabilities: {
    tools: boolean;
    resources: boolean;
    prompts: boolean;
    logging: boolean;
  };
  config_snippet: Record<string, any>;
}

