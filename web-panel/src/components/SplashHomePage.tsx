import React, { useState } from 'react';
import { 
  Database, 
  Sparkles, 
  Layers, 
  Activity, 
  ArrowRight, 
  CheckCircle2, 
  Code2, 
  ShieldCheck, 
  Cpu, 
  Search, 
  BookOpen, 
  Terminal, 
  Copy, 
  Check, 
  AlertTriangle,
  FolderTree,
  Zap
} from 'lucide-react';
import { ProjectPartition, DatabaseAuditReport } from '../types';
import { ActiveNavTab } from './Header';

interface SplashHomePageProps {
  activeProject: ProjectPartition | null;
  projects: ProjectPartition[];
  auditReport: DatabaseAuditReport | null;
  onNavigateTab: (tab: ActiveNavTab) => void;
  onOpenAudit: () => void;
  onOpenNewMemory: () => void;
}

export const SplashHomePage: React.FC<SplashHomePageProps> = ({
  activeProject,
  projects,
  auditReport,
  onNavigateTab,
  onOpenAudit,
  onOpenNewMemory,
}) => {
  const [copiedTab, setCopiedTab] = useState<'python' | 'ts' | 'curl'>('python');
  const [copiedState, setCopiedState] = useState(false);
  const [sandboxQuery, setSandboxQuery] = useState('system architectural invariants');
  const [sandboxResult, setSandboxResult] = useState<any[] | null>(null);
  const [isSandboxSearching, setIsSandboxSearching] = useState(false);

  const copySnippet = (text: string, tab: 'python' | 'ts' | 'curl') => {
    navigator.clipboard.writeText(text);
    setCopiedTab(tab);
    setCopiedState(true);
    setTimeout(() => setCopiedState(false), 2000);
  };

  const handleSandboxSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sandboxQuery.trim()) return;
    setIsSandboxSearching(true);
    try {
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: sandboxQuery.trim(),
          project_id: activeProject?.id || 'default',
          mode: 'hybrid',
          limit: 3,
        }),
      });
      const data = await res.json();
      const results = Array.isArray(data.results) ? data.results : Array.isArray(data) ? data : [];
      setSandboxResult(results);
    } catch (err) {
      console.error('Sandbox search error:', err);
    } finally {
      setIsSandboxSearching(false);
    }
  };

  const pythonCode = `# Autonomous Agent Integration (Python)
import urllib.request
import json

# 1. Hybrid Search (Dense 768d + BM25 keyword)
payload = json.dumps({
    "project_id": "${activeProject?.id || 'default'}",
    "query": "deployment checklist and immutable rules",
    "mode": "hybrid",
    "limit": 5
}).encode('utf-8')

req = urllib.request.Request(
    "http://localhost:8768/api/query",
    data=payload,
    headers={"Content-Type": "application/json"}
)

with urllib.request.urlopen(req) as resp:
    memories = json.loads(resp.read().decode('utf-8'))
    for m in memories.get("results", []):
        print(f"[{m['symbol']}] ({m['bucket']}): {m['text'][:80]}...")`;

  const tsCode = `// Autonomous Agent Integration (TypeScript / Node.js)
import { LanceMemoryRecord } from './types';

// Query LanceDB partition
const res = await fetch('http://localhost:8768/api/query', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    project_id: '${activeProject?.id || 'default'}',
    query: 'system invariants and API configuration',
    mode: 'hybrid', // 'hybrid' | 'vector' | 'fts'
    limit: 5
  })
});

const { results } = await res.json();
console.log('Retrieved memories:', results);`;

  const curlCode = `# REST API Quick Request
curl -X POST http://localhost:8768/api/query \\
  -H "Content-Type: application/json" \\
  -d '{
    "project_id": "${activeProject?.id || 'default'}",
    "query": "verification protocols",
    "mode": "hybrid",
    "limit": 3
  }'`;

  const totalAlerts = auditReport?.totalAlerts ?? 0;
  const isHealthy = totalAlerts === 0;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-12">
      
      {/* 1. Hero / Splash Intro */}
      <div className="relative overflow-hidden rounded-2xl border border-[#23293c] bg-gradient-to-b from-[#111422] to-[#0d0f17] p-6 sm:p-10 shadow-xl">
        <div className="relative z-10 max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-mono text-cyan-300">
            <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
            <span>LanceDB v0.17 • 768-dim Nomic Embeddings</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white font-sans">
            High-Performance Vector Memory Bank for Autonomous AI Agents
          </h1>

          <p className="text-sm sm:text-base text-slate-300 leading-relaxed font-sans">
            <strong className="text-cyan-300">Memory Portal</strong> provides a single, high-performance operational portal and storage engine. It organizes long-term agent memories into isolated LanceDB project partitions, enforces semantic taxonomy (facts, decisions, state), and runs autonomous AI maintenance loops for deduplication and blueprint auditing.
          </p>

          {/* Quick Action CTAs */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              onClick={() => onNavigateTab('table')}
              className="flex items-center gap-2 rounded-xl bg-cyan-500 px-5 py-2.5 text-xs sm:text-sm font-bold text-slate-950 hover:bg-cyan-400 transition-colors shadow-lg shadow-cyan-500/20"
            >
              <span>Explore LanceDB Table</span>
              <ArrowRight className="h-4 w-4" />
            </button>

            <button
              onClick={onOpenAudit}
              className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs sm:text-sm font-medium transition-colors ${
                isHealthy
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                  : 'border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 animate-pulse'
              }`}
            >
              {isHealthy ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span>Database Requirements Verified</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 text-amber-400" />
                  <span>{totalAlerts} Schema Requirements Need Attention</span>
                </>
              )}
            </button>

            <button
              onClick={() => onNavigateTab('maintenance')}
              className="flex items-center gap-2 rounded-xl border border-[#272d40] bg-[#141824] px-4 py-2.5 text-xs sm:text-sm font-medium text-slate-300 hover:bg-[#1a2030] transition-colors"
            >
              <Sparkles className="h-4 w-4 text-amber-400" />
              <span>AI Maintenance Worker</span>
            </button>
          </div>
        </div>

        {/* Decorative Grid Overlay */}
        <div className="absolute right-0 top-0 bottom-0 w-1/3 opacity-10 pointer-events-none hidden md:block bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:16px_16px]" />
      </div>

      {/* 2. Key Architecture Pillars */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight font-sans">
            Core Architecture & Capabilities
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            How Memory Portal guarantees low-latency retrieval and clean agent grounding.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Card 1 */}
          <div className="rounded-xl border border-[#202536] bg-[#10131d] p-5 space-y-2.5 hover:border-cyan-500/40 transition-colors">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Database className="h-4 w-4" />
            </div>
            <h3 className="text-sm font-bold text-white">Project Partitions</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Multi-tenant zero-copy partition tables. Isolates agent scopes (e.g. <code>default-agent</code>, <code>knowledge-base</code>) without cross-contamination.
            </p>
          </div>

          {/* Card 2 */}
          <div className="rounded-xl border border-[#202536] bg-[#10131d] p-5 space-y-2.5 hover:border-violet-500/40 transition-colors">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10 border border-violet-500/30 text-violet-400">
              <Layers className="h-4 w-4" />
            </div>
            <h3 className="text-sm font-bold text-white">The Semantic Triad</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Memories are categorized into <strong>fact</strong> (ratified truths), <strong>decision</strong> (architectural invariants), and <strong>state</strong> (draft blueprints & WIP).
            </p>
          </div>

          {/* Card 3 */}
          <div className="rounded-xl border border-[#202536] bg-[#10131d] p-5 space-y-2.5 hover:border-sky-500/40 transition-colors">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-400">
              <Cpu className="h-4 w-4" />
            </div>
            <h3 className="text-sm font-bold text-white">Dense + Sparse Hybrid</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Blends 768-dim dense cosine embeddings (Nomic) with Tantivy BM25 full-text indexing via Reciprocal Rank Fusion for maximum recall.
            </p>
          </div>

          {/* Card 4 */}
          <div className="rounded-xl border border-[#202536] bg-[#10131d] p-5 space-y-2.5 hover:border-amber-500/40 transition-colors">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Sparkles className="h-4 w-4" />
            </div>
            <h3 className="text-sm font-bold text-white">AI Maintenance Worker</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Background routines continuously scan pairwise cosine distances, flag duplicates, audit unverified blueprints, and compact vector indices.
            </p>
          </div>

        </div>
      </div>

      {/* 3. Interactive LanceDB Query Sandbox */}
      <div className="rounded-2xl border border-[#222738] bg-[#10131d] p-6 space-y-4 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1d2232] pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-cyan-400" />
              <h3 className="text-base font-bold text-white font-sans">
                Interactive LanceDB Vector Query Sandbox
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Test real-time hybrid search against partition: <span className="font-mono text-cyan-300 font-semibold">{activeProject?.id || 'default'}</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigateTab('table')}
              className="text-xs text-cyan-400 hover:text-cyan-300 font-mono flex items-center gap-1"
            >
              <span>View full table ({activeProject?.total_records ?? 0} records)</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSandboxSearch} className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-slate-500" />
            <input
              type="text"
              value={sandboxQuery}
              onChange={(e) => setSandboxQuery(e.target.value)}
              placeholder="Type any semantic concept or keyword (e.g. system rules, memory partitions, API config)..."
              className="w-full rounded-lg border border-[#272d40] bg-[#141824] py-2 pl-9 pr-4 text-xs text-slate-100 placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={isSandboxSearching}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400 transition-colors shrink-0 disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>{isSandboxSearching ? 'Searching...' : 'Run Query'}</span>
          </button>
        </form>

        {/* Query Results Display */}
        {sandboxResult && (
          <div className="space-y-2 pt-2">
            <div className="text-[11px] font-mono text-slate-400">
              Retrieved {sandboxResult.length} nearest neighbors (Cosine + BM25):
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {sandboxResult.map((res: any, idx: number) => (
                <div key={res.record_id || idx} className="rounded-lg border border-[#23293a] bg-[#131724] p-3 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-cyan-300 text-[11px] font-semibold">{res.symbol || res.record_id?.slice(0, 8)}</span>
                    <span className="rounded bg-[#1a1f30] px-1.5 py-0.5 text-[10px] font-mono text-slate-400">
                      {res.bucket}
                    </span>
                  </div>
                  <p className="text-slate-300 line-clamp-3 text-[11px] leading-relaxed">
                    {res.text}
                  </p>
                  <div className="text-[10px] font-mono text-slate-500 pt-1 border-t border-[#1e2334]">
                    score: {res.similarity_score ? (res.similarity_score * 100).toFixed(1) + '%' : 'hybrid match'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 4. Tool Usage & Integration Guide */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight font-sans">
            How to Use & Connect Your Agents
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Plug your Python or TypeScript agent code directly into the Memory Portal REST API.
          </p>
        </div>

        <div className="rounded-2xl border border-[#212638] bg-[#0e111a] overflow-hidden shadow-md">
          {/* Tabs */}
          <div className="flex items-center justify-between border-b border-[#212638] bg-[#121623] px-4 py-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCopiedTab('python')}
                className={`rounded-md px-3 py-1 text-xs font-mono transition-colors ${
                  copiedTab === 'python' ? 'bg-[#1e2336] text-cyan-300 font-bold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Python Client
              </button>
              <button
                onClick={() => setCopiedTab('ts')}
                className={`rounded-md px-3 py-1 text-xs font-mono transition-colors ${
                  copiedTab === 'ts' ? 'bg-[#1e2336] text-cyan-300 font-bold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                TypeScript / Node
              </button>
              <button
                onClick={() => setCopiedTab('curl')}
                className={`rounded-md px-3 py-1 text-xs font-mono transition-colors ${
                  copiedTab === 'curl' ? 'bg-[#1e2336] text-cyan-300 font-bold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                cURL / REST API
              </button>
            </div>

            <button
              onClick={() => {
                const code = copiedTab === 'python' ? pythonCode : copiedTab === 'ts' ? tsCode : curlCode;
                copySnippet(code, copiedTab);
              }}
              className="flex items-center gap-1.5 rounded-md border border-[#293146] bg-[#161a29] px-2.5 py-1 text-xs text-slate-300 hover:bg-[#1d2338] transition-colors"
            >
              {copiedState ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-mono text-[11px]">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 text-slate-400" />
                  <span className="font-mono text-[11px]">Copy Snippet</span>
                </>
              )}
            </button>
          </div>

          {/* Code block */}
          <div className="p-4 font-mono text-xs text-slate-200 overflow-x-auto leading-relaxed bg-[#0c0e15]">
            <pre>
              {copiedTab === 'python' && pythonCode}
              {copiedTab === 'ts' && tsCode}
              {copiedTab === 'curl' && curlCode}
            </pre>
          </div>
        </div>
      </div>

      {/* 5. Database Requirements Guide */}
      <div className="rounded-2xl border border-[#23293c] bg-[#111420] p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-white font-sans flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-400" />
              <span>Database Requirements & Health Principles</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Rules enforced by the continuous auditing engine to prevent hallucination and index degradation.
            </p>
          </div>

          <button
            onClick={onOpenAudit}
            className="flex items-center gap-1.5 rounded-lg bg-[#1a1f30] border border-[#2b334a] px-3.5 py-1.5 text-xs text-cyan-300 hover:bg-[#22283e] transition-colors self-start sm:self-auto"
          >
            <span>Open Requirements Audit Center</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 text-xs">
          <div className="rounded-xl border border-[#212638] bg-[#0c0e15] p-4 space-y-1.5">
            <h4 className="font-bold text-slate-200 font-sans">1. Partition Descriptions</h4>
            <p className="text-slate-400 leading-relaxed">
              Every project partition must have a clear description. Partition router models use this text to select the appropriate vector table during multi-agent sessions.
            </p>
          </div>

          <div className="rounded-xl border border-[#212638] bg-[#0c0e15] p-4 space-y-1.5">
            <h4 className="font-bold text-slate-200 font-sans">2. Category Descriptions & Buckets</h4>
            <p className="text-slate-400 leading-relaxed">
              Every semantic category requires an explicit description and bucket assignment (<code>fact</code>, <code>decision</code>, or <code>state</code>) so memory writers know where to place new items.
            </p>
          </div>

          <div className="rounded-xl border border-[#212638] bg-[#0c0e15] p-4 space-y-1.5">
            <h4 className="font-bold text-slate-200 font-sans">3. 768-Dim Dense Vectors</h4>
            <p className="text-slate-400 leading-relaxed">
              Embeddings must adhere to Nomic 768-dimensional float32 arrays normalized to L2=1.0 for optimal cosine distance calculation.
            </p>
          </div>
        </div>
      </div>

    </div>
  );
};
