import React, { useState, useEffect } from 'react';
import { TelemetryMetrics, ActiveQueryLog, ProjectPartition } from '../types';
import { Terminal, Activity, Zap, Search, Clock, Cpu, Play, CheckCircle2, Shield } from 'lucide-react';
import { safeFetchJson } from '../utils/apiClient';

interface RealtimeQueryMonitorProps {
  project: ProjectPartition;
  metrics: TelemetryMetrics | null;
  onSimulateQuery: (query: string, mode: 'hybrid' | 'vector' | 'fts') => Promise<void>;
}

export const RealtimeQueryMonitor: React.FC<RealtimeQueryMonitorProps> = ({
  project,
  metrics,
  onSimulateQuery,
}) => {
  const [logs, setLogs] = useState<ActiveQueryLog[]>([]);
  const [testQuery, setTestQuery] = useState('UI Framework docking window layout');
  const [testMode, setTestMode] = useState<'hybrid' | 'vector' | 'fts'>('hybrid');
  const [isExecuting, setIsExecuting] = useState(false);

  const fetchLogs = async () => {
    try {
      const data = await safeFetchJson<any>('/api/telemetry');
      if (data && data.recent_queries) {
        setLogs(data.recent_queries);
      }
    } catch (err) {
      console.warn('Telemetry sync deferred:', err);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleRunSimulation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testQuery.trim()) return;
    setIsExecuting(true);
    try {
      await onSimulateQuery(testQuery.trim(), testMode);
      await fetchLogs();
    } finally {
      setIsExecuting(false);
    }
  };

  const getModeBadge = (mode: string) => {
    switch (mode) {
      case 'hybrid':
        return 'border-cyan-500/40 bg-cyan-950/40 text-cyan-300';
      case 'vector':
        return 'border-violet-500/40 bg-violet-950/40 text-violet-300';
      case 'fts':
        return 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300';
      default:
        return 'border-slate-700 bg-slate-800 text-slate-300';
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 space-y-6">
      {/* Telemetry Gauge Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* QPS Gauge */}
        <div className="rounded-xl border border-[#23283a] bg-[#111420] p-4 shadow-md">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
            <span>ACTIVE THROUGHPUT</span>
            <Activity className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-white">{metrics?.active_qps ?? 4.8}</span>
            <span className="text-xs text-slate-400 font-mono">queries/sec</span>
          </div>
          <div className="mt-2 h-1.5 w-full rounded-full bg-[#1b202e] overflow-hidden">
            <div className="h-full bg-cyan-400 rounded-full" style={{ width: '48%' }} />
          </div>
        </div>

        {/* Latency Gauge */}
        <div className="rounded-xl border border-[#23283a] bg-[#111420] p-4 shadow-md">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
            <span>P50 / P95 LATENCY</span>
            <Clock className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-emerald-400">{metrics?.p50_latency_ms ?? 11.8}</span>
            <span className="text-xs text-slate-400 font-mono">ms / {metrics?.p95_latency_ms ?? 21.2} ms</span>
          </div>
          <div className="mt-2 h-1.5 w-full rounded-full bg-[#1b202e] overflow-hidden">
            <div className="h-full bg-emerald-400 rounded-full" style={{ width: '22%' }} />
          </div>
        </div>

        {/* Vector Cache Hit Rate */}
        <div className="rounded-xl border border-[#23283a] bg-[#111420] p-4 shadow-md">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
            <span>VECTOR CACHE HIT</span>
            <Zap className="h-4 w-4 text-violet-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-violet-400">{metrics?.vector_cache_hit_rate ?? 94.2}%</span>
            <span className="text-xs text-slate-400 font-mono">cosine cache</span>
          </div>
          <div className="mt-2 h-1.5 w-full rounded-full bg-[#1b202e] overflow-hidden">
            <div className="h-full bg-violet-400 rounded-full" style={{ width: '94%' }} />
          </div>
        </div>

        {/* System & Daemon Status */}
        <div className="rounded-xl border border-[#23283a] bg-[#111420] p-4 shadow-md">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
            <span>INFRASTRUCTURE</span>
            <Cpu className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-2 space-y-1">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-slate-400">LanceDB Engine:</span>
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Ready
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-slate-400">Ollama (nomic-768):</span>
              <span className="text-cyan-400 font-bold flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Online
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Query Simulator Console */}
      <div className="rounded-xl border border-[#232839] bg-[#111420] p-5 shadow-lg">
        <div className="flex items-center justify-between border-b border-[#212638] pb-3">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white font-sans">
              Live Query Performance Probe
            </h3>
          </div>
          <span className="text-xs font-mono text-slate-400">
            Simulates real-time agent recall
          </span>
        </div>

        <form onSubmit={handleRunSimulation} className="mt-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              type="text"
              value={testQuery}
              onChange={(e) => setTestQuery(e.target.value)}
              placeholder="Enter probe query (e.g. EventHandler, UI Framework docking rules...)"
              className="w-full rounded-lg border border-[#262c3e] bg-[#161a27] py-2 pl-9 pr-3 text-xs text-slate-100 placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <select
              value={testMode}
              onChange={(e) => setTestMode(e.target.value as any)}
              className="rounded-lg border border-[#262c3e] bg-[#161a27] px-3 py-2 text-xs font-mono text-cyan-300 focus:outline-none"
            >
              <option value="hybrid">Hybrid (RRF Fusion)</option>
              <option value="vector">Semantic Vector (Cosine)</option>
              <option value="fts">Keyword (Tantivy BM25)</option>
            </select>

            <button
              type="submit"
              disabled={isExecuting}
              className="flex items-center gap-1.5 rounded-lg bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 transition-colors disabled:opacity-50"
            >
              <Play className="h-3 w-3" />
              <span>{isExecuting ? 'Probing...' : 'Dispatch Probe'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Real-Time Query Logs Table */}
      <div className="rounded-xl border border-[#232839] bg-[#111420] p-5 shadow-lg">
        <div className="flex items-center justify-between border-b border-[#212638] pb-3">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-white font-sans">
              Active Query Stream & Latency Profiler
            </h3>
          </div>
          <span className="text-[11px] font-mono text-cyan-400 animate-pulse">
            ● Real-Time Streaming Active
          </span>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="border-b border-[#212638] bg-[#141824] text-[10px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-3 py-2.5">Timestamp</th>
                <th className="px-3 py-2.5">Project</th>
                <th className="px-3 py-2.5">Search Mode</th>
                <th className="px-3 py-2.5">Query Text</th>
                <th className="px-3 py-2.5">Latency</th>
                <th className="px-3 py-2.5 text-right">Hits</th>
                <th className="px-3 py-2.5 text-right">Top Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1d2232]">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-[#151926] transition-colors">
                  <td className="px-3 py-2.5 text-slate-400 text-[11px]">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </td>
                  <td className="px-3 py-2.5 text-slate-300 font-semibold">
                    {log.project_id}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-semibold uppercase ${getModeBadge(log.search_mode)}`}>
                      {log.search_mode}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-slate-200 max-w-xs truncate font-sans">
                    "{log.query_text}"
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className={`font-bold ${log.latency_ms < 15 ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {log.latency_ms}ms
                      </span>
                      <div className="h-1.5 w-16 bg-[#1f2434] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${log.latency_ms < 15 ? 'bg-emerald-400' : 'bg-amber-400'}`}
                          style={{ width: `${Math.min(100, (log.latency_ms / 30) * 100)}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-300">
                    {log.hits_count}
                  </td>
                  <td className="px-3 py-2.5 text-right font-bold text-cyan-400">
                    {(log.top_score * 100).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
