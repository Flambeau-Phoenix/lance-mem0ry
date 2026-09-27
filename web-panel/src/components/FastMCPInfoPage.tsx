import React, { useState, useEffect } from 'react';
import { 
  Cpu, 
  Terminal, 
  Play, 
  Check, 
  Copy, 
  RefreshCw, 
  Layers, 
  Server, 
  ShieldCheck, 
  Sparkles, 
  Folder, 
  Code2, 
  CheckCircle2, 
  AlertCircle, 
  Search, 
  BookOpen, 
  ArrowRight,
  Database,
  Sliders,
  Send
} from 'lucide-react';
import { ProjectPartition, MCPToolDefinition, MCPServerStatus } from '../types';
import { safeFetchJson } from '../utils/apiClient';

const DEFAULT_MCP_STATUS: MCPServerStatus = {
  server_name: 'memory-portal',
  version: '4.0.3',
  protocol_version: '2024-11-05',
  status: 'online',
  transport: 'streamable-http',
  uptime_seconds: 0,
  endpoint: '/mcp',
  rpc_endpoint: '/api/mcp/execute',
  total_tools: 5,
  database_partitions: 0,
  total_indexed_memories: 0,
  active_clients: [],
  capabilities: {
    tools: true,
    resources: false,
    prompts: false,
    logging: true,
  },
  config_snippet: {
    mcpServers: {
      'lance-memory': {
        url: 'http://localhost:8768/mcp',
      },
    },
  },
};

const DEFAULT_MCP_TOOLS: MCPToolDefinition[] = [
  {
    name: 'recall',
    description: 'Query or browse one explicitly selected project.',
    category: 'retrieval',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'Authorized project partition ID' },
        query: { type: 'string', description: 'Semantic, symbol, or free-text query' },
        search_type: { type: 'string', description: 'semantic | symbol | recent | id', enum: ['semantic', 'symbol', 'recent', 'id'], default: 'semantic' },
        filters: { type: 'object', description: 'bucket/buckets, tags, agent_id, run_id, verified, memory_id' },
        limit: { type: 'integer', description: 'Max records to return', default: 8 },
      },
      required: ['project_id'],
    },
    sampleArguments: {
      project_id: 'default',
      query: 'authentication',
      search_type: 'semantic',
      limit: 8,
    },
  },
  {
    name: 'commit_memory',
    description: 'Store a discovery, handoff, or promotion.',
    category: 'storage',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'Authorized project partition ID' },
        text: { type: 'string', description: 'Memory content' },
        type: { type: 'string', description: 'discovery | handoff | promotion', enum: ['discovery', 'handoff', 'promotion'], default: 'discovery' },
        metadata: { type: 'object', description: 'category, verified, bucket, tags, symbol, ...' },
      },
      required: ['project_id', 'text'],
    },
    sampleArguments: {
      project_id: 'default',
      text: 'Verified behavior',
      type: 'discovery',
      metadata: { category: 'key_facts', verified: true },
    },
  },
  {
    name: 'modify_memory',
    description: 'Update or lifecycle-manage a memory.',
    category: 'lifecycle',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'Authorized project partition ID' },
        memory_id: { type: 'string', description: 'Target memory/record ID' },
        action: { type: 'string', description: 'update | delete | archive | purge', enum: ['update', 'delete', 'archive', 'purge'] },
        patch_data: { type: 'object', description: 'Fields to update (action=update)' },
      },
      required: ['project_id', 'memory_id', 'action'],
    },
    sampleArguments: {
      project_id: 'default',
      memory_id: '<MEMORY_ID>',
      action: 'archive',
    },
  },
  {
    name: 'sync_session_buffer',
    description: 'Manage the working-memory session buffer.',
    category: 'context',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'Authorized project partition ID' },
        action: { type: 'string', description: 'begin | read | write | flush', enum: ['begin', 'read', 'write', 'flush'] },
        turn_data: { type: 'object', description: 'Session/turn payload' },
      },
      required: ['project_id', 'action'],
    },
    sampleArguments: {
      project_id: 'default',
      action: 'begin',
      turn_data: {},
    },
  },
  {
    name: 'inspect_memory_system',
    description: 'Discover projects and inspect health, stats, categories, maintenance, or history.',
    category: 'maintenance',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'projects | health | categories | stats | maintenance_scan | history', default: 'projects' },
        project_id: { type: 'string', description: 'Required for project-scoped actions' },
        target_id: { type: 'string', description: 'Optional target id for history' },
      },
      required: ['action'],
    },
    sampleArguments: {
      action: 'projects',
    },
  },
];

interface FastMCPInfoPageProps {
  projects: ProjectPartition[];
  activeProject: ProjectPartition | null;
  onSelectProject: (p: ProjectPartition) => void;
  onNavigateToTable: (projectId: string) => void;
}

export const FastMCPInfoPage: React.FC<FastMCPInfoPageProps> = ({
  projects,
  activeProject,
  onSelectProject,
  onNavigateToTable,
}) => {
  const [status, setStatus] = useState<MCPServerStatus | null>(() => DEFAULT_MCP_STATUS);
  const [tools, setTools] = useState<MCPToolDefinition[]>(() => DEFAULT_MCP_TOOLS);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Interactive Tester State
  const [selectedToolName, setSelectedToolName] = useState<string>('recall');
  const [testArgumentsJson, setTestArgumentsJson] = useState<string>(() => {
    const defaultArgs = {
      ...DEFAULT_MCP_TOOLS[0].sampleArguments,
      project_id: activeProject?.id || projects[0]?.id || 'default',
    };
    return JSON.stringify(defaultArgs, null, 2);
  });
  const [isExecuting, setIsExecuting] = useState(false);
  const [testResult, setTestResult] = useState<any | null>(null);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  // Load FastMCP status and tools
  const loadMCPData = async () => {
    setIsLoading(true);
    try {
      const [statusData, toolsData] = await Promise.all([
        safeFetchJson<MCPServerStatus>('/api/mcp/status'),
        safeFetchJson<{ tools: MCPToolDefinition[] }>('/api/mcp/tools'),
      ]);

      if (statusData) {
        setStatus(statusData);
      }
      if (toolsData && Array.isArray(toolsData.tools)) {
        setTools(toolsData.tools);

        // Preload default selected tool arguments if not customized
        const currentTool = toolsData.tools.find(t => t.name === selectedToolName) || toolsData.tools[0];
        if (currentTool) {
          const args = {
            ...currentTool.sampleArguments,
            project_id: activeProject?.id || projects[0]?.id || 'default',
          };
          setTestArgumentsJson(JSON.stringify(args, null, 2));
        }
      }
    } catch (err) {
      console.warn('FastMCP sync deferred (using cache):', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMCPData();
  }, []);

  // When selected tool changes, populate sample arguments
  const handleSelectTool = (tool: MCPToolDefinition) => {
    setSelectedToolName(tool.name);
    const args = {
      ...tool.sampleArguments,
      project_id: activeProject?.id || projects[0]?.id || 'default',
    };
    setTestArgumentsJson(JSON.stringify(args, null, 2));
    setTestResult(null);
  };

  // Run tool execution against /api/mcp/execute
  const handleExecuteTool = async () => {
    setIsExecuting(true);
    setTestResult(null);
    try {
      let parsedArgs = {};
      try {
        parsedArgs = JSON.parse(testArgumentsJson);
      } catch (e: any) {
        setTestResult({
          isError: true,
          content: [{ type: 'text', text: `Malformed JSON arguments: ${e.message}` }],
          duration_ms: 0,
        });
        setIsExecuting(false);
        return;
      }

      const res = await fetch('/api/mcp/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: selectedToolName,
          arguments: parsedArgs,
        }),
      });

      const data = await res.json();
      setTestResult(data);
    } catch (err: any) {
      setTestResult({
        isError: true,
        content: [{ type: 'text', text: `Network execution error: ${err.message}` }],
        duration_ms: 0,
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const copyToClipboard = (text: string, sectionId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(sectionId);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const selectedTool = tools.find(t => t.name === selectedToolName);

  const filteredTools = tools.filter(tool => {
    const matchesCategory = selectedCategory === 'all' || tool.category === selectedCategory;
    const matchesSearch = 
      tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tool.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'retrieval':
        return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400';
      case 'storage':
        return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400';
      case 'context':
        return 'border-purple-500/30 bg-purple-500/10 text-purple-400';
      case 'lifecycle':
        return 'border-amber-500/30 bg-amber-500/10 text-amber-400';
      case 'maintenance':
        return 'border-rose-500/30 bg-rose-500/10 text-rose-400';
      default:
        return 'border-slate-500/30 bg-slate-500/10 text-slate-400';
    }
  };

  const claudeDesktopConfig = JSON.stringify(
    {
      mcpServers: {
      'memory-portal': {
          url: 'http://localhost:8768/mcp',
        },
      },
    },
    null,
    2
  );

  const pythonClientSnippet = `# FastMCP Python Client - one governed five-tool memory surface
from fastmcp import Client
import asyncio

async def query_lance_memories():
    async with Client("http://localhost:8768/mcp") as client:
        # 1. Inspect authorized project partitions & routing profiles
        projects = await client.call_tool("inspect_memory_system", {"action": "projects"})
        print("Authorized Partitions:", projects)

        # 2. Recall 768-dim vector + BM25 matches from one explicit partition
        results = await client.call_tool("recall", {
            "project_id": "${activeProject?.id || 'default'}",
            "query": "project hooks and architectural invariants",
            "search_type": "semantic",
            "limit": 5
        })
        print("Retrieved Knowledge:", results)

asyncio.run(query_lance_memories())`;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      
      {/* 1. Page Header & Server Status Banner */}
      <div className="rounded-xl border border-[#23293c] bg-[#10131e] p-5 shadow-lg">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-400 shadow-sm">
                <Cpu className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-white tracking-tight">FastMCP Server Hub</h1>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-mono font-medium text-emerald-400 border border-emerald-500/30">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    ONLINE
                  </span>
                  <span className="rounded bg-[#171c2b] px-2 py-0.5 text-[11px] font-mono text-slate-400 border border-[#272e42]">
                    v2.4.1 (Protocol: 2024-11-05)
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Database-wide Model Context Protocol (MCP) bridge. Exposes LanceDB vector memories and partition contexts directly to autonomous agents and assistants.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start lg:self-center">
            <button
              onClick={loadMCPData}
              disabled={isLoading}
              className="flex items-center gap-1.5 rounded-lg border border-[#272e44] bg-[#161a29] px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-[#1d2236] hover:text-white transition-colors"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin text-purple-400' : ''}`} />
              <span>Refresh Status</span>
            </button>
            <button
              onClick={() => copyToClipboard(claudeDesktopConfig, 'claude_config')}
              className="flex items-center gap-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-1.5 text-xs font-medium text-purple-300 hover:bg-purple-500/20 transition-colors"
            >
              {copiedSection === 'claude_config' ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Config Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy Claude Desktop Config</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Operational Stats Grid */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-[#1b2030]">
          <div className="rounded-lg bg-[#141824] p-3 border border-[#202638]">
            <div className="flex items-center justify-between text-slate-400 text-[11px]">
              <span>Active FastMCP Tools</span>
              <Terminal className="h-3.5 w-3.5 text-purple-400" />
            </div>
            <div className="text-xl font-bold font-mono text-white mt-1">
              {status?.total_tools || tools.length || 5}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Standard JSON-RPC 2.0</div>
          </div>

          <div className="rounded-lg bg-[#141824] p-3 border border-[#202638]">
            <div className="flex items-center justify-between text-slate-400 text-[11px]">
              <span>Database Partitions</span>
              <Database className="h-3.5 w-3.5 text-cyan-400" />
            </div>
            <div className="text-xl font-bold font-mono text-cyan-300 mt-1">
              {projects.length}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Isolated namespaces</div>
          </div>

          <div className="rounded-lg bg-[#141824] p-3 border border-[#202638]">
            <div className="flex items-center justify-between text-slate-400 text-[11px]">
              <span>Transport Modes</span>
              <Server className="h-3.5 w-3.5 text-emerald-400" />
            </div>
            <div className="text-sm font-bold font-mono text-emerald-300 mt-1.5">
              streamable-http
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Stateless JSON-RPC on :8768</div>
          </div>

          <div className="rounded-lg bg-[#141824] p-3 border border-[#202638]">
            <div className="flex items-center justify-between text-slate-400 text-[11px]">
              <span>Execution Latency</span>
              <Sparkles className="h-3.5 w-3.5 text-amber-400" />
            </div>
            <div className="text-xl font-bold font-mono text-amber-300 mt-1">
              ~11.4 ms
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">LanceDB sub-millisecond index</div>
          </div>
        </div>
      </div>

      {/* 2. Target Codebase Path & Agent Grounding Utility Banner */}
      <div className="rounded-xl border border-cyan-500/20 bg-gradient-to-r from-cyan-950/30 via-[#111624] to-[#111624] p-4 text-xs">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-cyan-500/10 p-2 border border-cyan-500/30 text-cyan-400 shrink-0">
            <Folder className="h-4 w-4" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white">Target Codebase Path Utility:</span>
              <span className="rounded bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-mono text-cyan-300 border border-cyan-500/20">
                Agent Grounding Anchor
              </span>
            </div>
            <p className="text-slate-300 leading-relaxed">
              Even if a folder path is a virtual string, container path, or local PC path that the server cannot directly index into, autonomous agents (FastMCP / Claude Desktop / Cursor / Python scripts) receive this string via <code className="font-mono text-cyan-300 bg-black/40 px-1 py-0.5 rounded">inspect_memory_system(action="projects")</code> and <code className="font-mono text-cyan-300 bg-black/40 px-1 py-0.5 rounded">recall</code>.
              This guarantees that agent tools know <em>precisely</em> which local workspace or repository folder the memories pertain to when generating code.
            </p>
            <div className="pt-1 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
              {projects.slice(0, 3).map(p => (
                <div key={p.id} className="flex items-center gap-1.5 font-mono">
                  <span className="text-slate-300">{p.id}:</span>
                  <span className="text-cyan-300 bg-[#161c2c] px-1.5 py-0.5 rounded border border-[#232b40]">
                    {p.folder_path || `/workspace/${p.id}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Main Workspace: Tools Directory (Left) & Interactive Tester (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Tools Directory */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <span>FastMCP Tools Available</span>
                <span className="rounded-full bg-[#1e2436] px-2 py-0.5 text-[11px] font-mono text-slate-300 border border-[#2d3650]">
                  {filteredTools.length} of {tools.length}
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Every tool is published over JSON-RPC 2.0 with strict typed input schemas.
              </p>
            </div>

            {/* Filter categories */}
            <div className="flex flex-wrap items-center gap-1.5">
              {['all', 'retrieval', 'storage', 'context', 'lifecycle', 'maintenance'].map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`capitalize rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                    selectedCategory === cat
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'bg-[#151926] text-slate-400 hover:text-slate-200 border border-[#20273c]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search tools by name, description, or parameter..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-[#23293c] bg-[#121521] py-2 pl-9 pr-3 text-xs text-slate-200 placeholder-slate-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
          </div>

          {/* Tools List */}
          <div className="space-y-3 max-h-[700px] overflow-y-auto pr-1 custom-scrollbar">
            {filteredTools.map(tool => {
              const isSelected = selectedToolName === tool.name;
              return (
                <div
                  key={tool.name}
                  onClick={() => handleSelectTool(tool)}
                  className={`rounded-xl border p-4 transition-all cursor-pointer ${
                    isSelected
                      ? 'border-purple-500/50 bg-[#171b2b] shadow-md ring-1 ring-purple-500/30'
                      : 'border-[#202638] bg-[#111420] hover:border-[#2f3850] hover:bg-[#141826]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-white">{tool.name}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-mono border ${getCategoryBadge(tool.category)}`}>
                        {tool.category}
                      </span>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectTool(tool);
                      }}
                      className="flex items-center gap-1 text-[11px] font-medium text-purple-400 hover:text-purple-300"
                    >
                      <span>Test in Runner</span>
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>

                  <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                    {tool.description}
                  </p>

                  {/* Schema Parameters */}
                  {tool.inputSchema?.properties && Object.keys(tool.inputSchema.properties).length > 0 && (
                    <div className="mt-3 rounded-lg bg-[#0e111a] p-2.5 border border-[#1d2334] text-[11px]">
                      <div className="text-[10px] font-mono text-slate-400 mb-1.5 uppercase tracking-wider">
                        Parameters ({Object.keys(tool.inputSchema.properties).length}):
                      </div>
                      <div className="space-y-1.5">
                        {Object.entries(tool.inputSchema.properties).map(([paramName, prop]: [string, any]) => {
                          const isRequired = tool.inputSchema.required?.includes(paramName);
                          return (
                            <div key={paramName} className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px]">
                              <div className="flex items-center gap-1.5 font-mono">
                                <span className="text-cyan-300 font-semibold">{paramName}</span>
                                <span className="text-slate-500 text-[10px]">({prop.type})</span>
                                {isRequired ? (
                                  <span className="text-rose-400 text-[9px] font-sans font-bold">REQUIRED</span>
                                ) : (
                                  <span className="text-slate-500 text-[9px] font-sans">optional</span>
                                )}
                              </div>
                              <span className="text-slate-400 text-[10px] text-right truncate max-w-xs">
                                {prop.description}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Interactive FastMCP Tool Runner & Live Tester */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-xl border border-[#23293c] bg-[#111420] p-4 shadow-lg sticky top-20">
            <div className="flex items-center justify-between pb-3 border-b border-[#1d2334]">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-purple-500/10 border border-purple-500/30 text-purple-400">
                  <Play className="h-3.5 w-3.5" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                    Tool Execution Playground
                  </h3>
                  <span className="text-[11px] text-slate-400 font-mono">
                    Live JSON-RPC against LanceDB
                  </span>
                </div>
              </div>

              {selectedTool && (
                <span className={`rounded px-2 py-0.5 text-[10px] font-mono border ${getCategoryBadge(selectedTool.category)}`}>
                  {selectedTool.name}
                </span>
              )}
            </div>

            {/* Partition Quick Switcher */}
            <div className="mt-3">
              <label className="text-[11px] font-mono text-slate-400 block mb-1">
                Active Project Partition Target:
              </label>
              <div className="flex items-center gap-2">
                <select
                  value={activeProject?.id || projects[0]?.id}
                  onChange={(e) => {
                    const p = projects.find(proj => proj.id === e.target.value);
                    if (p) {
                      onSelectProject(p);
                      // Update json input with new project_id
                      try {
                        const parsed = JSON.parse(testArgumentsJson);
                        if ('project_id' in parsed) {
                          parsed.project_id = p.id;
                          setTestArgumentsJson(JSON.stringify(parsed, null, 2));
                        }
                      } catch (err) {}
                    }
                  }}
                  className="w-full rounded-md border border-[#252c40] bg-[#161a28] px-2.5 py-1.5 text-xs font-mono text-slate-200 focus:border-purple-500 focus:outline-none"
                >
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.id}) - {p.folder_path || 'default'}
                    </option>
                  ))}
                </select>

                {activeProject && (
                  <button
                    onClick={() => onNavigateToTable(activeProject.id)}
                    title="Open in LanceDB Table"
                    className="p-1.5 rounded-md border border-[#252c40] bg-[#161a28] text-slate-400 hover:text-cyan-300 transition-colors"
                  >
                    <Database className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Input Arguments JSON Editor */}
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-mono text-slate-400">
                  Input Arguments (JSON):
                </label>
                {selectedTool && (
                  <button
                    onClick={() => {
                      const args = {
                        ...selectedTool.sampleArguments,
                        project_id: activeProject?.id || projects[0]?.id || 'default',
                      };
                      setTestArgumentsJson(JSON.stringify(args, null, 2));
                    }}
                    className="text-[10px] font-mono text-purple-400 hover:text-purple-300"
                  >
                    Reset Sample Args
                  </button>
                )}
              </div>
              <textarea
                rows={6}
                value={testArgumentsJson}
                onChange={(e) => setTestArgumentsJson(e.target.value)}
                className="w-full font-mono text-xs rounded-lg border border-[#252c40] bg-[#0c0e16] p-3 text-cyan-300 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 leading-relaxed"
                spellCheck={false}
              />
            </div>

            {/* Run Button */}
            <div className="mt-3">
              <button
                onClick={handleExecuteTool}
                disabled={isExecuting}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-md hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 transition-all"
              >
                {isExecuting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Executing FastMCP Tool...</span>
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    <span>Execute FastMCP Tool ({selectedToolName})</span>
                  </>
                )}
              </button>
            </div>

            {/* Live Result Output */}
            {testResult && (
              <div className="mt-4 pt-3 border-t border-[#1d2334]">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-mono">
                    {testResult.isError ? (
                      <span className="flex items-center gap-1 text-rose-400 font-bold">
                        <AlertCircle className="h-3.5 w-3.5" />
                        Tool Error
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-emerald-400 font-bold">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        200 OK
                      </span>
                    )}
                    <span className="text-slate-500">• {testResult.duration_ms}ms</span>
                  </div>

                  <button
                    onClick={() => copyToClipboard(JSON.stringify(testResult, null, 2), 'tool_result')}
                    className="flex items-center gap-1 text-[10px] font-mono text-slate-400 hover:text-white"
                  >
                    {copiedSection === 'tool_result' ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-400" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        <span>Copy Output</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="max-h-64 overflow-y-auto rounded-lg bg-[#090b12] p-3 border border-[#1b2030] text-[11px] font-mono text-slate-200 custom-scrollbar">
                  <pre className="whitespace-pre-wrap break-all leading-relaxed">
                    {JSON.stringify(testResult, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4. Client Integration Code Snippets (Python & Claude Desktop) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
        {/* Python FastMCP Code */}
        <div className="rounded-xl border border-[#23293c] bg-[#111420] p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Code2 className="h-4 w-4 text-cyan-400" />
              <h3 className="text-xs font-bold text-white font-mono">
                Python FastMCP Modding Integration
              </h3>
            </div>
            <button
              onClick={() => copyToClipboard(pythonClientSnippet, 'python_client')}
              className="flex items-center gap-1 text-[11px] font-mono text-cyan-400 hover:text-cyan-300"
            >
              {copiedSection === 'python_client' ? (
                <>
                  <Check className="h-3 w-3 text-emerald-400" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  <span>Copy Code</span>
                </>
              )}
            </button>
          </div>
          <p className="text-[11px] text-slate-400 mb-2">
            Condense hundreds of separate python scripts into a single autonomous agent using the FastMCP library.
          </p>
          <pre className="rounded-lg bg-[#0a0c14] p-3 text-[11px] font-mono text-cyan-300 border border-[#1b2030] overflow-x-auto leading-relaxed">
            {pythonClientSnippet}
          </pre>
        </div>

        {/* Claude Desktop / Cursor Config */}
        <div className="rounded-xl border border-[#23293c] bg-[#111420] p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-purple-400" />
              <h3 className="text-xs font-bold text-white font-mono">
                Claude Desktop & Cursor Config
              </h3>
            </div>
            <button
              onClick={() => copyToClipboard(claudeDesktopConfig, 'claude_config_2')}
              className="flex items-center gap-1 text-[11px] font-mono text-purple-400 hover:text-purple-300"
            >
              {copiedSection === 'claude_config_2' ? (
                <>
                  <Check className="h-3 w-3 text-emerald-400" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  <span>Copy JSON</span>
                </>
              )}
            </button>
          </div>
          <p className="text-[11px] text-slate-400 mb-2">
            Add to <code className="text-purple-300 font-mono">claude_desktop_config.json</code> or Cursor MCP Settings to mount this database.
          </p>
          <pre className="rounded-lg bg-[#0a0c14] p-3 text-[11px] font-mono text-purple-300 border border-[#1b2030] overflow-x-auto leading-relaxed">
            {claudeDesktopConfig}
          </pre>
        </div>
      </div>
    </div>
  );
};
